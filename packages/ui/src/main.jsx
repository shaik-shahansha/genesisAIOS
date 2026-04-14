import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Register the browser-proxy service worker so the AI Browser can intercept
// all external requests from within proxied iframe pages.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/proxy-sw.js', { scope: '/' }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
