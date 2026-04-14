---
name: list_files
displayName: List Files
category: filesystem
requiresApproval: false
destructive: false
---

# list_files

List the contents of a directory in the workspace, formatted for the UI.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✓ | Relative path from `/workspace` root (use `.` for root) |

## Returns

Array of `{ name, type, size, modified }` entries.

## When to use

- Showing the user what's in a folder in a clean, structured way
- Checking if a file exists before reading or writing
- Exploring directory structure

For complex queries (find by extension, recursive search, etc.) — use `bash` with `find` or `ls -R` instead.
