/**
 * make-icons — regenerate the PWA icons in public/icons.
 *
 *   node scripts/make-icons.mjs
 *
 * The icons are checked in; this script only exists so the mark can be changed
 * without opening a design tool. It writes real PNGs with a tiny encoder
 * (zlib is in Node; a PNG is a header, one deflated block and a footer), so
 * the project gains no dependency for four square images.
 *
 * The mark: a dark tile, three bars, the last one in the accent colour. Three
 * lines of notes, one of which needs attention — the whole product in 40px.
 *
 * This is the one file outside app/globals.css that names colours, because an
 * icon is a binary asset, not a component. The three values below are copied
 * from the tables in docs/DESIGN.md (--text, --bg, --accent, light theme).
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'icons');

const INK = [0x17, 0x1b, 0x24]; // --text
const PAPER = [0xf5, 0xf6, 0xf8]; // --bg
const ACCENT = [0xc2, 0x60, 0x0c]; // --accent

// ---------------------------------------------------------------------------
// A very small PNG encoder: 8-bit RGBA, one IDAT, no interlacing.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, no filter method, no interlace.

  // Each scanline is prefixed with its filter byte. Filter 0 = none.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const from = y * size * 4;
    pixels.copy(raw, y * (size * 4 + 1) + 1, from, from + size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing. Everything is a rounded rectangle, which keeps this honest.
// ---------------------------------------------------------------------------

function canvas(size) {
  return { size, pixels: Buffer.alloc(size * size * 4) };
}

/** True when (x, y) is inside a rectangle whose corners are rounded by `r`. */
function insideRoundedRect(x, y, left, top, width, height, r) {
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  if (r <= 0) return true;

  const cx = Math.min(Math.max(x, left + r), left + width - r);
  const cy = Math.min(Math.max(y, top + r), top + height - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundedRect(target, left, top, width, height, r, [red, green, blue]) {
  for (let y = Math.floor(top); y < Math.ceil(top + height); y += 1) {
    for (let x = Math.floor(left); x < Math.ceil(left + width); x += 1) {
      if (x < 0 || y < 0 || x >= target.size || y >= target.size) continue;
      // Sample the pixel's centre so the curves do not lose a row.
      if (!insideRoundedRect(x + 0.5, y + 0.5, left, top, width, height, r)) continue;

      const at = (y * target.size + x) * 4;
      target.pixels[at] = red;
      target.pixels[at + 1] = green;
      target.pixels[at + 2] = blue;
      target.pixels[at + 3] = 255;
    }
  }
}

/**
 * @param size    pixels square
 * @param inset   fraction of the size kept clear around the mark
 * @param tileRadius fraction of the size used to round the tile, 0 for square
 */
function drawIcon(size, inset, tileRadius) {
  const target = canvas(size);
  fillRoundedRect(target, 0, 0, size, size, size * tileRadius, INK);

  const pad = size * inset;
  const markWidth = size - pad * 2;
  const barHeight = size * 0.1;
  const gap = size * 0.075;
  const blockHeight = barHeight * 3 + gap * 2;
  const top = (size - blockHeight) / 2;

  const bars = [
    { width: markWidth, colour: PAPER },
    { width: markWidth * 0.72, colour: PAPER },
    { width: markWidth * 0.44, colour: ACCENT },
  ];

  bars.forEach((bar, index) => {
    fillRoundedRect(
      target,
      pad,
      top + index * (barHeight + gap),
      bar.width,
      barHeight,
      barHeight / 2,
      bar.colour
    );
  });

  return encodePng(size, target.pixels);
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const FILES = [
  // Rounded tile: shown as-is in most launchers and in the browser tab.
  { name: 'icon-192.png', size: 192, inset: 0.22, tileRadius: 0.22 },
  { name: 'icon-512.png', size: 512, inset: 0.22, tileRadius: 0.22 },
  // Maskable: square, and the mark stays inside the centre 80% safe zone.
  { name: 'icon-maskable-512.png', size: 512, inset: 0.3, tileRadius: 0 },
  // iOS masks the apple-touch-icon itself, so it must be square and opaque.
  { name: 'apple-touch-icon.png', size: 180, inset: 0.22, tileRadius: 0 },
];

for (const file of FILES) {
  writeFileSync(join(OUT_DIR, file.name), drawIcon(file.size, file.inset, file.tileRadius));
  console.log(`wrote public/icons/${file.name}`);
}
