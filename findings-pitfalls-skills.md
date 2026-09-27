# findings, pitfalls, skills

## SIRDS math
- Thimbleby separation `s = round((1-μz)·E/(2-μz))` gives `s = E/2` at the far plane (z=0), not `E`. If the guide dots or the pattern tile use `E`, they are off by a factor of 2. Parametrize by the far-plane period `P` and set `E = 2P`.
- A naive `same[right] = left` overwrite loses constraints when links collide. Use union-find with the root kept as the leftmost index (`same[i] <= i`), then fill left→right by copying `row[same[x]]`. Measured on gf's presets: the overwrite silently drops 1–4% of the stereo constraints the depth map demands.
- Keep `maxDepthShift < period - minPeriod`, or the separation clamps to 1 px and the row degenerates. Clamp the depth slider to `period - MIN_SHIFT` instead of only clamping inside the renderer, so the GUI cannot express the broken state.

## hidden surface removal
- **A per-eye z-buffer is the exact HSR, and it is one `O(w)` pass — the ray-march is not needed.** All surface points that map to the same left-eye pixel lie on that eye's ray, so only the nearest may claim it: take `leftZ[x - s/2] = max z` and `rightZ[x + s/2] = max z` in a first pass, then skip any link whose `z` is below either. Real Thimbleby ray-marches `t = 1…` for the same answer at up to `D/2` steps per pixel.
- For the linear model `s = P - zD`, the march's step is `zt = z + 2t/D` (from `s(z') = s(z) - 2t`), not the optical `z + 2(2-μz)t/(μE)`. Useful only if you actually want the march.
- Give the z-buffer test a small tolerance (`z < leftZ[left] - 0.01`), or rounding shreds smooth slopes into stripes.
- HSR must be a no-op on a flat surface — a plane has nothing to occlude. Good regression test.
- The z-buffer pass and the link pass must apply the *same* out-of-range skip, and the buffers must be re-cleared on every row: one row of a strong occluder otherwise leaks its maxima into the flat rows below it.
- The tolerance is much weaker than it looks. A point can only collide with the point one pixel to its left, whose separation is 2 smaller, so two points on the same eye ray differ in depth by between `1/D` and `2/D`. `HSR_EPS = 0.01` therefore rescues nothing once `D < 100`; it only keeps coplanar ties. The integer separation is the real quantizer, not the tolerance.
- **HSR is correct and still wrong to leave on.** A suppressed point leaves its pixels unsourced, so they sample the pattern at their own `x` instead of a stretched one, and they come in runs — up to 21 px on gf's `shapes` at period 120. At grain 16 that run reads as a blob of unstretched texture, i.e. a smear. It stays opt-in, and out of the saved settings: an old save carries the old default-on value and would keep the smear alive for every returning user.
- The shipped z-buffer scatters forward (each point writes into its two eye pixels). Test the visibility rule the other way round — for each eye pixel, gather every claimant and take the nearest — or a stale buffer or a swapped eye index passes a self-referential audit. `experiments/hsr-audit.js` does that and demands 100% constraint satisfaction.

## CPU / GPU parity
- `Math.sin` hashes are not bit-stable across a CPU and a GPU. White/color use a uint32 mixer (`HASH_K`) with the same literals in the fragment shader; `experiments/gl-parity.js` fails if they drift.
- Grain for those patterns is integer tenths (`floor((10x - tenths) / (10g)) * g`). Slider steps are 0.1 px, and float32 vs float64 disagree exactly at cell edges.
- Add `HASH_BIAS` before the cast to `uint`. Some mobile drivers drop `uint(negativeInt)`.
- `preserveDrawingBuffer: false` clears the drawing buffer after composite. A static stereogram (stable seed, no drift) does not redraw, so the image vanishes. Use `true`.
- `#glCanvas` must be `pointer-events: none`. Hide the 2D canvas with `opacity: 0`, not `visibility: hidden` — a hidden element is not a hit target, and the drag would die.
- Do not use a Web Worker for this page. Chrome blocks workers on `file://`. Chunk the link rebuild on the page thread instead.

