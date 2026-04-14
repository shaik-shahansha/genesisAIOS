---
name: generate_image
displayName: Generate Image
category: creative
requiresApproval: false
destructive: false
---

# generate_image

Generate an image from a text prompt using the local image generation service.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prompt` | string | ✓ | Detailed description of the image to generate |
| `filename` | string | ✗ | Output filename (default: auto-generated) |

## Returns

`{ ok: true, path, url }` — local path and URL to the generated image.

## When to use

- Creating artwork, illustrations, or concept images
- Generating UI mockups or design references
- Visualising ideas the user describes

## Notes

- Images are saved to `/workspace/Pictures/`
- For best results, include style descriptors: "photorealistic", "digital art", "flat design", etc.
- Resolution and model used depends on daemon configuration
