---
name: read_file
displayName: Read File
category: filesystem
requiresApproval: false
destructive: false
---

# read_file

Read the full text contents of a file in the workspace.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✓ | Relative path from `/workspace` root |

## Returns

File content as a UTF-8 string (max 256 KB).

## When to use

- Inspecting a single file whose contents you need to reason about
- Checking file structure before editing

For large binary files, office documents (.docx/.xlsx), or PDFs — use the appropriate specialised app or `bash cat` with piping.
