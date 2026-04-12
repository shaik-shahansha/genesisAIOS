'use strict';

// In-process log buffer + console interceptor.
// Import this ONCE at the top of index.js before anything else.

const MAX_LOGS = 1000;

const logs = [];
const listeners = new Set();

function addLog(level, ...args) {
  const msg = args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');

  const entry = { ts: new Date().toISOString(), level, msg };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  for (const cb of listeners) {
    try { cb(entry); } catch { /* ignore broken listener */ }
  }
}

// Intercept all console methods so every log line hits addLog
const origLog = console.log.bind(console);
const origInfo = console.info.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);
const origDebug = console.debug.bind(console);

console.log   = (...a) => { origLog(...a);   addLog('info',  ...a); };
console.info  = (...a) => { origInfo(...a);  addLog('info',  ...a); };
console.warn  = (...a) => { origWarn(...a);  addLog('warn',  ...a); };
console.error = (...a) => { origError(...a); addLog('error', ...a); };
console.debug = (...a) => { origDebug(...a); addLog('debug', ...a); };

module.exports = { logs, listeners, addLog };
