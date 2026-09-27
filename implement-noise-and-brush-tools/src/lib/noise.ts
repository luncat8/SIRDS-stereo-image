// Tiny fast 2D value-noise / Perlin — no per-frame allocations.

const PERM_SIZE = 512;
const perm = new Uint8Array(PERM_SIZE);
{
 const p = new Uint8Array(256);
 for (let i = 0; i < 256; i++) p[i] = i;
 let s = 1337;
 for (let i = 255; i > 0; i--) {
  s = (s * 16807 + 7) & 0x7fffffff;
  const j = s % (i + 1);
  const t = p[i]; p[i] = p[j]; p[j] = t;
 }
 for (let i = 0; i < PERM_SIZE; i++) perm[i] = p[i & 255];
}

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function grad(h: number, x: number, y: number): number {
 switch (h & 7) {
  case 0: return x + y;
  case 1: return -x + y;
  case 2: return x - y;
  case 3: return -x - y;
  case 4: return x;
  case 5: return -x;
  case 6: return y;
  default: return -y;
 }
}

// Perlin 2D noise in approx [-1,1]
export function noise2(x: number, y: number): number {
 const xi = Math.floor(x) & 255;
 const yi = Math.floor(y) & 255;
 const xf = x - Math.floor(x);
 const yf = y - Math.floor(y);
 const u = fade(xf);
 const v = fade(yf);
 const aa = perm[perm[xi] + yi];
 const ab = perm[perm[xi] + yi + 1];
 const ba = perm[perm[xi + 1] + yi];
 const bb = perm[perm[xi + 1] + yi + 1];
 const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
 const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
 return lerp(x1, x2, v);
}

// Fractal noise directly into a Float32Array — single allocation caller-owned.
export function fillNoise(
 out: Float32Array,
 w: number, h: number,
 scale: number, octaves: number, lacunarity: number, gain: number,
 offsetX: number, offsetY: number
): void {
 let norm = 0;
 let ampSum = 1;
 for (let o = 1; o < octaves; o++) ampSum += Math.pow(gain, o);
 if (ampSum <= 0) ampSum = 1;
 // precompute per-octave params to keep inner loop tight
 const invScale = 1 / scale;
 const ox: number[] = new Array(octaves);
 const oy: number[] = new Array(octaves);
 const inv: number[] = new Array(octaves);
 const amp: number[] = new Array(octaves);
 for (let o = 0; o < octaves; o++) {
  const f = Math.pow(lacunarity, o);
  ox[o] = offsetX * f;
  oy[o] = offsetY * f;
  inv[o] = invScale * f;
  amp[o] = Math.pow(gain, o);
 }
 const len = w * h;
 out.fill(0);
 for (let o = 0; o < octaves; o++) {
  const fx0 = ox[o], fy0 = oy[o], isc = inv[o], a = amp[o];
  let k = 0;
  for (let y = 0; y < h; y++) {
   const ny = y * isc + fy0;
   for (let x = 0; x < w; x++) {
    out[k] += noise2(x * isc + fx0, ny) * a;
    k++;
   }
  }
 }
 if (norm === 0) {
  for (let k = 0; k < len; k++) out[k] /= ampSum;
 }
}
