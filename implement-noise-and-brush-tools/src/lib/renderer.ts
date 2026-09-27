// Renders heightmap into a 2D canvas using a fast software pipeline.
// Output: ImageData — written to a hidden canvas each frame.

import { Heightmap } from './heightmap';
import { noise2 } from './noise';

export interface RenderOpts {
 // noise animation
 noiseEnabled: boolean;
 noiseSpeedX: number;    // units per second
 noiseSpeedY: number;
 noiseRandomEachFrame: boolean;
 noiseScale: number;     // world scale for displacement noise
 noiseAmount: number;    // 0..1 vertical displacement
 // lighting
 lightAzimuth: number;   // degrees
 lightElevation: number; // degrees
 ambient: number;        // 0..1
 specular: number;       // 0..1
 // palette
 baseColor: [number, number, number];
 shadowColor: [number, number, number];
 highlightColor: [number, number, number];
 // tilt for 3D look
 tilt: number;           // radians, XY tilt
 // shade overlay
 shadeStrength: number;  // 0..1
}

export class Renderer {
 w: number;
 h: number;
 image: ImageData;
 canvas: HTMLCanvasElement;
 ctx: CanvasRenderingContext2D;
 out: Uint8ClampedArray;

 constructor(w: number, h: number) {
  this.w = w;
  this.h = h;
  this.canvas = document.createElement('canvas');
  this.canvas.width = w;
  this.canvas.height = h;
  this.ctx = this.canvas.getContext('2d', { alpha: false })!;
  this.image = this.ctx.createImageData(w, h);
  this.out = this.image.data;
 }

 resize(w: number, h: number): void {
  this.w = w; this.h = h;
  this.canvas.width = w; this.canvas.height = h;
  this.image = this.ctx.createImageData(w, h);
  this.out = this.image.data;
 }

 // Render to internal canvas; returns it (caller blits or scales).
 render(hm: Heightmap, t: number, opts: RenderOpts): void {
  const w = this.w, h = this.h;
  const data = hm.data;
  const shade = hm.shade;
  const out = this.out;

  const az = (opts.lightAzimuth * Math.PI) / 180;
  const el = (opts.lightElevation * Math.PI) / 180;
  const lx = Math.cos(el) * Math.cos(az);
  const ly = Math.cos(el) * Math.sin(az);
  const lz = Math.sin(el);

  // sample offset for animated noise
  const nx = opts.noiseEnabled ? t * opts.noiseSpeedX : 0;
  const ny = opts.noiseEnabled ? t * opts.noiseSpeedY : 0;
  const useRand = opts.noiseRandomEachFrame;
  const ns = Math.max(0.0001, opts.noiseScale);
  const na = opts.noiseAmount;

  // tilt: project (x, depth, y) -> screen with simple perspective tilt
  // tilt: how much slope affects ambient — steeper tilt = stronger AO darkening
  const aoStrength = Math.sin(opts.tilt) * 0.5;

  const baseR = opts.baseColor[0], baseG = opts.baseColor[1], baseB = opts.baseColor[2];
  const shR = opts.shadowColor[0], shG = opts.shadowColor[1], shB = opts.shadowColor[2];
  const hiR = opts.highlightColor[0], hiG = opts.highlightColor[1], hiB = opts.highlightColor[2];

  // precompute height gradient scale (smaller = softer normals)
  const gradScale = 4.0;
  let p = 0;
  for (let y = 0; y < h; y++) {
   const ym = y === 0 ? 0 : y - 1;
   const yp = y === h - 1 ? h - 1 : y + 1;
   for (let x = 0; x < w; x++) {
    const xm = x === 0 ? 0 : x - 1;
    const xp = x === w - 1 ? w - 1 : x + 1;
    const hl = data[y * w + xm];
    const hr = data[y * w + xp];
    const hu = data[ym * w + x];
    const hd = data[yp * w + x];
    let ddx = (hr - hl) * gradScale;
    let ddy = (hd - hu) * gradScale;

    // live noise perturbation: add small offset that changes over time/frame
    let hN = 0;
    if (opts.noiseEnabled && na > 0) {
     if (useRand) {
      // pseudo-random per (x,y,frame) but cheap
      const fx = ((x * 0.7548776 + 1) | 0);
      const fy = ((y * 0.56984029 + 1) | 0);
      hN = noise2(fx + nx, fy + ny);
     } else {
      hN = noise2(x * ns + nx, y * ns + ny);
     }
    }
    ddx += hN * na * 2;
    ddy += hN * na * 2;

    // Normal: N = normalize(-ddx, -ddy, 1)
    const nxN = -ddx;
    const nyN = -ddy;
    const nzN = 1;
    const invLen = 1 / Math.sqrt(nxN * nxN + nyN * nyN + nzN * nzN);
    const Nx = nxN * invLen, Ny = nyN * invLen, Nz = nzN * invLen;

    // diffuse
    const diff = Math.max(0, Nx * lx + Ny * ly + Nz * lz);
    // slope-based ambient occlusion scaled by tilt
    const slope = 1 - Nz; // 0..1, 1 at vertical wall
    const ao = aoStrength * slope * 0.4;
    // specular (Blinn-Phong simple)
    const Hx = lx, Hy = ly, Hz = lz + 1;
    const hLen = 1 / Math.sqrt(Hx * Hx + Hy * Hy + Hz * Hz);
    const nh = Math.max(0, Nx * Hx * hLen + Ny * Hy * hLen + Nz * Hz * hLen);
    const spec = Math.pow(nh, 32) * opts.specular;

    // tint between shadow -> base -> highlight by (diff + ambient)
    let lum = opts.ambient + diff * (1 - opts.ambient) - ao;
    if (lum < 0.5) {
     const t2 = lum * 2;
     out[p]   = shR * (1 - t2) + baseR * t2;
     out[p+1] = shG * (1 - t2) + baseG * t2;
     out[p+2] = shB * (1 - t2) + baseB * t2;
    } else {
     const t2 = (lum - 0.5) * 2;
     out[p]   = baseR * (1 - t2) + hiR * t2;
     out[p+1] = baseG * (1 - t2) + hiG * t2;
     out[p+2] = baseB * (1 - t2) + hiB * t2;
    }
    // specular highlight
    if (spec > 0) {
     out[p]   = out[p] * (1 - spec) + 255 * spec;
     out[p+1] = out[p+1] * (1 - spec) + 255 * spec;
     out[p+2] = out[p+2] * (1 - spec) + 255 * spec;
    }
    // painted shade overlay
    const sh = shade[y * w + x] * opts.shadeStrength;
    if (sh > 0) {
     out[p]   = out[p]   * (1 - sh);
     out[p+1] = out[p+1] * (1 - sh);
     out[p+2] = out[p+2] * (1 - sh);
    }
    out[p+3] = 255;
    p += 4;
   }
  }
  this.ctx.putImageData(this.image, 0, 0);
 }

 getCanvas(): HTMLCanvasElement { return this.canvas; }
}
