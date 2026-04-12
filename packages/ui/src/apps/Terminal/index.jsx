import React, { useEffect, useRef } from 'react';

export default function Terminal() {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);

  useEffect(() => {
    let term, ws, fitAddon;

    async function init() {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      const { WebLinksAddon } = await import('xterm-addon-web-links');

      // Import xterm CSS
      await import('xterm/css/xterm.css');

      term = new Terminal({
        theme: {
          background: 'rgba(10,10,15,0)',
          foreground: 'rgba(255,255,255,0.9)',
          cursor: '#7C3AED',
          selection: 'rgba(124,58,237,0.3)',
          black: '#000000',
          red: '#ff5f57',
          green: '#28c941',
          yellow: '#febc2e',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#5de6e8',
          white: '#ffffff',
        },
        fontSize: 13,
        fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
        cursorBlink: true,
        allowProposedApi: true,
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term;
      fitRef.current = fitAddon;

      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/api/shell`);
      wsRef.current = ws;

      ws.onopen = () => {
        term.writeln('\x1b[32m⬛ Genesis Terminal\x1b[0m');
        term.writeln('\x1b[2mConnected to local shell\x1b[0m\r\n');
        fitAddon.fit();
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'output') term.write(data.data);
          if (data.type === 'exit') term.writeln(`\r\n\x1b[31mProcess exited (${data.code})\x1b[0m`);
          if (data.type === 'error') term.writeln(`\r\n\x1b[31mError: ${data.message}\x1b[0m`);
        } catch {
          term.write(e.data);
        }
      };

      ws.onclose = () => term.writeln('\r\n\x1b[31mConnection closed\x1b[0m');
      ws.onerror = () => term.writeln('\r\n\x1b[31mWebSocket error\x1b[0m');

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
    }

    init().catch(console.error);

    const onResize = () => fitRef.current?.fit();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: 'rgba(8,8,14,0.95)', padding: '8px' }}
    />
  );
}
