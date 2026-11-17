// Renders build/icon.png (512px) and docs/assets/icon.png without any image library.
// Same mark as the SVG logo: teal→indigo rounded square, two side streams merging into one.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const S = 512;
const px = new Float32Array(S * S * 4);

// Geometry in a 64-unit space, matching the SVG.
const k = S / 64;
const radius = 16 * k;
function quad(p0, c, p1, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}
const strokes = [
  { pts: quad([14, 16], [26, 16], [32, 32]), alpha: 0.75 },
  { pts: quad([50, 16], [38, 16], [32, 32]), alpha: 0.75 },
  { pts: [[32, 12], [32, 52]], alpha: 1 },
].map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * k, y * k]) }));
const halfW = 2.25 * k;

function distSeg(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function roundedRectCoverage(x, y) {
  const cx = Math.min(Math.max(x, radius), S - radius);
  const cy = Math.min(Math.max(y, radius), S - radius);
  const d = Math.hypot(x - cx, y - cy) - radius;
  return Math.max(0, Math.min(1, 0.5 - d));
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const px0 = x + 0.5, py0 = y + 0.5;
    const cov = roundedRectCoverage(px0, py0);
    if (!cov) continue;
    const t = (px0 + py0) / (2 * S);
    let r = 0x37 + (0x5b - 0x37) * t, g = 0xc2 + (0x6c - 0xc2) * t, b = 0xa8 + (0xff - 0xa8) * t;
    for (const s of strokes) {
      let d = Infinity;
      for (let i = 1; i < s.pts.length; i++) d = Math.min(d, distSeg(px0, py0, s.pts[i - 1], s.pts[i]));
      const a = Math.max(0, Math.min(1, halfW + 0.5 - d)) * s.alpha;
      r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a;
    }
    const o = (y * S + x) * 4;
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = cov * 255;
  }
}

// PNG encoding: RGBA, filter byte 0 per row.
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let i = 0; i < S * 4; i++) raw[y * (S * 4 + 1) + 1 + i] = Math.round(px[y * S * 4 + i]);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

for (const dir of ['build', 'docs/assets']) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/icon.png`, png);
}
console.log(`wrote build/icon.png and docs/assets/icon.png (${png.length} bytes)`);
