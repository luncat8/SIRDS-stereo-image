// Brush kernels — pure integer math, no allocations per stroke segment.

export type BrushMode = 'depth-add' | 'depth-sub' | 'depth-noise' | 'shade';

export interface BrushParams {
 mode: BrushMode;
 radius: number;     // pixels
 strength: number;   // 0..1
 falloff: number;    // 0..1 — gaussian sharpness
 noiseScale: number; // for depth-noise
 noiseAmount: number;// 0..1
 shadeAzimuth: number; // light direction degrees
 shadeIntensity: number; // 0..2
}

// Pre-built radial gaussian falloff table (one alloc, reused).
export class FalloffTable {
 size: number;
 data: Float32Array;
 constructor(size: number) {
  this.size = size;
  this.data = new Float32Array(size * size);
  this.rebuild(0.5);
 }
 rebuild(falloff: number): void {
  const r = this.size * 0.5;
  const invR = 1 / r;
  // map falloff [0..1] -> gaussian sharpness; higher = sharper
  const sigma = 0.25 + (1 - falloff) * 0.6; // 0.25..0.85
  const inv2s2 = 1 / (2 * sigma * sigma);
  let i = 0;
  for (let y = 0; y < this.size; y++) {
   const dy = (y - r) * invR;
   for (let x = 0; x < this.size; x++) {
    const dx = (x - r) * invR;
    const d2 = dx * dx + dy * dy;
    const v = Math.exp(-d2 * inv2s2);
    this.data[i++] = d2 > 1 ? 0 : v;
   }
  }
 }
 sample(nx: number, ny: number): number {
  const ix = nx * this.size | 0;
  const iy = ny * this.size | 0;
  if (ix < 0 || iy < 0 || ix >= this.size || iy >= this.size) return 0;
  return this.data[iy * this.size + ix];
 }
}
