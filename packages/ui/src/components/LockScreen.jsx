import React, { useState } from 'react';

export default function LockScreen({ onAuthenticated }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (event) => {
    event.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPassword('');
      onAuthenticated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center wallpaper">
      <div className="absolute inset-0 bg-black/35" />
      <form onSubmit={login} className="relative glass-dark rounded-3xl p-8 w-[420px] max-w-[92vw] border border-white/10 shadow-glass-lg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M2 12l10 5 10-5" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M2 17l10 5 10-5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-white text-2xl font-semibold tracking-tight">Unlock Genesis OS</h1>
            <p className="text-white/45 text-sm mt-2">Enter your local password to access your workspace.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-accent"
          />
          {error && <div className="text-red-300 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full px-4 py-3 bg-accent hover:bg-accent-light rounded-xl text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}