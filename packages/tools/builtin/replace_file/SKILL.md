---
name: replace_file
displayName: Replace In File
category: filesystem
requiresApproval: false
destructive: false
---

# replace_file

Replace an exact string occurrence inside an existing file. Safer than `write_file` for targeted edits.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✓ | Relative path from `/workspace` root |
| `old_str` | string | ✓ | The exact string to find and replace |
| `new_str` | string | ✓ | The replacement string |

## Returns

`{ ok: true }` on success; error if `old_str` is not found or ambiguous.

## When to use

- Editing a specific function, variable, or block without touching the rest of the file
- Fixing a bug or updating a value inside an existing file
- Making surgical edits — avoids the risk of accidentally truncating the file

## Notes

- `old_str` must match exactly (whitespace and all). Include enough context lines to be unique.
- Fails if `old_str` appears zero or more than one time.
