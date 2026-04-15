import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { panelSlideRight } from '../design/animations';
import tokens from '../design/tokens';

// ─── Module-level session tracker ─────────────────────────────────────────────
// Lives outside the React component so it survives panel open/close cycles
// within the same browser tab. Allows the panel to re-attach to an in-flight
// request when the user closes and immediately reopens the assistant.
const _session = {
  isProcessing: false,
  assistantId: null,
  assistantContent: '',
  pendingApprovals: [],
  // Registered by the active component instance; called by the in-flight reader
  updaters: null,
};

const QUICK_ACTIONS = [
  { label: '📄 Create document', prompt: 'Create a new text document for me' },
  { label: '🌐 Open browser', prompt: 'Open the browser' },
  { label: '🎨 Generate image', prompt: 'Generate an image of ' },
  { label: '🧩 Create app', prompt: 'Create a todo list app for me' },
  { label: '📁 Browse files', prompt: 'Open the file manager' },
  { label: '💻 Open terminal', prompt: 'Open the terminal' },
];

const DEFAULT_TTS_VOICE = 'bf_emma';

export default function ChatPanel({ onClose, onStateChange }) {
  const [messages, setMessages] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);        // continuous hands-free voice mode
  const webSpeechContinuousRef = useRef(null); // separate recognition instance for continuous mode

  const [voiceSupported, setVoiceSupported] = useState(false);
  const [webSpeechSupported, setWebSpeechSupported] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState({ ok: false, whisper: false, tts: false, error: null });
  const [voiceError, setVoiceError] = useState('');
  const [maximized, setMaximized] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const inputShellRef = useRef(null);
  const speechRef = useRef(null);
  const spokenMessageIdsRef = useRef(new Set());
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const vadFrameRef = useRef(null);
  const lastSpeechAtRef = useRef(0);
  const voiceRecorderModeRef = useRef('manual');
  const voiceModeRef = useRef(false);
  const loadingRef = useRef(false);
  const resumeVoiceModeRef = useRef(false);
  const isSpeakingRef = useRef(false);  // true while TTS is playing — mic is muted
  const ttsAudioRef = useRef(null);     // current Kokoro Audio element
  const ttsUtteranceRef = useRef(null); // current Web Speech utterance
  const abortControllerRef = useRef(null); // abort signal for the current SSE request
  const [pendingVoiceSend, setPendingVoiceSend] = useState('');

  // Load history on mount
  useEffect(() => {
    fetch('/api/ai/history')
      .then((r) => r.json())
      .then((d) => {
        const msgs = d.messages || [];
        // Pre-mark ALL historical messages as already spoken so opening the panel
        // never auto-replays the last assistant message via Web Speech or Kokoro.
        msgs.forEach((m) => spokenMessageIdsRef.current.add(m.id));

        if (_session.isProcessing) {
          // Re-attach to an in-flight request started before panel was closed.
          // Show history + a live assistant bubble with whatever content arrived so far.
          setMessages([
            ...msgs,
            { id: _session.assistantId, role: 'assistant', content: _session.assistantContent },
          ]);
          setLoading(true);
          loadingRef.current = true;
          setPendingApprovals(_session.pendingApprovals);
          // Register this component instance as the target for live updates
          _session.updaters = { setMessages, setLoading, setPendingApprovals, onStateChange };
        } else {
          setMessages(msgs);
          // Fetch any pending approvals still waiting on the server
          fetch('/api/ai/pending-approvals')
            .then((r) => r.json())
            .then((d2) => { if (d2.approvals?.length) setPendingApprovals(d2.approvals); })
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Clear stale cached model from localStorage if it no longer exists in Ollama
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((d) => {
        const available = d.models || [];
        const cached = localStorage.getItem('genesis_model');
        if (cached && available.length > 0 && !available.includes(cached)) {
          localStorage.removeItem('genesis_model');
        }
      })
      .catch(() => {});

    const timer = setTimeout(() => inputRef.current?.focus(), 120);

    return () => {
      clearTimeout(timer);
      // Unregister updaters so stale setters aren't called after unmount
      _session.updaters = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs in sync with state for use inside recognition callbacks
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    setVoiceSupported(Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
    setWebSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    let active = true;

    const loadVoiceStatus = async () => {
      try {
        const response = await fetch('/api/ai/voice-status');
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        setVoiceStatus({
          ok: Boolean(data.ok),
          whisper: Boolean(data.whisper),
          tts: Boolean(data.tts),
          error: data.error || null,
        });
      } catch (err) {
        if (!active) return;
        setVoiceStatus({ ok: false, whisper: false, tts: false, error: err.message });
      }
    };

    loadVoiceStatus();
    const timer = setInterval(loadVoiceStatus, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Auto-send once loading finishes if a voice transcript arrived
  useEffect(() => {
    if (pendingVoiceSend && !loading) {
      const text = pendingVoiceSend;
      setPendingVoiceSend('');
      sendMessage(text);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVoiceSend, loading]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setListening(true);
      onStateChange?.('listening');
    };
    recognition.onend = () => {
      setListening(false);
      onStateChange?.('idle');
    };
    recognition.onresult = (event) => {
      if (voiceModeRef.current || isSpeakingRef.current) return;

      const allText = Array.from(event.results)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      setInput(allText);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    recognition.onerror = () => {
      setListening(false);
      onStateChange?.('idle');
    };

    speechRef.current = recognition;
    return () => {
      try { recognition.abort(); } catch {}
      stopTTS();
    };
  }, [onStateChange]);

  const stopVoiceMonitor = useCallback(() => {
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
  }, []);

  const stopVoiceStream = useCallback(() => {
    stopVoiceMonitor();
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, [stopVoiceMonitor]);

  const transcribeBlob = useCallback(async (blob) => {
    const r = await fetch('/api/ai/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || `Transcription failed (${r.status})`);
    }
    const data = await r.json();
    return (data.text || '').trim();
  }, []);

  const ensureVoiceStream = useCallback(async () => {
    if (mediaStreamRef.current) return mediaStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    mediaStreamRef.current = stream;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    }

    return stream;
  }, []);

  // ── Browser-native continuous voice mode (Web Speech API fallback) ────────
  const armContinuousWebSpeech = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Tear down any previous instance
    if (webSpeechContinuousRef.current) {
      try { webSpeechContinuousRef.current.abort(); } catch {}
      webSpeechContinuousRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      onStateChange?.('listening');
    };

    recognition.onresult = (event) => {
      if (!voiceModeRef.current || isSpeakingRef.current || loadingRef.current) return;
      // Collect all NEW final results from this batch
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((r) => r.isFinal)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) {
        setVoiceError('');
        setPendingVoiceSend(transcript);
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' is harmless — restart
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setVoiceError(`Voice error: ${event.error}`);
      setListening(false);
      onStateChange?.('idle');
    };

    recognition.onend = () => {
      if (!voiceModeRef.current) {
        setListening(false);
        onStateChange?.('idle');
        return;
      }
      // Auto-restart to keep continuous mode alive (browser stops after ~60s)
      if (!isSpeakingRef.current && !loadingRef.current) {
        try { recognition.start(); } catch {}
      } else {
        // Retry after TTS/loading finishes
        const retry = setInterval(() => {
          if (!voiceModeRef.current) { clearInterval(retry); return; }
          if (!isSpeakingRef.current && !loadingRef.current) {
            clearInterval(retry);
            try { recognition.start(); } catch {}
          }
        }, 300);
      }
    };

    webSpeechContinuousRef.current = recognition;
    try { recognition.start(); } catch {}
  }, [onStateChange]);

  const armContinuousVoiceLoop = useCallback(async () => {
    if (!voiceModeRef.current) return;
    await ensureVoiceStream();
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume().catch(() => {});
    }

    stopVoiceMonitor();
    const tick = () => {
      if (!voiceModeRef.current) return;

      const analyser = analyserRef.current;
      if (!analyser || loadingRef.current || isSpeakingRef.current) {
        vadFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const sampleBuffer = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(sampleBuffer);
      let sum = 0;
      for (let index = 0; index < sampleBuffer.length; index += 1) {
        const centered = (sampleBuffer[index] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / sampleBuffer.length);
      const now = performance.now();

      if (rms > 0.05) {
        lastSpeechAtRef.current = now;
        if (mediaRecorderRef.current?.state !== 'recording') {
          audioChunksRef.current = [];
          voiceRecorderModeRef.current = 'continuous';
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';
          const recorder = new MediaRecorder(mediaStreamRef.current, mimeType ? { mimeType } : undefined);
          recorder.ondataavailable = (event) => {
            if (event.data?.size) audioChunksRef.current.push(event.data);
          };
          recorder.onstop = async () => {
            const chunks = [...audioChunksRef.current];
            audioChunksRef.current = [];
            mediaRecorderRef.current = null;
            if (!chunks.length) return;
            try {
              const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
              const transcript = await transcribeBlob(blob);
              if (voiceModeRef.current && transcript) {
                setVoiceError('');
                setPendingVoiceSend(transcript);
              }
            } catch (err) {
              setVoiceError(err.message);
              setListening(false);
            }
          };
          mediaRecorderRef.current = recorder;
          recorder.start(250);
          setListening(true);
          onStateChange?.('listening');
        }
      }

      if (
        mediaRecorderRef.current?.state === 'recording'
        && lastSpeechAtRef.current
        && now - lastSpeechAtRef.current > 850
      ) {
        mediaRecorderRef.current.stop();
        setListening(false);
      }

      vadFrameRef.current = requestAnimationFrame(tick);
    };

    setListening(true);
    onStateChange?.('listening');
    vadFrameRef.current = requestAnimationFrame(tick);
  }, [ensureVoiceStream, onStateChange, stopVoiceMonitor, transcribeBlob]);

  // ── Stop TTS and release resources ────────────────────────────────────────
  function stopTTS() {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.src = '';
      ttsAudioRef.current = null;
    }
    if (ttsUtteranceRef.current) {
      window.speechSynthesis?.cancel();
      ttsUtteranceRef.current = null;
    }
  }

  // ── Mute mic: stop recognition, set flag ─────────────────────────────────
  function muteMic() {
    isSpeakingRef.current = true;
    resumeVoiceModeRef.current = false;
    try { speechRef.current?.abort(); } catch {}
    // Pause continuous web speech during TTS playback
    if (webSpeechContinuousRef.current) {
      try { webSpeechContinuousRef.current.abort(); } catch {}
    }
    stopVoiceMonitor();
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setListening(false);
  }

  // ── Unmute mic: clear flag, restart recognition after short delay ─────────
  function unmuteMic() {
    isSpeakingRef.current = false;
    if (voiceModeRef.current) {
      resumeVoiceModeRef.current = true;
      setInput('');
      // Small delay ensures speaker output fully stops before mic opens
      setTimeout(() => {
        if (!isSpeakingRef.current && voiceModeRef.current && !loadingRef.current) {
          const canUseWhisper = voiceStatus.whisper;
          if (canUseWhisper) {
            armContinuousVoiceLoop().catch(() => { armContinuousWebSpeech(); });
          } else {
            armContinuousWebSpeech();
          }
        }
      }, 500);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTTS();
      stopVoiceStream();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const voiceEnabled = localStorage.getItem('genesis_voice') !== 'false';
    if (!voiceEnabled && !voiceMode) return;

    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.content && !message.content.startsWith('Error:'));

    if (!latestAssistant || loading || spokenMessageIdsRef.current.has(latestAssistant.id)) return;
    spokenMessageIdsRef.current.add(latestAssistant.id);

    window.speechSynthesis.cancel();
    const cleanText = latestAssistant.content
      .replace(/!\[.*?\]\(.*?\)/g, 'image generated.')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/#+\s/g, '')
      .slice(0, 800);

    // Split into sentences so each plays sequentially with proper cleanup
    const sentences = cleanText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!sentences.length) sentences.push(cleanText);

    if (voiceStatus.tts) {
      // ── Local Kokoro TTS for both standard voice and continuous voice ─────
      if (voiceMode) muteMic();
      onStateChange?.('speaking');
      let cancelled = false;

      const speakSentences = async (idx) => {
        if (cancelled || idx >= sentences.length) {
          ttsAudioRef.current = null;
          if (voiceMode) unmuteMic(); else onStateChange?.('idle');
          return;
        }
        try {
          const r = await fetch('/api/ai/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sentences[idx], voice: localStorage.getItem('genesis_tts_voice') || DEFAULT_TTS_VOICE }),
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.error || 'TTS unavailable');
          }
          const blob = await r.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          ttsAudioRef.current = audio;
          audio.onended = () => { URL.revokeObjectURL(url); if (!cancelled) speakSentences(idx + 1); };
          audio.onerror = () => { URL.revokeObjectURL(url); if (!cancelled) speakSentences(idx + 1); };
          audio.play().catch(() => { if (!cancelled) speakSentences(idx + 1); });
        } catch (err) {
          // Kokoro down — Web Speech API fallback
          setVoiceError(err.message || 'Voice output unavailable');
          if (cancelled) return;
          if (!window.speechSynthesis) {
            if (voiceMode) unmuteMic(); else onStateChange?.('idle');
            return;
          }
          const remaining = sentences.slice(idx).join(' ');
          const utterance = new SpeechSynthesisUtterance(remaining);
          ttsUtteranceRef.current = utterance;
          utterance.onend = () => {
            ttsUtteranceRef.current = null;
            if (voiceMode) unmuteMic(); else onStateChange?.('idle');
          };
          utterance.onerror = () => {
            ttsUtteranceRef.current = null;
            if (voiceMode) unmuteMic(); else onStateChange?.('idle');
          };
          window.speechSynthesis.speak(utterance);
        }
      };

      speakSentences(0);
      return;
    }

    // ── Standard mode (voice toggle, not continuous): Web Speech API ────────
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 300));
    ttsUtteranceRef.current = utterance;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    onStateChange?.('speaking');
    utterance.onend = () => { ttsUtteranceRef.current = null; onStateChange?.('idle'); };
    utterance.onerror = () => { ttsUtteranceRef.current = null; onStateChange?.('idle'); };
    window.speechSynthesis.speak(utterance);
  }, [messages, loading, onStateChange, voiceMode, voiceStatus.tts]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (textOverride) => {
    const text = (textOverride !== undefined ? textOverride : input).trim();
    if (!text || loading) return;
    setInput('');

    // ─── Slash command interceptor ────────────────────────────────────────────
    if (text.startsWith('/')) {
      const [cmd, ...args] = text.split(/\s+/);
      const cmdLower = cmd.toLowerCase();

      // /new or /reset — clear conversation history
      if (cmdLower === '/new' || cmdLower === '/reset') {
        await fetch('/api/ai/history', { method: 'DELETE' });
        setMessages([{ id: Date.now(), role: 'assistant', content: 'Conversation cleared. Starting fresh.' }]);
        return;
      }

      // /status — show current model and session info
      if (cmdLower === '/status') {
        try {
          const r = await fetch('/api/ai/status');
          const data = await r.json();
          const statusMsg = [
            `**Model:** \`${data.model}\``,
            `**Primary:** \`${data.primaryModel}\``,
            data.fallbackChain.length ? `**Fallbacks:** ${data.fallbackChain.map(m => `\`${m}\``).join(', ')}` : null,
            `**Messages in history:** ${data.messageCount}`,
            `**SOUL.md:** ${data.soulLoaded ? '✓ loaded' : '✗ not found'}`,
            `**AGENTS.md:** ${data.agentsLoaded ? '✓ loaded' : '✗ not found'}`,
          ].filter(Boolean).join('\n');
          setMessages(prev => [...prev,
            { id: Date.now(), role: 'user', content: text },
            { id: Date.now() + 1, role: 'assistant', content: statusMsg },
          ]);
        } catch (e) {
          setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `Status error: ${e.message}` }]);
        }
        return;
      }

      // /compact — summarise and compress history
      if (cmdLower === '/compact') {
        setMessages(prev => [...prev,
          { id: Date.now(), role: 'user', content: text },
          { id: Date.now() + 1, role: 'assistant', content: 'Compacting conversation history…' },
        ]);
        try {
          const r = await fetch('/api/ai/compact', { method: 'POST' });
          const data = await r.json();
          if (data.ok) {
            setMessages([{ id: Date.now(), role: 'assistant', content: `History compacted (${data.messageCount} messages → 1 summary). Context preserved.` }]);
          } else {
            setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `Compact failed: ${data.error || 'Unknown error'}` }]);
          }
        } catch (e) {
          setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `Compact error: ${e.message}` }]);
        }
        return;
      }

      // /think <level> — set reasoning intensity (low/medium/high/none)
      if (cmdLower === '/think') {
        const level = (args[0] || 'medium').toLowerCase();
        const valid = ['none', 'low', 'medium', 'high'];
        if (valid.includes(level)) {
          sessionStorage.setItem('genesis_think', level);
          setMessages(prev => [...prev,
            { id: Date.now(), role: 'user', content: text },
            { id: Date.now() + 1, role: 'assistant', content: `Thinking level set to **${level}**.` },
          ]);
        } else {
          setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `Invalid think level. Use: \`none\`, \`low\`, \`medium\`, \`high\`` }]);
        }
        return;
      }

      // /model <name> — switch active model
      if (cmdLower === '/model') {
        const modelName = args.join(' ').trim();
        if (modelName) {
          localStorage.setItem('genesis_model', modelName);
          setMessages(prev => [...prev,
            { id: Date.now(), role: 'user', content: text },
            { id: Date.now() + 1, role: 'assistant', content: `Model switched to **\`${modelName}\`**. Takes effect on next message.` },
          ]);
        } else {
          const current = localStorage.getItem('genesis_model') || 'default';
          setMessages(prev => [...prev,
            { id: Date.now(), role: 'user', content: text },
            { id: Date.now() + 1, role: 'assistant', content: `Current model: **\`${current}\`**\nUsage: \`/model <model-name>\`` },
          ]);
        }
        return;
      }

      // Unknown slash command — fall through to normal chat
    }
    // ─── End slash command interceptor ───────────────────────────────────────

    const userMsg = { id: Date.now(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    loadingRef.current = true;
    resumeVoiceModeRef.current = false;
    stopVoiceMonitor();
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (voiceModeRef.current) {
      try { speechRef.current?.abort(); } catch {}
      setListening(false);
    }
    onStateChange?.('thinking');

    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    // Set up abort controller for stop button and panel-close propagation
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Register in module-level tracker so a remounted panel can re-attach
    _session.isProcessing = true;
    _session.assistantId = assistantId;
    _session.assistantContent = '';
    _session.pendingApprovals = pendingApprovals.slice();
    _session.updaters = { setMessages, setLoading, setPendingApprovals, onStateChange };

    // Helper: update messages in both React state AND the session tracker
    const appendToken = (token) => {
      _session.assistantContent += token;
      // If this component is still the active one, update its state directly
      // Otherwise, the token already went into _session.assistantContent for re-attach
      const u = _session.updaters;
      if (u) {
        u.setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: m.content + token } : m)
        );
      }
    };

    const addApproval = (action) => {
      _session.pendingApprovals = [
        ..._session.pendingApprovals.filter((a) => a.approvalId !== action.approvalId),
        action,
      ];
      const u = _session.updaters;
      if (u) {
        u.setPendingApprovals((prev) => {
          if (prev.some((item) => item.approvalId === action.approvalId)) return prev;
          return [...prev, action];
        });
      }
    };

    try {
      const selectedModel = localStorage.getItem('genesis_model') || undefined;
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: selectedModel }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      onStateChange?.('speaking');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              appendToken(data.token);
            }
            if (data.action?.type === 'open_app') {
              window._genesisOpenApp?.(data.action.appId, data.action.props || {});
            }
            if (data.action?.type === 'approval_required') {
              addApproval(data.action);
            }
            if (data.action?.type === 'refresh_apps') {
              window._genesisRefreshApps?.();
            }
            if (data.error) {
              throw new Error(data.error);
            }
          } catch (parseErr) {
            // ignore JSON parse errors for individual SSE lines
          }
        }
      }

      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (data.token) appendToken(data.token);
        } catch {}
      }
    } catch (err) {
      const u = _session.updaters;
      const msg = err.name === 'AbortError' ? '⬛ Stopped.' : `Error: ${err.message}`;
      if (u) {
        u.setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: msg } : m)
        );
      }
    } finally {
      _session.isProcessing = false;
      _session.updaters = null;
      abortControllerRef.current = null;
      setLoading(false);
      loadingRef.current = false;
      onStateChange?.('idle');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [input, loading, onStateChange, pendingApprovals]);

  // Stop the in-flight generation immediately
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    _session.isProcessing = false;
    _session.updaters = null;
    setLoading(false);
    loadingRef.current = false;
    onStateChange?.('idle');
  }, [onStateChange]);

  const resolveApproval = useCallback(async (approvalId, approved) => {
    try {
      const endpoint = approved ? '/api/ai/approve' : '/api/ai/reject';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      setPendingApprovals((prev) => prev.filter((item) => item.approvalId !== approvalId));

      if (!approved) {
        setMessages((prev) => [...prev, { id: Date.now(), role: 'assistant', content: 'Cancelled.' }]);
        return;
      }

      if (data.result?.action?.type === 'open_app') {
        window._genesisOpenApp?.(data.result.action.appId, data.result.action.props || {});
      }

      setMessages((prev) => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: data.result?.finalMessage || 'Approved and completed.',
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, { id: Date.now(), role: 'assistant', content: `Error: ${err.message}` }]);
    }
  }, []);

  const toggleVoiceMode = useCallback(() => {
    const next = !voiceMode;
    setVoiceError('');

    // Require at least one voice input method
    const canUseWhisper = voiceSupported && voiceStatus.whisper;
    const canUseWebSpeech = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (next && !canUseWhisper && !canUseWebSpeech) {
      setVoiceError('Voice input is not supported in this browser.');
      return;
    }

    voiceModeRef.current = next;
    resumeVoiceModeRef.current = next;
    setVoiceMode(next);

    if (next) {
      setInput('');
      if (canUseWhisper) {
        // Preferred: VAD + Whisper sidecar
        armContinuousVoiceLoop().catch((err) => {
          // Fall back to Web Speech if VAD fails
          if (canUseWebSpeech) {
            armContinuousWebSpeech();
          } else {
            setVoiceError(err?.message || 'Failed to start continuous voice mode.');
            setListening(false);
            onStateChange?.('idle');
          }
        });
      } else {
        // Fallback: browser Web Speech API
        armContinuousWebSpeech();
      }
    } else {
      resumeVoiceModeRef.current = false;
      setListening(false);
      stopVoiceStream();
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      // Stop web speech continuous session too
      if (webSpeechContinuousRef.current) {
        try { webSpeechContinuousRef.current.abort(); } catch {}
        webSpeechContinuousRef.current = null;
      }
      onStateChange?.('idle');
      window.speechSynthesis?.cancel();
    }
  }, [armContinuousVoiceLoop, armContinuousWebSpeech, onStateChange, stopVoiceStream, voiceMode, voiceSupported, voiceStatus.whisper]);

  const startVoiceInput = useCallback(() => {
    if (voiceModeRef.current) return;
    if (listening) {
      try { speechRef.current?.stop(); } catch {}
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      setListening(false);
      onStateChange?.('idle');
      return;
    }
    setVoiceError('');
    if (voiceStatus.whisper) {
      ensureVoiceStream().then((stream) => {
        audioChunksRef.current = [];
        voiceRecorderModeRef.current = 'manual';
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          audioChunksRef.current = [];
          mediaRecorderRef.current = null;
          try {
            const transcript = await transcribeBlob(blob);
            if (transcript) {
              setInput(transcript);
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          } catch (err) {
            setVoiceError(err.message || 'Voice transcription failed.');
          }
          setListening(false);
          onStateChange?.('idle');
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setListening(true);
        onStateChange?.('listening');
        setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 10_000);
      }).catch((err) => {
        setVoiceError(err?.message || 'Microphone access failed.');
        setListening(false);
        onStateChange?.('idle');
      });
      return;
    }

    if (speechRef.current && !voiceModeRef.current) {
      try { speechRef.current.start(); } catch (err) { setVoiceError(err?.message || 'Voice input failed to start.'); }
    }
  }, [ensureVoiceStream, listening, onStateChange, transcribeBlob, voiceStatus.whisper]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const containerCls = maximized
    ? 'fixed inset-0 z-[350] glass-dark overflow-hidden shadow-glass-lg flex flex-col pointer-events-auto'
    : 'fixed bottom-20 right-20 z-[250] glass-dark rounded-2xl overflow-hidden shadow-glass-lg flex flex-col pointer-events-auto';

  const containerStyle = maximized
    ? { width: '100vw', height: '100vh', borderRadius: 0 }
    : { width: 400, height: 560 };

  return (
    <motion.div
      variants={maximized ? {} : panelSlideRight}
      initial={maximized ? { opacity: 0 } : 'hidden'}
      animate={maximized ? { opacity: 1 } : 'visible'}
      exit={maximized ? { opacity: 0 } : 'exit'}
      className={containerCls}
      style={containerStyle}
      onMouseDown={(event) => {
        // pointer-events-auto needed because Taskbar parent has pointer-events-none
        // Prevent focus from leaving textarea when clicking messages/background
        if (event.target.closest('textarea, input, a, button, [contenteditable]')) return;
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
            style={{ background: 'radial-gradient(circle at 35% 35%, #9F67FF, #7C3AED)' }}
          >
            ✦
          </div>
          <span className="text-white/90 font-semibold text-sm">Genesis AI</span>
          <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-accent animate-pulse' : 'bg-green-400'}`} />
        </div>
        <div className="flex items-center gap-1">
          {/* Voice mode toggle — continuous hands-free mode */}
          {(voiceSupported || webSpeechSupported) && (
            <button
              onClick={toggleVoiceMode}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer"
              style={{
                background: voiceMode ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)',
                color: voiceMode ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                border: `1px solid ${voiceMode ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}`,
              }}
              title={voiceMode ? 'Disable continuous voice mode' : `Enable continuous voice mode (${voiceStatus.whisper ? 'Whisper' : 'browser speech'})`}
            >
              {voiceMode ? (
                <motion.span
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  🎙️ Listening…
                </motion.span>
              ) : (
                '🎙️ Voice'
              )}
            </button>
          )}
          <span className="text-white/30 text-[10px] mr-1 select-none">
            {localStorage.getItem('genesis_voice') !== 'false' ? '🔊' : '🔇'}
          </span>
          <button
            onClick={() => setMaximized((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
            title={maximized ? 'Restore panel' : 'Full-screen chat'}
          >
            {maximized ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className={`flex-1 min-h-0 overflow-y-auto py-3 flex flex-col gap-3 ${maximized ? 'px-6 max-w-3xl w-full self-center' : 'px-4'}`}>
        {(voiceError || (!voiceStatus.whisper && voiceStatus.error)) && (
          <div className="text-[11px] text-orange-300 border border-orange-400/20 bg-orange-400/10 rounded-xl px-3 py-2">
            {voiceError || voiceStatus.error}
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-8">
            <div className="text-5xl">✦</div>
            <p className="text-white/50 text-sm leading-relaxed">
              Hi! I'm Genesis.<br />
              I can create files, browse the web, generate images, and build apps for you.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} isStreaming={loading && m.id === _session.assistantId} onOpenImagePreview={setPreviewImage} />
        ))}
        {/* Show "Thinking..." indicator when loading but no assistant bubble yet */}
        {loading && !messages.some((m) => m.id === _session.assistantId && m.role === 'assistant') && (
          <div className="flex justify-start">
            <div className="glass rounded-xl rounded-bl-sm px-3 py-2 text-white/50 text-sm flex items-center gap-2">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                Thinking…
              </motion.div>
            </div>
          </div>
        )}
        {pendingApprovals.map((approval) => (
          <ApprovalCard
            key={approval.approvalId}
            approval={approval}
            onApprove={() => resolveApproval(approval.approvalId, true)}
            onReject={() => resolveApproval(approval.approvalId, false)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className={`py-3 border-t border-white/8 flex-shrink-0 ${maximized ? 'px-6 max-w-3xl w-full self-center' : 'px-3'}`}>
        {/* Quick action chips — always visible */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.label}
              onClick={() => {
                setInput(qa.prompt);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] text-white/60 hover:text-white/90 transition-colors border border-white/8 hover:border-accent/40 hover:bg-accent/5"
            >
              {qa.label}
            </button>
          ))}
        </div>

        <div ref={inputShellRef} className="flex items-end gap-2 glass rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Genesis…"
            rows={maximized ? 2 : 1}
            className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder:text-white/30 max-h-32"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={startVoiceInput}
            disabled={loading || voiceMode}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
            style={{ background: listening ? '#ef4444' : 'rgba(255,255,255,0.08)' }}
            title={voiceMode ? 'Continuous voice mode is active' : listening ? 'Stop recording' : 'Voice input'}
          >
            {listening ? (
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="w-2.5 h-2.5 rounded-full bg-white"
              />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <path d="M12 18v3" />
              </svg>
            )}
          </button>
          {loading ? (
            // Stop button — cancels the in-flight request immediately
            <button
              onClick={stopGeneration}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
              style={{ background: '#ef4444' }}
              title="Stop generation"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          ) : (
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
            style={{ background: tokens.colors.accent }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {previewImage && (
          <ImagePreview
            src={previewImage.src}
            filePath={previewImage.filePath}
            onClose={() => setPreviewImage(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ApprovalCard({ approval, onApprove, onReject }) {
  return (
    <div className="glass border border-amber-400/20 rounded-2xl p-3 text-white/90">
      <div className="text-[11px] uppercase tracking-widest text-amber-300/80 mb-2">Approval Required</div>
      <div className="text-sm leading-relaxed">{approval.message}</div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onApprove}
          className="px-3 py-1.5 rounded-lg text-xs bg-accent text-white hover:bg-accent-light transition-colors"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-white/70 hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Bubble({ msg, onOpenImagePreview }) {
  const isUser = msg.role === 'user';
  const filePaths = isUser ? [] : extractOpenablePaths(msg.content);
  const imagePaths = isUser ? [] : extractImagePaths(msg.content);
  const imagePath = imagePaths[0] || null;
  const savedImageUrl = imagePath ? toRawFileUrl(imagePath) : null;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'text-white rounded-br-sm'
            : 'text-white/90 glass rounded-bl-sm'
        }`}
        style={isUser ? { background: tokens.colors.accent } : {}}
      >
        {msg.content ? (
          isUser ? (
            msg.content
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-pre:my-2 prose-pre:bg-black/25 prose-code:text-indigo-200 prose-strong:text-white prose-li:my-1 prose-headings:text-white/95 prose-a:text-indigo-300">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img({ src, alt }) {
                    return (
                      <div className="mt-2 not-prose">
                        <button
                          type="button"
                          onClick={() => onOpenImagePreview?.({ src: savedImageUrl || src, filePath: imagePath })}
                          className="block"
                        >
                          <img
                            src={src}
                            alt={alt || 'Generated image'}
                            className="rounded-xl max-w-full border border-white/10"
                            style={{ maxHeight: 320 }}
                          />
                        </button>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenImagePreview?.({ src: savedImageUrl || src, filePath: imagePath })}
                            className="px-2.5 py-1 rounded-lg text-[11px] text-white/85 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                          >
                            Open image
                          </button>
                          {savedImageUrl && (
                            <a
                              href={savedImageUrl}
                              download={imagePath?.split('/').pop() || 'generated-image.png'}
                              className="px-2.5 py-1 rounded-lg text-[11px] text-white/85 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                            >
                              Save to device
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {filePaths.length > 0 && (
                <div className="not-prose mt-3 flex flex-wrap gap-2">
                  {filePaths.map((filePath) => {
                    const appId = resolveAppForPath(filePath);
                    return (
                      <button
                        key={filePath}
                        onClick={() => window._genesisOpenApp?.(appId, { filePath })}
                        className="px-2.5 py-1 rounded-lg text-[11px] text-white/85 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        Open {filePath.split('/').pop()}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )
        ) : (
          <span className="inline-flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                className="text-white/50"
              >
                •
              </motion.span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function extractOpenablePaths(content = '') {
  const matches = new Set();
  const regex = /`([^`\n]+\.(?:pdf|doc|docx|xls|xlsx|csv|ppt|pptx|md|markdown|html|htm|txt|rtf))`/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.add(match[1].replace(/\\/g, '/'));
  }
  return [...matches];
}

function extractImagePaths(content = '') {
  const matches = new Set();
  const regex = /`([^`\n]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp))`/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.add(match[1].replace(/\\/g, '/'));
  }
  return [...matches];
}

function toRawFileUrl(filePath = '') {
  return `/api/fs/raw?path=${encodeURIComponent(filePath)}`;
}

function resolveAppForPath(filePath = '') {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'md', 'markdown', 'html', 'htm', 'txt', 'rtf'].includes(ext)) {
    return 'office';
  }
  return 'editor';
}

function ImagePreview({ src, filePath, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[420] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 p-6"
      onClick={onClose}
    >
      <img
        src={src}
        alt={filePath || 'Generated image'}
        className="max-w-full max-h-[80vh] rounded-2xl border border-white/10 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
      <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
        {filePath && (
          <a
            href={toRawFileUrl(filePath)}
            download={filePath.split('/').pop()}
            className="px-3 py-2 rounded-xl text-xs text-white/85 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            Save image
          </a>
        )}
        <button
          onClick={onClose}
          className="px-3 py-2 rounded-xl text-xs text-white/85 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
        >
          Close
        </button>
      </div>
    </motion.div>
  );
}
