import React, { useState, useEffect } from 'react';
import { useOS } from '../../App';

const WALLPAPERS = [
  {
    id: 'default',
    label: 'Cosmic Violet',
    value: 'radial-gradient(ellipse 100% 70% at -5% 105%, rgba(99,102,241,0.45) 0%, transparent 45%), radial-gradient(ellipse 70% 55% at 105% -5%, rgba(14,165,233,0.3) 0%, transparent 45%), radial-gradient(ellipse 60% 45% at 50% 100%, rgba(99,102,241,0.18) 0%, transparent 50%), linear-gradient(160deg, #0d0d16 0%, #08080f 60%, #0a0a12 100%)',
  },
  {
    id: 'midnight',
    label: 'Ocean Deep',
    value: 'radial-gradient(ellipse 120% 80% at 0% 100%, rgba(30,58,138,0.7) 0%, transparent 55%), radial-gradient(ellipse 80% 60% at 100% 0%, rgba(6,182,212,0.4) 0%, transparent 50%), linear-gradient(135deg, #020818 0%, #050d1f 50%, #020d18 100%)',
  },
  {
    id: 'forest',
    label: 'Aurora Green',
    value: 'radial-gradient(ellipse 100% 70% at 50% 100%, rgba(16,185,129,0.5) 0%, transparent 55%), radial-gradient(ellipse 80% 60% at 0% 0%, rgba(6,78,59,0.4) 0%, transparent 50%), linear-gradient(160deg, #020f08 0%, #040f0a 60%, #030e07 100%)',
  },
  {
    id: 'rose',
    label: 'Solar Flare',
    value: 'radial-gradient(ellipse 100% 60% at 100% 100%, rgba(239,68,68,0.45) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 0% 0%, rgba(245,158,11,0.3) 0%, transparent 55%), linear-gradient(135deg, #100205 0%, #0f060a 60%, #120308 100%)',
  },
  {
    id: 'nebula',
    label: 'Nebula Pink',
    value: 'radial-gradient(ellipse 120% 80% at 30% 80%, rgba(168,85,247,0.5) 0%, transparent 55%), radial-gradient(ellipse 80% 60% at 80% 10%, rgba(236,72,153,0.4) 0%, transparent 50%), linear-gradient(160deg, #0d0514 0%, #0e0510 60%, #0a0512 100%)',
  },
  {
    id: 'ice',
    label: 'Arctic Blue',
    value: 'radial-gradient(ellipse 100% 70% at 70% 0%, rgba(147,197,253,0.35) 0%, transparent 55%), radial-gradient(ellipse 80% 80% at 0% 100%, rgba(56,189,248,0.3) 0%, transparent 50%), linear-gradient(160deg, #040c18 0%, #06101e 60%, #040e18 100%)',
  },
];

const ACCENTS = [
  { id: 'violet', label: 'Electric Violet', value: '#7C3AED' },
  { id: 'blue', label: 'Ocean Blue', value: '#2563EB' },
  { id: 'cyan', label: 'Cyber Cyan', value: '#0891B2' },
  { id: 'green', label: 'Matrix Green', value: '#059669' },
  { id: 'rose', label: 'Rose Pink', value: '#E11D48' },
  { id: 'orange', label: 'Plasma Orange', value: '#EA580C' },
];