## hot path
- Stereo links depend only on depth, period and depth scale — **never on the animation frame**. Cache them in an `Int32Array(w*h)` rebuilt on control change, and the animation loop collapses to one gather: `out[i] = (root === i) ? texel(x,y) : out[rowStart + root]`. This is what makes an exact HSR pass affordable, and it hands a GPU port a parallel gather with no sequential scan.
- With the leftmost-root invariant `links[x] <= x`, resolving union-find roots is a **single** left-to-right hop (`links[x] = links[links[x]]`), not a loop — everything below `x` is already resolved.
- Only ~`period` pixels per row are group roots, so the texel function is evaluated ~`period` times per row, not `w` times. Optimizing the pattern sampler matters far less than the per-pixel store.
- Take a `Uint32Array` view on `ImageData.data.buffer` and write one packed little-endian RGBA word per pixel instead of four byte stores. Pass `byteOffset` and `w * h` — the buffer is not always a tight view at offset 0.
- `willReadFrequently: true` forces a software canvas backend. Once depth lives in a `Float32Array` nothing reads the visible canvas back — drop the flag there and put it on the offscreen text-rasterizing canvas only.
- A stable seed with zero drift renders an identical frame forever. Skip the render instead of burning a `requestAnimationFrame` on it.
- Throttle pointer-drag handlers to one `requestAnimationFrame` apply; pointer events fire faster than frames.

## noise
- Gradient (Perlin/simplex) noise is 0 at integer lattice points. Sampling it at integer coords for "random each frame" gives a flat result. Use a hash for white noise.
- For animated SIRDS noise, quantize the grain after applying the drift offset, so a stable seed pans as one persistent pattern. Do that in integer tenths, not float32, if a GPU has to match it.
- Procedural tile textures must use a seeded PRNG, not `Math.random`, or regenerating on resize/slider changes flickers.
- `(v + k + 255) % 255` is an off-by-one wrap that can never produce 255. Use `& 255`.

## canvas
- Procedural depth maps must be sized relative to the canvas `w, h`. Absolute pixel coordinates break when the canvas follows its container.
- Position the canvas absolutely inside its wrapper. Otherwise canvas size → layout → ResizeObserver → resize makes a feedback loop.
- If the canvas is a two-axis control, CSS `touch-action` must be `none`, not `pan-y` — otherwise the browser eats the vertical drag. Setting it on `pointerdown` is too late.
- `getContext('2d')` and `getContext('webgl2')` are mutually exclusive on one canvas. Stack a second absolutely-positioned canvas instead.

## testing a single-file HTML under node
- Wrap the DOM-free half in marker comments (`// >>> gf-core start` … `// <<< gf-core end`) and have a node helper slice it out of the `.html` and `new Function(src + 'return {…}')` it. Tests then run the **shipped** code, not a copy that drifts. Slice from the end of the marker *line*, or a trailing comment on the marker becomes a syntax error.
- A ~90-line stub DOM (`getElementById` built by regex-scanning the HTML for `id=`, a fake 2D context, a fake `localStorage`) is enough to boot the whole `<script>` headlessly. It catches wrong ids, boot-order/TDZ errors and dead wiring with no browser.
- Stub `requestAnimationFrame` as a **queue**, not a single slot: a self-rearming animation loop and a pending drag callback coexist in a real browser.
- A PNG writer is ~40 lines with built-in `zlib` (IHDR/IDAT/IEND + CRC32). Worth it — depth maps are far easier to judge by eye than by assertion.

## validating a stereogram without eyes
- Do **not** score a SIRDS by "recover depth from the smallest repeating shift". A linked group spans many positions, so shorter valid repeats inside the same group are expected, and smooth depth maps score 20–60% while being perfectly correct.
- Score it by *constraint satisfaction* instead: recompute which links the depth map demands, then assert those pixel pairs are byte-equal in the output. Correct implementations hit 100%.
- Use 24-bit colour noise at grain 1 for the audit — an accidental colour repeat is ~1/16M, so a repeat proves a real link.
- A useful second metric is the *ghost rate*: pixels that also repeat at some other shift, i.e. a second wrong depth on offer. Good HSR drives it to 0% on hard-edged shapes.
