/**
 * Generates Genesis OS PWA icons (PNG) at all required sizes
 * from a base SVG using the Canvas API via node-canvas.
 * 
 * Run: node packages/ui/scripts/generate-icons.js
 * 
 * Falls back to writing placeholder PNGs if node-canvas unavailable.
 */

const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Inline SVG as a string — Genesis OS orb icon
function buildSVG(size) {
  const center = size / 2;
  const r = size * 0.42;
  const strokeW = size * 0.04;
  const fontSize = size * 0.32;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1a0a2e"/>
      <stop offset="100%" stop-color="#0a0a0f"/>
    </radialGradient>
    <radialGradient id="orb" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#a855f7"/>
      <stop offset="50%" stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#4f1799"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${size * 0.04}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#bg)"/>
  <!-- Outer glow ring -->
  <circle cx="${center}" cy="${center}" r="${r + strokeW}" fill="none" stroke="#7C3AED" stroke-width="${strokeW * 0.5}" opacity="0.3"/>
  <!-- Main orb -->
  <circle cx="${center}" cy="${center}" r="${r}" fill="url(#orb)" filter="url(#glow)"/>
  <!-- Inner highlight -->
  <ellipse cx="${center - r * 0.15}" cy="${center - r * 0.2}" rx="${r * 0.45}" ry="${r * 0.3}" fill="rgba(255,255,255,0.15)"/>
  <!-- G letter -->
  <text x="${center}" y="${center + fontSize * 0.35}" font-family="Arial,sans-serif" font-weight="900" font-size="${fontSize}" fill="white" text-anchor="middle" opacity="0.95">G</text>
</svg>`;
}

// Try to use node-canvas, fall back to writing SVG-as-PNG placeholder
async function generateIcons() {
  let createCanvas, loadImage;

  try {
    const canvas = require('canvas');
    createCanvas = canvas.createCanvas;
    loadImage = canvas.loadImage;
  } catch {
    // node-canvas not available — write SVGs and inform the user
    console.log('node-canvas not found. Writing SVG icons (rename to .png or install canvas package).');
    for (const size of SIZES) {
      const svgPath = path.join(outDir, `icon-${size}.svg`);
      fs.writeFileSync(svgPath, buildSVG(size));
      console.log(`  Wrote ${svgPath}`);
    }
    console.log('\nTo generate real PNGs: npm install canvas --save-dev and rerun.');
    return;
  }

  const { createCanvas: cc, Image } = require('canvas');
  for (const size of SIZES) {
    const svg = buildSVG(size);
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });
    ctx.drawImage(img, 0, 0, size, size);
    const pngPath = path.join(outDir, `icon-${size}.png`);
    fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));
    console.log(`  Wrote ${pngPath} (${size}x${size})`);
  }
}

generateIcons().catch(console.error);
