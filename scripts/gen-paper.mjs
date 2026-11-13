// Generates tileable procedural paper textures into assets/paper/*.png
// Run: node scripts/gen-paper.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 256;

// Small seeded PRNG so textures are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise: random grid with wrap-around + smooth interpolation. */
function valueNoise(rand, cells) {
  const g = Array.from({ length: cells * cells }, () => rand());
  const at = (x, y) => g[((y + cells) % cells) * cells + ((x + cells) % cells)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (px, py) => {
    const fx = (px / SIZE) * cells;
    const fy = (py / SIZE) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

function hex(c) {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(rgb) {
  const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 3 + 1)] = 0;
    rgb.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * base: paper color. grain: fine speckle strength. mottle: large blotch strength.
 * fibers: number of faint fibers. weave: linen cross-hatch strength.
 */
function paper({ base, grain, mottle, fibers, weave = 0, seed }) {
  const rand = rng(seed);
  const big = valueNoise(rand, 4);
  const mid = valueNoise(rand, 16);
  const fine = valueNoise(rand, 64);
  const [r0, g0, b0] = hex(base);
  const lum = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      let v = (big(x, y) - 0.5) * mottle + (mid(x, y) - 0.5) * mottle * 0.5;
      v += (fine(x, y) - 0.5) * grain + (rand() - 0.5) * grain * 0.6;
      if (weave) v += (Math.sin((x / SIZE) * Math.PI * 2 * 64) + Math.sin((y / SIZE) * Math.PI * 2 * 64)) * weave * 0.5;
      lum[y * SIZE + x] = v;
    }
  // Fibers: short faint curved strokes (wrapping around the tile edges).
  for (let f = 0; f < fibers; f++) {
    let x = rand() * SIZE;
    let y = rand() * SIZE;
    let ang = rand() * Math.PI * 2;
    const len = 10 + rand() * 40;
    const strength = (rand() < 0.5 ? -1 : 1) * (0.02 + rand() * 0.03);
    for (let i = 0; i < len; i++) {
      const xi = ((Math.round(x) % SIZE) + SIZE) % SIZE;
      const yi = ((Math.round(y) % SIZE) + SIZE) % SIZE;
      lum[yi * SIZE + xi] += strength;
      ang += (rand() - 0.5) * 0.3;
      x += Math.cos(ang);
      y += Math.sin(ang);
    }
  }
  const out = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const k = 1 + lum[i];
    out[i * 3] = Math.max(0, Math.min(255, Math.round(r0 * k)));
    out[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g0 * k)));
    out[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b0 * (k * 0.98 + 0.02))));
  }
  return png(out);
}

// Keep these colors in sync with src/constants/paper.ts
const PAPERS = {
  cream: { base: '#F7F0E1', grain: 0.035, mottle: 0.03, fibers: 120, seed: 1 },
  parchment: { base: '#EEDDB8', grain: 0.05, mottle: 0.09, fibers: 160, seed: 2 },
  sepia: { base: '#E6D3AE', grain: 0.045, mottle: 0.06, fibers: 140, seed: 3 },
  white: { base: '#FBFAF6', grain: 0.02, mottle: 0.012, fibers: 60, seed: 4 },
  linen: { base: '#F1ECE3', grain: 0.025, mottle: 0.02, fibers: 40, weave: 0.025, seed: 5 },
  night: { base: '#221D18', grain: 0.12, mottle: 0.12, fibers: 120, seed: 6 },
};

mkdirSync('assets/paper', { recursive: true });
for (const [name, opts] of Object.entries(PAPERS)) {
  const buf = paper(opts);
  writeFileSync(`assets/paper/${name}.png`, buf);
  console.log(`assets/paper/${name}.png`, buf.length, 'bytes');
}
