---
name: create_app
displayName: Create App
category: creative
requiresApproval: false
destructive: false
---

# create_app

Build and register a self-contained mini web app (HTML/JS/CSS) that opens as a floating window in the Genesis OS UI.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✓ | Display name of the app |
| `description` | string | ✓ | What the app does |
| `html` | string | ✓ | Complete self-contained HTML (inline CSS + JS) |

## Returns

`{ ok: true, appId, name }` — app is immediately available to open from the launcher.

## When to use

- Building custom tools, dashboards, or utilities on the fly
- Creating interactive calculators, games, or visualisations
- Prototyping UI ideas the user describes

## Notes

- The HTML must be fully self-contained — no external domains unless the user explicitly allows it
- Apps persist in SQLite and appear in the App Launcher
- Each app gets its own window in the OS floating window system