export default function Settings() {
  const { authState, refreshAuth } = useOS();
  const [models, setModels] = useState([]);
  const [currentModel, setCurrentModel] = useState(localStorage.getItem('genesis_model') || '');
  const [accent, setAccent] = useState(localStorage.getItem('genesis_accent') || '#7C3AED');
  const [wallpaper, setWallpaper] = useState(localStorage.getItem('genesis_wallpaper') || 'ice');
  const [voiceEnabled, setVoiceEnabled] = useState(localStorage.getItem('genesis_voice') !== 'false');
  const [saved, setSaved] = useState(false);
  const [generatingBg, setGeneratingBg] = useState(false);
  const [bgError, setBgError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');

  useEffect(() => {
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => {});
  }, []);

  const save = () => {
    localStorage.setItem('genesis_model', currentModel);
    localStorage.setItem('genesis_accent', accent);
    localStorage.setItem('genesis_wallpaper', wallpaper);
    localStorage.setItem('genesis_voice', String(voiceEnabled));

    const selectedWallpaper = WALLPAPERS.find((w) => w.id === wallpaper);
    const wallpaperValue = selectedWallpaper?.value || WALLPAPERS[0].value;
    localStorage.setItem('genesis_wallpaper_value', wallpaperValue);

    // Apply immediately
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-glow', accent + '66');
    document.documentElement.style.setProperty('--wallpaper-bg', wallpaperValue);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const generateAIBackground = async () => {
    setGeneratingBg(true);
    setBgError('');
    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'breathtaking natural landscape panoramic desktop wallpaper, golden hour lighting, highly detailed photography, ultra wide 16:9, cinematic, no text'
        })
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      if (!data.url) throw new Error('No image returned');
      const imageValue = `url('${data.url}')`;
      setWallpaper('ai_generated');
      localStorage.setItem('genesis_wallpaper', 'ai_generated');
      localStorage.setItem('genesis_wallpaper_value', imageValue);
      document.documentElement.style.setProperty('--wallpaper-bg', imageValue);
    } catch (e) {
      setBgError(e.message);
    } finally {
      setGeneratingBg(false);
    }
  };

  const savePassword = async () => {
    setSecurityError('');
    setSecurityMessage('');
    if (newPassword !== confirmPassword) {
      setSecurityError('Passwords do not match.');
      return;
    }
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecurityMessage(authState.passwordSet ? 'Password updated.' : 'Password enabled.');
      refreshAuth?.();
    } catch (err) {
      setSecurityError(err.message);
    }
  };

  const removePassword = async () => {
    setSecurityError('');
    setSecurityMessage('');
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, remove: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecurityMessage('Password removed.');
      refreshAuth?.();
    } catch (err) {
      setSecurityError(err.message);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    refreshAuth?.();
  };

  return (
    <div className="h-full overflow-y-auto p-6 text-white">
      <div className="max-w-lg mx-auto flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-white/90">Settings</h2>

        <Section title="Security">
          <div className="flex flex-col gap-3">
            <p className="text-white/65 text-sm">
              {authState?.passwordSet
                ? 'Genesis OS is protected with a local password and session cookie.'
                : 'No password is set. Enable a password to protect file access, terminal access, and AI actions.'}
            </p>
            {authState?.passwordSet && (
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent"
              />
            )}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={authState?.passwordSet ? 'New password' : 'Create password'}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent"
            />
            {securityError && <div className="text-red-300 text-sm">{securityError}</div>}
            {securityMessage && <div className="text-green-300 text-sm">{securityMessage}</div>}
            <div className="flex items-center gap-2">
              <button onClick={savePassword} className="px-4 py-2 bg-accent hover:bg-accent-light rounded-xl text-white font-medium text-sm transition-colors">
                {authState?.passwordSet ? 'Update Password' : 'Enable Password'}
              </button>
              {authState?.passwordSet && (
                <>
                  <button onClick={removePassword} className="px-4 py-2 bg-white/8 hover:bg-white/12 rounded-xl text-white/85 font-medium text-sm transition-colors">
                    Remove Password
                  </button>
                  <button onClick={logout} className="px-4 py-2 bg-white/8 hover:bg-white/12 rounded-xl text-white/85 font-medium text-sm transition-colors">
                    Lock Now
                  </button>
                </>
              )}
            </div>
          </div>
        </Section>

        {/* AI Model */}
        <Section title="AI Model">
          <p className="text-white/50 text-xs mb-3">
            Default: <code className="text-accent">gemma4:e4b</code> (CPU-optimised, recommended)
          </p>
          {models.length > 0 ? (
            <select
              value={currentModel}
              onChange={(e) => setCurrentModel(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent"
            >
              {models.map((m) => (
                <option key={m} value={m} className="bg-base-300">{m}</option>
              ))}
            </select>
          ) : (
            <p className="text-white/30 text-sm">
              No models found. Make sure Ollama is running and has pulled a model.
            </p>
          )}
        </Section>

        {/* Accent color */}
        <Section title="Accent Colour">
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm ${
                  accent === a.value ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ background: a.value, boxShadow: accent === a.value ? `0 0 8px ${a.value}` : 'none' }}
                />
                <span className="text-white/80">{a.label}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* Wallpaper */}
        <Section title="Wallpaper">
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWallpaper(w.id)}
                className={`h-20 rounded-xl border-2 transition-all text-xs font-semibold flex items-end pb-2 px-2 ${
                  wallpaper === w.id ? 'border-accent shadow-glow-sm text-white' : 'border-white/10 text-white/60 hover:border-white/30'
                }`}
                style={{
                  background: w.value,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <span className="drop-shadow text-[11px] font-medium">{w.label}</span>
              </button>
            ))}
          </div>

          {/* AI Background generation */}
          <div className="glass rounded-xl p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-white/85 text-sm font-medium">✨ AI Background</p>
              <p className="text-white/45 text-xs mt-0.5">Generate a unique wallpaper with AI</p>
              {bgError && <p className="text-red-400 text-xs mt-1">{bgError}</p>}
              {wallpaper === 'ai_generated' && <p className="text-green-400 text-xs mt-1">AI wallpaper active</p>}
            </div>
            <button
              onClick={generateAIBackground}
              disabled={generatingBg}
              className="flex-shrink-0 px-4 py-2 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
            >
              {generatingBg ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Generating…
                </span>
              ) : 'Generate'}
            </button>
          </div>
        </Section>

        {/* Voice */}
        <Section title="Voice Assistant">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setVoiceEnabled((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${voiceEnabled ? 'bg-accent' : 'bg-white/20'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${voiceEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-white/80 text-sm">
              {voiceEnabled ? 'Voice enabled (browser mic + speech output)' : 'Voice disabled'}
            </span>
          </label>
          <p className="text-white/45 text-xs mt-3">
            Current implementation uses browser speech recognition and speech synthesis locally. The Python voice sidecar can be added later for higher-quality STT/TTS and wake word support.
          </p>
        </Section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="px-6 py-2.5 bg-accent hover:bg-accent-light rounded-xl text-white font-medium text-sm transition-colors shadow-glow-sm"
          >
            Save Settings
          </button>
          {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="glass rounded-xl p-4">
      <h3 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}
