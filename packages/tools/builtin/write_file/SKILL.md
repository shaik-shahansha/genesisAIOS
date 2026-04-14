---
name: write_file
displayName: Write File
category: filesystem
requiresApproval: false
destructive: true
---

# write_file

Write (create or overwrite) a file in the workspace with the given content.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✓ | Relative path from `/workspace` root |
| `content` | string | ✓ | Full file content to write |

## Returns

`{ ok: true, path }` on success.

## When to use

- Writing new text, code, or markdown files
- Saving generated content to disk
- Overwriting an existing file with a full replacement

Prefer `replace_file` when you only need to change a portion of an existing file to avoid accidental data loss.

## Notes

- Parent directories are created automatically
- Overwrites existing files without confirmation (not destructive in the `bash rm` sense)
