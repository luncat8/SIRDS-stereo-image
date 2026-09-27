import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Heightmap, stamp, blurShade } from './lib/heightmap';
import { FalloffTable, BrushParams, BrushMode } from './lib/brushes';
import { Renderer, RenderOpts } from './lib/renderer';
import { fillNoise } from './lib/noise';

type Tool = 'brush' | 'erase';

const PRESETS: { name: string; base: string; shadow: string; hi: string }[] = [
 { name: 'Stone',  base: '#9aa0a6', shadow: '#2b2d31', hi: '#e6e7ea' },
 { name: 'Sand',   base: '#d6b27a', shadow: '#5b3e1d', hi: '#fde8b8' },
 { name: 'Moss',   base: '#4f7a3e', shadow: '#102610', hi: '#b9e08a' },
 { name: 'Lava',   base: '#b3331a', shadow: '#170604', hi: '#ffd270' },
 { name: 'Ice',    base: '#a8d8e6', shadow: '#1e3845', hi: '#ffffff' },
 { name: 'Plasma', base: '#7a3fb3', shadow: '#160728', hi: '#ff8ee5' },
];

function hexToRgb(hex: string): [number, number, number] {
 const n = parseInt(hex.slice(1), 16);
 return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function App() {
 const canvasWrapRef = useRef<HTMLDivElement>(null);
 const displayRef = useRef<HTMLCanvasElement>(null);
 const previewRef = useRef<HTMLCanvasElement>(null);
 const rafRef = useRef<number>(0);
 const lastTimeRef = useRef<number>(0);
 const startTimeRef = useRef<number>(performance.now());
 const isDrawingRef = useRef<boolean>(false);
 const lastStampRef = useRef<{ x: number; y: number } | null>(null);

 const hmRef = useRef<Heightmap>(new Heightmap(384, 256));
 const falloffRef = useRef<FalloffTable>(new FalloffTable(64));
 const rendererRef = useRef<Renderer | null>(null);
 const dirtyRef = useRef<boolean>(true);

 const [tool, setTool] = useState<Tool>('brush');
 const [mode, setMode] = useState<BrushMode>('depth-add');
 const [radius, setRadius] = useState(28);
 const [strength, setStrength] = useState(0.5);
 const [falloff, setFalloff] = useState(0.6);
 const [noiseScale, setNoiseScale] = useState(0.04);
 const [noiseAmount, setNoiseAmount] = useState(1);
 const [shadeAzimuth, setShadeAzimuth] = useState(135);
 const [shadeIntensity, setShadeIntensity] = useState(1);
 const [shadeStrength, setShadeStrength] = useState(0.7);

 const [noiseEnabled, setNoiseEnabled] = useState(true);
 const [noiseSpeedX, setNoiseSpeedX] = useState(0.6);
 const [noiseSpeedY, setNoiseSpeedY] = useState(0.4);
 const [noiseRandomEachFrame, setNoiseRandomEachFrame] = useState(false);
 const [lightAzimuth, setLightAzimuth] = useState(135);
 const [lightElevation, setLightElevation] = useState(45);
 const [ambient, setAmbient] = useState(0.25);
 const [specular, setSpecular] = useState(0.15);
 const [tilt, setTilt] = useState(0.35);
 const [presetIdx, setPresetIdx] = useState(0);

 const brush: BrushParams = useMemo(() => ({
  mode, radius, strength, falloff,
  noiseScale, noiseAmount,
  shadeAzimuth, shadeIntensity,
 }), [mode, radius, strength, falloff, noiseScale, noiseAmount, shadeAzimuth, shadeIntensity]);

 const renderOpts: RenderOpts = useMemo(() => {
  const p = PRESETS[presetIdx];
  return {
   noiseEnabled, noiseSpeedX, noiseSpeedY, noiseRandomEachFrame,
   noiseScale: noiseScale * 8,
   noiseAmount: 0.35,
   lightAzimuth, lightElevation, ambient, specular,
   baseColor: hexToRgb(p.base),
   shadowColor: hexToRgb(p.shadow),
   highlightColor: hexToRgb(p.hi),
   tilt,
   shadeStrength,
  };
 }, [noiseEnabled, noiseSpeedX, noiseSpeedY, noiseRandomEachFrame,
  noiseScale, lightAzimuth, lightElevation, ambient, specular,
  presetIdx, tilt, shadeStrength]);

 // Initialize canvas sizes & renderer
 useEffect(() => {
  const hm = hmRef.current;
  const wrap = canvasWrapRef.current!;
  const display = displayRef.current!;
  const preview = previewRef.current!;
  // Seed with some terrain noise so the canvas isn't empty
  fillNoise(hm.data, hm.w, hm.h, 0.025, 4, 2.0, 0.5, 0, 0);
  hm.normalize();
  // initial shade buffer blank
  // sizing
  const sizeDisplayToWrap = () => {
   const rect = wrap.getBoundingClientRect();
   const dpr = Math.min(2, window.devicePixelRatio || 1);
   const w = Math.max(64, Math.floor(rect.width * dpr));
   const h = Math.max(64, Math.floor(rect.height * dpr));
   display.width = w; display.height = h;
   display.style.width = rect.width + 'px';
   display.style.height = rect.height + 'px';
   preview.width = w; preview.height = h;
   preview.style.width = rect.width + 'px';
   preview.style.height = rect.height + 'px';
   if (!rendererRef.current) rendererRef.current = new Renderer(w, h);
   else rendererRef.current.resize(w, h);
  };
  sizeDisplayToWrap();
  const ro = new ResizeObserver(sizeDisplayToWrap);
  ro.observe(wrap);
  dirtyRef.current = true;
  return () => ro.disconnect();
 }, []);

 // Rebuild falloff when changed
 useEffect(() => { falloffRef.current.rebuild(falloff); }, [falloff]);

 // Render loop
 useEffect(() => {
  const loop = (now: number) => {
   const t = (now - startTimeRef.current) / 1000;
   lastTimeRef.current = now;
   const r = rendererRef.current;
   const hm = hmRef.current;
   const display = displayRef.current;
   if (r && display) {
    const dctx = display.getContext('2d');
    const needRedraw = dirtyRef.current || noiseEnabled;
    if (needRedraw && dctx) {
     r.render(hm, t, renderOpts);
     dirtyRef.current = false;
     dctx.imageSmoothingEnabled = true;
     dctx.clearRect(0, 0, display.width, display.height);
     dctx.drawImage(r.getCanvas(), 0, 0, display.width, display.height);
    }
   }
   rafRef.current = requestAnimationFrame(loop);
  };
  rafRef.current = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(rafRef.current);
 }, [renderOpts, noiseEnabled, noiseRandomEachFrame]);

 // Coordinate conversion: client -> heightmap pixels
 const toHM = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
  const display = displayRef.current!;
  const rect = display.getBoundingClientRect();
  const hm = hmRef.current;
  return {
   x: ((clientX - rect.left) / rect.width) * hm.w,
   y: ((clientY - rect.top) / rect.height) * hm.h,
  };
 }, []);

 const stampAt = useCallback((hmX: number, hmY: number) => {
  const hm = hmRef.current;
  const b: BrushParams = { ...brush, mode: tool === 'erase' && mode === 'depth-add' ? 'depth-sub' : mode };
  stamp(hm, falloffRef.current, b, hmX, hmY);
  dirtyRef.current = true;
 }, [brush, mode, tool]);

 const stampSegment = useCallback((ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = Math.max(1, brush.radius * 0.25);
  const n = Math.ceil(dist / step);
  for (let i = 1; i <= n; i++) {
   const t = i / n;
   stampAt(ax + dx * t, ay + dy * t);
  }
 }, [brush.radius, stampAt]);

 // Pointer handlers
 useEffect(() => {
  const preview = previewRef.current!;
  const drawPreview = (hmX: number, hmY: number, visible: boolean) => {
   const ctx = preview.getContext('2d')!;
   ctx.clearRect(0, 0, preview.width, preview.height);
   if (!visible) return;
   const rect = preview.getBoundingClientRect();
   const hm = hmRef.current;
   const px = (hmX / hm.w) * rect.width;
   const py = (hmY / hm.h) * rect.height;
   const pr = (brush.radius / hm.w) * rect.width;
   ctx.lineWidth = 1.5;
   ctx.strokeStyle = 'rgba(255,255,255,0.85)';
   ctx.beginPath();
   ctx.arc(px, py, pr, 0, Math.PI * 2);
   ctx.stroke();
   ctx.strokeStyle = 'rgba(0,0,0,0.7)';
   ctx.beginPath();
   ctx.arc(px + 1, py + 1, pr, 0, Math.PI * 2);
   ctx.stroke();
  };

  const onDown = (e: PointerEvent) => {
   if (e.button !== 0) return;
   (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
   isDrawingRef.current = true;
   const { x, y } = toHM(e.clientX, e.clientY);
   lastStampRef.current = { x, y };
   stampAt(x, y);
   drawPreview(x, y, true);
  };
  const onMove = (e: PointerEvent) => {
   const { x, y } = toHM(e.clientX, e.clientY);
   if (isDrawingRef.current) {
    const last = lastStampRef.current;
    if (last) stampSegment(last.x, last.y, x, y);
    lastStampRef.current = { x, y };
   }
   drawPreview(x, y, isDrawingRef.current || true);
  };
  const onUp = (_: PointerEvent) => {
   isDrawingRef.current = false;
   lastStampRef.current = null;
   // blur shade after stroke to avoid column pattern from brush grid
   if (mode === 'shade') {
    blurShade(hmRef.current, 1);
    dirtyRef.current = true;
   }
  };
  const onLeave = () => { drawPreview(0, 0, false); };

  preview.addEventListener('pointerdown', onDown);
  preview.addEventListener('pointermove', onMove);
  preview.addEventListener('pointerup', onUp);
  preview.addEventListener('pointercancel', onUp);
  preview.addEventListener('pointerleave', onLeave);
  return () => {
   preview.removeEventListener('pointerdown', onDown);
   preview.removeEventListener('pointermove', onMove);
   preview.removeEventListener('pointerup', onUp);
   preview.removeEventListener('pointercancel', onUp);
   preview.removeEventListener('pointerleave', onLeave);
  };
 }, [toHM, stampAt, stampSegment, mode, brush.radius]);

 // Mark dirty on option changes
 useEffect(() => { dirtyRef.current = true; }, [
  lightAzimuth, lightElevation, ambient, specular, tilt, presetIdx, shadeStrength,
 ]);

 // Mark dirty when noise state changes (already handled in loop but be safe)
 useEffect(() => { dirtyRef.current = true; }, [noiseEnabled, noiseSpeedX, noiseSpeedY, noiseRandomEachFrame]);

 // Actions
 const onClearDepth = () => { hmRef.current.clearDepth(); dirtyRef.current = true; };
 const onClearShade = () => { hmRef.current.clearShade(); dirtyRef.current = true; };
 const onNewTerrain = () => {
  fillNoise(hmRef.current.data, hmRef.current.w, hmRef.current.h, 0.025, 4, 2.0, 0.5,
   Math.random() * 1000, Math.random() * 1000);
  hmRef.current.normalize();
  dirtyRef.current = true;
 };
 const onExport = () => {
  const r = rendererRef.current;
  if (!r) return;
  const link = document.createElement('a');
  link.download = 'noise-painter.png';
  link.href = r.canvas.toDataURL('image/png');
  link.click();
 };

 const setModeSmart = (m: BrushMode) => { setMode(m); setTool('brush'); };

 return (
  <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
   {/* Canvas */}
   <div className="relative flex-1 bg-neutral-900">
    <div ref={canvasWrapRef} className="absolute inset-0 m-4 overflow-hidden rounded-xl ring-1 ring-neutral-800 shadow-2xl">
     <canvas ref={displayRef} className="absolute inset-0 h-full w-full" />
     <canvas ref={previewRef} className="absolute inset-0 h-full w-full touch-none cursor-crosshair" />
    </div>
    <div className="pointer-events-none absolute left-6 top-6 z-10 rounded-lg bg-black/60 px-3 py-2 text-xs text-neutral-300 backdrop-blur">
     <div className="font-semibold text-neutral-100">Noise Painter</div>
     <div className="opacity-70">heightmap + live noise displacement</div>
    </div>
    <div className="absolute bottom-6 right-6 z-10 flex gap-2">
     <button onClick={onExport} className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs ring-1 ring-neutral-700 hover:bg-neutral-700">Export PNG</button>
     <button onClick={onNewTerrain} className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs ring-1 ring-neutral-700 hover:bg-neutral-700">New Terrain</button>
    </div>
   </div>

   {/* Sidebar */}
   <aside className="flex w-80 flex-col gap-3 overflow-y-auto border-l border-neutral-800 bg-neutral-925 p-4 text-sm" style={{ background: '#0c0c0d' }}>
    {/* Tool */}
    <section>
     <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Tool</div>
     <div className="grid grid-cols-4 gap-1">
      {(['depth-add','depth-sub','depth-noise','shade'] as BrushMode[]).map(m => (
       <button key={m}
        onClick={() => setModeSmart(m)}
        className={`rounded px-2 py-1.5 text-[11px] ring-1 transition ${
         mode === m ? 'bg-indigo-600 ring-indigo-400 text-white' : 'bg-neutral-800 ring-neutral-700 text-neutral-300 hover:bg-neutral-700'
        }`}
        title={m}>
        {m === 'depth-add' ? 'Add' : m === 'depth-sub' ? 'Sub' : m === 'depth-noise' ? 'Noise' : 'Shade'}
       </button>
      ))}
     </div>
     <button onClick={() => setTool(t => t === 'erase' ? 'brush' : 'erase')}
      className={`mt-2 w-full rounded px-2 py-1.5 text-[11px] ring-1 transition ${
       tool === 'erase' ? 'bg-rose-600 ring-rose-400 text-white' : 'bg-neutral-800 ring-neutral-700 text-neutral-300 hover:bg-neutral-700'
      }`}>Eraser (subtracts depth) {tool === 'erase' ? 'ON' : 'OFF'}</button>
    </section>

    {/* Brush */}
    <section>
     <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Brush</div>
     <Slider label="Radius" value={radius} min={2} max={120} step={1} onChange={setRadius} />
     <Slider label="Strength" value={strength} min={0} max={1} step={0.01} onChange={setStrength} />
     <Slider label="Falloff" value={falloff} min={0.05} max={1} step={0.01} onChange={setFalloff} />
     {(mode === 'depth-noise') && (
      <>
       <Slider label="Noise Scale" value={noiseScale} min={0.005} max={0.2} step={0.001} onChange={setNoiseScale} />
       <Slider label="Noise Amount" value={noiseAmount} min={0} max={2} step={0.01} onChange={setNoiseAmount} />
      </>
     )}
     {mode === 'shade' && (
      <>
       <Slider label="Shade Azimuth" value={shadeAzimuth} min={0} max={360} step={1} onChange={setShadeAzimuth} suffix="°" />
       <Slider label="Shade Intensity" value={shadeIntensity} min={0} max={2} step={0.01} onChange={setShadeIntensity} />
       <Slider label="Shade Strength" value={shadeStrength} min={0} max={1} step={0.01} onChange={setShadeStrength} />
      </>
     )}
    </section>

    {/* Noise displacement */}
    <section>
     <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
      <span>Noise Displacement</span>
      <label className="flex items-center gap-1 normal-case tracking-normal text-neutral-300">
       <input type="checkbox" className="accent-indigo-500" checked={noiseEnabled} onChange={e => setNoiseEnabled(e.target.checked)} />
       enabled
      </label>
     </div>
     <label className="flex items-center justify-between rounded bg-neutral-800 px-2 py-1.5 text-[11px] ring-1 ring-neutral-700">
      <span>VX movement</span>
      <input type="checkbox" className="accent-indigo-500" checked={noiseSpeedX !== 0 || noiseSpeedY !== 0}
       onChange={e => {
        if (e.target.checked) { setNoiseSpeedX(0.6); setNoiseSpeedY(0.4); }
        else { setNoiseSpeedX(0); setNoiseSpeedY(0); }
       }} />
     </label>
     <Slider label="Speed X" value={noiseSpeedX} min={-3} max={3} step={0.05} onChange={setNoiseSpeedX} />
     <Slider label="Speed Y" value={noiseSpeedY} min={-3} max={3} step={0.05} onChange={setNoiseSpeedY} />
     <label className="mt-1 flex items-center justify-between rounded bg-neutral-800 px-2 py-1.5 text-[11px] ring-1 ring-neutral-700">
      <span>Random each frame</span>
      <input type="checkbox" className="accent-indigo-500" checked={noiseRandomEachFrame} onChange={e => setNoiseRandomEachFrame(e.target.checked)} />
     </label>
    </section>

    {/* Light */}
    <section>
     <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Light</div>
     <Slider label="Azimuth" value={lightAzimuth} min={0} max={360} step={1} onChange={setLightAzimuth} suffix="°" />
     <Slider label="Elevation" value={lightElevation} min={0} max={90} step={1} onChange={setLightElevation} suffix="°" />
     <Slider label="Ambient" value={ambient} min={0} max={1} step={0.01} onChange={setAmbient} />
     <Slider label="Specular" value={specular} min={0} max={1} step={0.01} onChange={setSpecular} />
     <Slider label="Tilt (3D)" value={tilt} min={0} max={1.2} step={0.01} onChange={setTilt} />
    </section>

    {/* Palette */}
    <section>
     <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Palette</div>
     <div className="grid grid-cols-3 gap-1">
      {PRESETS.map((p, i) => (
       <button key={p.name} onClick={() => setPresetIdx(i)}
        className={`overflow-hidden rounded ring-1 transition ${presetIdx === i ? 'ring-indigo-400' : 'ring-neutral-700 hover:ring-neutral-500'}`}
        title={p.name}>
        <div className="flex h-5">
         <div className="flex-1" style={{ background: p.shadow }} />
         <div className="flex-1" style={{ background: p.base }} />
         <div className="flex-1" style={{ background: p.hi }} />
        </div>
        <div className="bg-neutral-800 py-0.5 text-[10px]">{p.name}</div>
       </button>
      ))}
     </div>
    </section>

    {/* Clear */}
    <section className="grid grid-cols-2 gap-2">
     <button onClick={onClearDepth} className="rounded bg-neutral-800 px-2 py-1.5 text-[11px] ring-1 ring-neutral-700 hover:bg-neutral-700">Clear Depth</button>
     <button onClick={onClearShade} className="rounded bg-neutral-800 px-2 py-1.5 text-[11px] ring-1 ring-neutral-700 hover:bg-neutral-700">Clear Shade</button>
    </section>
   </aside>
  </div>
 );
}

function Slider({ label, value, min, max, step, onChange, suffix }:
 { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string }) {
 return (
  <label className="mb-1.5 block">
   <div className="mb-0.5 flex items-center justify-between text-[11px] text-neutral-300">
    <span>{label}</span>
    <span className="font-mono tabular-nums text-neutral-400">{value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}{suffix ?? ''}</span>
   </div>
   <input type="range" min={min} max={max} step={step} value={value}
    onChange={e => onChange(parseFloat(e.target.value))}
    className="h-1.5 w-full cursor-pointer appearance-none rounded bg-neutral-800 accent-indigo-500" />
  </label>
 );
}
