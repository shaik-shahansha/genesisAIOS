---
name: delete_path
displayName: Delete Path
category: filesystem
requiresApproval: true
destructive: true
---

# delete_path

Permanently delete a file or directory from the workspace.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✓ | Relative path from `/workspace` root |

## Returns

`{ ok: true, path }` on success.

## When to use

- Cleaning up temporary files after a task
- Removing files the user explicitly asked to delete

## Approval policy

**Always requires user approval** when `GENESIS_APPROVAL_MODE=true`. This action is irreversible.
