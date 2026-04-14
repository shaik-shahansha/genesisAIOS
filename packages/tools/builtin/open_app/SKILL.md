---
name: open_app
displayName: Open App
category: ui
requiresApproval: false
destructive: false
---

# open_app

Open a built-in or user-created application in the Genesis OS desktop as a floating window.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `appId` | string | ✓ | App identifier (e.g. `files`, `editor`, `terminal`, `browser`, `pdf`, `office`, `settings`) |
| `args` | object | ✗ | Optional arguments passed to the app (e.g. `{ path: '/workspace/doc.md' }`) |

## Returns

Emits a `open_app` event on the UI bus; the window opens client-side.

## Built-in app IDs

| ID | App |
|----|-----|
| `files` | File Manager |
| `editor` | Text Editor (Monaco) |
| `terminal` | Terminal (xterm.js) |
| `browser` | AI Browser |
| `pdf` | PDF Viewer |
| `office` | Office Viewer |
| `settings` | Settings |
| `logs` | System Logs |

## When to use

- Opening a file for the user to view or edit
- Launching the terminal after setting up an environment
- Directing the user to a relevant app after completing a task
