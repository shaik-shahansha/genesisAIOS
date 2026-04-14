---
name: create_document
displayName: Create Document
category: documents
requiresApproval: false
destructive: false
---

# create_document

Create an Office or PDF document (.docx, .xlsx, .pptx, .pdf) from structured content.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filename` | string | ✓ | Target filename including extension |
| `content` | string | ✓ | Document content (markdown for docx/pdf, CSV/JSON for xlsx) |
| `type` | string | ✓ | One of: `docx`, `xlsx`, `pptx`, `pdf` |

## Returns

`{ ok: true, path }` — path to the created file in `/workspace/Documents/`.

## When to use

- Generating reports, invoices, proposals, or letters
- Creating spreadsheets from tabular data
- Building slide decks from structured content
- Any time the user wants a proper file rather than a markdown block

## Notes

- Files are saved to `/workspace/Documents/` by default
- For xlsx, pass content as JSON array of arrays (rows × cols) or CSV
- For docx/pdf, pass markdown and it will be formatted automatically
