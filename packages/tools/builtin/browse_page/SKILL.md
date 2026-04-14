---
name: browse_page
displayName: Browse Page
category: network
requiresApproval: false
destructive: false
---

# browse_page

Fetch the contents of a web page and return its main text content.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | ✓ | The URL to fetch and parse |

## Returns

`{ url, title, content }` — cleaned, readable text from the page.

## When to use

- Summarising a webpage for the user
- Extracting information from a URL
- Checking documentation or a live resource

For raw HTTP requests (API calls, downloads, custom headers) — use `bash("curl -s URL")` instead.
