'use strict';

const { complete } = require('../llm/client');

/**
 * WebSocket PTY handler — mounted at /api/shell
 * Uses node-pty for a real PTY so interactive programs work.
 */
module.exports = function shellHandler(ws, _req) {
  let pty;

  try {
    const nodePty = require('node-pty');
    const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');
    const cwd = process.env.GENESIS_PROJECT_ROOT || process.cwd();

    pty = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env,
    });

    pty.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'output', data }));
    });

    pty.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN)
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      ws.close();
    });

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'input') pty.write(parsed.data);
        if (parsed.type === 'resize') pty.resize(parsed.cols, parsed.rows);
      } catch {
        // raw input
        pty.write(msg);
      }
    });

    ws.on('close', () => pty.kill());
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
  }
};
