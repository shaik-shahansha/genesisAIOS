import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { panelSlideRight } from '../design/animations';
import tokens from '../design/tokens';

const QUICK_ACTIONS = [
  { label: '📄 Create document', prompt: 'Create a new text document for me' },
  { label: '🌐 Open browser', prompt: 'Open the browser' },
  { label: '🎨 Generate image', prompt: 'Generate an image of ' },
  { label: '🧩 Create app', prompt: 'Create a todo list app for me' },
  { label: '📁 Browse files', prompt: 'Open the file manager' },
  { label: '💻 Open terminal', prompt: 'Open the terminal' },
];

export default function ChatPanel({ onClose, onStateChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);        // continuous hands-free voice mode
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const inputShellRef = useRef(null);
  const speechRef = useRef(null);
  const spokenMessageIdsRef = useRef(new Set());
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const voiceModeRef = useRef(false);
  const loadingRef = useRef(false);
  // TTS playback control for barge-in interruption
  const ttsAudioRef = useRef(null);        // current Audio element (Kokoro)
  const ttsUtteranceRef = useRef(null);    // current SpeechSynthesisUtterance
  const vadContextRef = useRef(null);      // AudioContext for barge-in VAD
  const vadStreamRef = useRef(null);       // MediaStream for barge-in mic
  const [pendingVoiceSend, setPendingVoiceSend] = useState('');  // auto-send from VAD

  // Load history on mount
  useEffect(() => {
    fetch('/api/ai/history')
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []);

  // Keep refs in sync with state for use inside recognition callbacks
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

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

    setVoiceSupported(true);

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setListening(true);
      onStateChange?.('listening');
    };
    recognition.onend = () => {
      // Always restart in voice mode — mic stays open even during TTS (barge-in)
      if (voiceModeRef.current) {
        try { recognition.start(); } catch {}
        return;
      }
      setListening(false);
      onStateChange?.('idle');
    };
    recognition.onresult = (event) => {
      const allText = Array.from(event.results)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
        .trim();

      if (voiceModeRef.current) {
        const hasFinal = Array.from(event.results).some((r) => r.isFinal);
        if (hasFinal && allText) {
          // BARGE-IN: if TTS is currently playing, stop it immediately
          stopTTS();
          if (!loadingRef.current) {
            setPendingVoiceSend(allText);
          }
          setInput('');
        } else {
          setInput(allText);
        }
      } else {
        // Normal mode: populate input
        setInput(allText);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    recognition.onerror = (e) => {
      if (voiceModeRef.current && e.error !== 'aborted') {
        // Restart on errors in voice mode
        try { recognition.start(); } catch {}
        return;
      }
      setListening(false);
      onStateChange?.('idle');
    };

    speechRef.current = recognition;
    return () => {
      try { recognition.abort(); } catch {}
      stopTTS();
      stopVAD();
    };
  }, [onStateChange]);

  // ── Stop TTS immediately (barge-in or component unmount) ──────────────────
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
    onStateChange?.('listening');
  }

  // ── Start Web Audio VAD to detect barge-in during TTS ─────────────────────
  async function startVAD(onSpeechDetected) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      vadStreamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      vadContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let speaking = false;
      let silenceCount = 0;
      const check = () => {
        if (!vadContextRef.current) return;
        analyser.getByteFrequencyData(buf);
        const rms = buf.reduce((s, v) => s + v, 0) / buf.length;
        if (rms > 18) {          // speech threshold (adjustable)
          if (!speaking) { speaking = true; onSpeechDetected(); }
          silenceCount = 0;
        } else {
          silenceCount++;
          if (silenceCount > 15) speaking = false;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    } catch { /* no mic access */ }
  }

  function stopVAD() {
    if (vadContextRef.current) {
      vadContextRef.current.close().catch(() => {});
      vadContextRef.current = null;
    }
    if (vadStreamRef.current) {
      vadStreamRef.current.getTracks().forEach((t) => t.stop());
      vadStreamRef.current = null;
    }
  }

  // Cleanup TTS + VAD on unmount
  useEffect(() => {
    return () => {
      stopTTS();
      stopVAD();
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

    // Split into sentences so user can barge-in between them
    const sentences = cleanText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!sentences.length) sentences.push(cleanText);

    if (voiceMode) {
      // ── Voice mode: Kokoro TTS (local) sentence-by-sentence with barge-in ──
      let cancelled = false;

      const speakSentences = async (idx) => {
        if (cancelled || idx >= sentences.length) {
          ttsAudioRef.current = null;
          onStateChange?.('listening');
          stopVAD();
          return;
        }
        try {
          const r = await fetch('/api/ai/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sentences[idx] }),
          });
          if (!r.ok) throw new Error('TTS unavailable');
          const blob = await r.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          ttsAudioRef.current = audio;
          onStateChange?.('speaking');

          // Start barge-in VAD on first sentence only
          if (idx === 0) {
            startVAD(() => {
              if (!cancelled) {
                cancelled = true;
                stopTTS();
                stopVAD();
              }
            });
          }

          audio.onended = () => { URL.revokeObjectURL(url); if (!cancelled) speakSentences(idx + 1); };
          audio.onerror = () => { URL.revokeObjectURL(url); if (!cancelled) speakSentences(idx + 1); };
          audio.play().catch(() => { if (!cancelled) speakSentences(idx + 1); });
        } catch {
          // Kokoro down — Web Speech API fallback for the rest
          if (cancelled) return;
          if (!window.speechSynthesis) { onStateChange?.('listening'); return; }
          const remaining = sentences.slice(idx).join(' ');
          const utterance = new SpeechSynthesisUtterance(remaining);
          ttsUtteranceRef.current = utterance;
          onStateChange?.('speaking');
          utterance.onend = () => { ttsUtteranceRef.current = null; onStateChange?.('listening'); };
          utterance.onerror = () => { ttsUtteranceRef.current = null; onStateChange?.('listening'); };
          window.speechSynthesis.speak(utterance);
        }
      };

      speakSentences(0);
      return;
    }

    // ── Standard mode (voice toggle only, not continuous): Web Speech API ──
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
  }, [messages, loading, onStateChange, voiceMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (textOverride) => {
    const text = (textOverride !== undefined ? textOverride : input).trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { id: Date.now(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    onStateChange?.('thinking');

    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const selectedModel = localStorage.getItem('genesis_model') || undefined;
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: selectedModel }),
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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + data.token } : m
                )
              );
            }
            if (data.action?.type === 'open_app') {
              window._genesisOpenApp?.(data.action.appId, data.action.props || {});
            }
            if (data.action?.type === 'refresh_apps') {
              window._genesisRefreshApps?.();
            }
            if (data.error) {
              throw new Error(data.error);
            }
          } catch {}
        }
      }

      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (data.token) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + data.token } : m
              )
            );
          }
        } catch {}
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${err.message}` } : m
        )
      );
    } finally {
      setLoading(false);
      onStateChange?.('idle');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [input, loading, onStateChange]);

  const toggleVoiceMode = useCallback(() => {
    const next = !voiceMode;
    voiceModeRef.current = next;
    setVoiceMode(next);

    if (speechRef.current) {
      try { speechRef.current.abort(); } catch {}
      speechRef.current.continuous = next;
      speechRef.current.interimResults = !next; // show interim only in non-voice mode
      if (next) {
        setInput('');
        try { speechRef.current.start(); } catch {}
        setListening(true);
        onStateChange?.('listening');
      } else {
        setListening(false);
        onStateChange?.('idle');
        window.speechSynthesis?.cancel();
      }
    }
  }, [voiceMode, onStateChange]);

  const startVoiceInput = useCallback(() => {
    if (listening) {
      try { speechRef.current?.stop(); } catch {}
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      setListening(false);
      onStateChange?.('idle');
      return;
    }
    if (speechRef.current) {
      try { speechRef.current.start(); } catch {}
    } else {
      // Fallback: MediaRecorder → Whisper sidecar
      navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          try {
            const r = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'audio/webm' },
              body: blob,
            });
            if (r.ok) {
              const d = await r.json();
              if (d.text) { setInput(d.text); setTimeout(() => inputRef.current?.focus(), 0); }
            }
          } catch {}
          setListening(false);
          onStateChange?.('idle');
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setListening(true);
        onStateChange?.('listening');
        setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 10_000);
      }).catch(() => {});
    }
  }, [listening, onStateChange]);

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
          {voiceSupported && (
            <button
              onClick={toggleVoiceMode}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all"
              style={{
                background: voiceMode ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)',
                color: voiceMode ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                border: `1px solid ${voiceMode ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}`,
              }}
              title={voiceMode ? 'Disable continuous voice mode' : 'Enable continuous voice mode (hands-free)'}
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
          <Bubble key={m.id} msg={m} />
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
            disabled={loading}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
            style={{ background: listening ? '#ef4444' : 'rgba(255,255,255,0.08)' }}
            title={listening ? 'Stop recording' : 'Voice input'}
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
        </div>
      </div>
    </motion.div>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
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
                        <img
                          src={src}
                          alt={alt || 'Generated image'}
                          className="rounded-xl max-w-full border border-white/10"
                          style={{ maxHeight: 320 }}
                        />
                        {src?.startsWith('/api/fs/raw') && (
                          <a
                            href={src}
                            download
                            className="block mt-1 text-xs text-indigo-300 hover:text-indigo-100"
                          >
                            ↓ Save image
                          </a>
                        )}
                      </div>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
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
