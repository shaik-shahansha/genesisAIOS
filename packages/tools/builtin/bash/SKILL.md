---
name: bash
displayName: Bash
category: system
requiresApproval: false
destructive: conditional
---

# bash

Execute a shell command in the Linux container. The working directory persists across calls — `cd` is sticky within a session.

## Summary

Run arbitrary bash, sh, or inline scripts. This is the most powerful tool in Genesis — use it for anything complex, multi-step, or when other specialised tools fall short.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `command` | string | ✓ | The shell command to run |

## Returns

`{ stdout, stderr, exitCode }`

## When to use

- Find files: `find /workspace -iname '*keyword*'`
- Grep content: `grep -r 'term' /workspace --include='*.md'`
- Run scripts: `python3 script.py`, `node index.js`
- Install packages: `pip install pandas`, `npm install axios`
- System info: `df -h`, `ps aux`, `env`
- Pipeline processing: `cat file.csv | python3 -c 'import sys,csv; ...'`
- Anything that would take multiple tool calls in one shot

## Approval policy

Destructive patterns (rm, truncate, drop) trigger approval when `GENESIS_APPROVAL_MODE=true`.
