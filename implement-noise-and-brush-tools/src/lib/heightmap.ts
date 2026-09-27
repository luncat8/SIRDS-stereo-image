// Heightmap storage + brush stamping. No string boxing, no per-stroke allocation.

import { FalloffTable, BrushParams } from './brushes';
import { noise2 } from './noise';

export class Heightmap {
 w: number;
 h: number;
 data: Float32Array; // signed height
 shade: Float32Array; // 0..1 painted shading (separate from derived lighting)
 constructor(w: number, h: number) {
  this.w = w;
  this.h = h;
  this.data = new Float32Array(w * h);
  this.shade = new Float32Array(w * h);
 }
 clear(): void { this.data.fill(0); this.shade.fill(0); }
 clearDepth(): void { this.data.fill(0); }
 clearShade(): void { this.shade.fill(0); }
 normalize(): void {
  let lo = Infinity, hi = -Infinity;
  const d = this.data;
  for (let i = 0; i < d.length; i++) {
   const v = d[i];
   if (v < lo) lo = v;
   if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const inv = 1 / span;
  for (let i = 0; i < d.length; i++) d[i] = (d[i] - lo) * inv;
 }
}

// Stamp a brush at (cx,cy) — pixel coords in heightmap space.
export function stamp(
 hm: Heightmap,
 falloff: FalloffTable,
 p: BrushParams,
 cx: number, cy: number
): void {
 const r = p.radius;
 const x0 = Math.max(0, (cx - r) | 0);
 const y0 = Math.max(0, (cy - r) | 0);
 const x1 = Math.min(hm.w, ((cx + r) | 0) + 1);
 const y1 = Math.min(hm.h, ((cy + r) | 0) + 1);
 if (x1 <= x0 || y1 <= y0) return;
 const invR = 1 / r;
 const s = p.strength;

 switch (p.mode) {
  case 'depth-add':
  case 'depth-sub': {
   const sign = p.mode === 'depth-add' ? 1 : -1;
   for (let y = y0; y < y1; y++) {
    const dy = (y - cy) * invR;
    const row = y * hm.w;
    for (let x = x0; x < x1; x++) {
     const dx = (x - cx) * invR;
     const d2 = dx * dx + dy * dy;
     if (d2 > 1) continue;
     // gaussian-ish from falloff table
     const ftx = (x - cx + r) * (1 / (2 * r));
     const fty = (y - cy + r) * (1 / (2 * r));
     const w = falloff.sample(ftx, fty);
     if (w <= 0) continue;
     hm.data[row + x] += sign * s * w;
    }
   }
   break;
  }
  case 'depth-noise': {
   // adds (or subtracts) noisy depth — based on fbm noise sampled in world space
   const ns = Math.max(0.001, p.noiseScale);
   const na = p.noiseAmount;
   for (let y = y0; y < y1; y++) {
    const dy = (y - cy) * invR;
    const row = y * hm.w;
    for (let x = x0; x < x1; x++) {
     const dx = (x - cx) * invR;
     const d2 = dx * dx + dy * dy;
     if (d2 > 1) continue;
     const ftx = (x - cx + r) * (1 / (2 * r));
     const fty = (y - cy + r) * (1 / (2 * r));
     const w = falloff.sample(ftx, fty);
     if (w <= 0) continue;
     const n = noise2(x * ns, y * ns);
     hm.data[row + x] += s * w * na * n;
    }
   }
   break;
  }
  case 'shade': {
   // Shade brush: paint per-pixel shadow/albedo modulation. Uses noise to break column patterns.
   // Stored in hm.shade; visualized as darken/lighten multiplier in renderer.
   const ns = Math.max(0.001, p.noiseScale);
   const inten = p.shadeIntensity;
   for (let y = y0; y < y1; y++) {
    const dy = (y - cy) * invR;
    const row = y * hm.w;
    for (let x = x0; x < x1; x++) {
     const dx = (x - cx) * invR;
     const d2 = dx * dx + dy * dy;
     if (d2 > 1) continue;
     const ftx = (x - cx + r) * (1 / (2 * r));
     const fty = (y - cy + r) * (1 / (2 * r));
     const w = falloff.sample(ftx, fty);
     if (w <= 0) continue;
     // domain-warped noise so repeats don't tile into columns
     const wx = x * ns + noise2(x * ns * 0.5, y * ns * 0.5) * 4;
     const wy = y * ns + noise2(y * ns * 0.5, x * ns * 0.5) * 4;
     const n = noise2(wx, wy);            // -1..1
     const k = n * 0.5 + 0.5;             // 0..1
     // directional bias: bias the shadow toward light azimuth
     const az = (p.shadeAzimuth * Math.PI) / 180;
     const lx = Math.cos(az), ly = Math.sin(az);
     const dir = dx * lx + dy * ly;       // -1..1 within brush
     const dirMix = 0.5 + dir * 0.5;       // 0..1
     const final = k * 0.65 + dirMix * 0.35;
     const delta = (final - 0.5) * 2 * inten * w * s; // signed
     hm.shade[row + x] = Math.min(1, Math.max(0, hm.shade[row + x] + delta));
    }
   }
   break;
  }
 }
}

// Smooth shade buffer (cheap 3x3 box) so painted shading doesn't form
// the typical brush-stamp grid pattern.
export function blurShade(hm: Heightmap, passes: number): void {
 const w = hm.w, h = hm.h;
 const src = hm.shade;
 const tmp = new Float32Array(src.length);
 for (let p = 0; p < passes; p++) {
  for (let y = 0; y < h; y++) {
   const ym = y > 0 ? y - 1 : 0;
   const yp = y < h - 1 ? y + 1 : h - 1;
   for (let x = 0; x < w; x++) {
    const xm = x > 0 ? x - 1 : 0;
    const xp = x < w - 1 ? x + 1 : w - 1;
    const i = y * w + x;
    tmp[i] = (
     src[ym * w + xm] + src[ym * w + x] + src[ym * w + xp] +
     src[i + xm] + src[i] + src[i + xp] +
     src[yp * w + xm] + src[yp * w + x] + src[yp * w + xp]
    ) * (1 / 9);
   }
  }
  src.set(tmp);
 }
}
