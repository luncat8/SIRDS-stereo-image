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

## hot path
- Stereo links depend only on depth, period and depth scale — **never on the animation frame**. Cache them in an `Int32Array(w*h)` rebuilt on control change, and the animation loop collapses to one gather: `out[i] = (root === i) ? texel(x,y) : out[rowStart + root]`. This is what makes an exact HSR pass affordable, and it hands a GPU port a parallel gather with no sequential scan.
- With the leftmost-root invariant `links[x] <= x`, resolving union-find roots is a **single** left-to-right hop (`links[x] = links[links[x]]`), not a loop — everything below `x` is already resolved.
- Only ~`period` pixels per row are group roots, so the texel function is evaluated ~`period` times per row, not `w` times. Optimizing the pattern sampler matters far less than the per-pixel store.
- Take a `Uint32Array` view on `ImageData.data.buffer` and write one packed little-endian RGBA word per pixel instead of four byte stores.
- `willReadFrequently: true` forces a software canvas backend. Once depth lives in a `Float32Array` nothing reads the visible canvas back — drop the flag there and put it on the offscreen text-rasterizing canvas only.
- A stable seed with zero drift renders an identical frame forever. Skip the render instead of burning a `requestAnimationFrame` on it.
- Throttle pointer-drag handlers to one `requestAnimationFrame` apply; pointer events fire faster than frames.

## noise
- Gradient (Perlin/simplex) noise is 0 at integer lattice points. Sampling it at integer coords for "random each frame" gives a flat result. Use a hash for white noise.
- For animated SIRDS noise, quantize the grain after applying the drift offset (`floor((x - moveX)/grain)`), so the stable seed pans as one persistent pattern.
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
