# findings, pitfalls, skills

## SIRDS math
- Thimbleby separation `s = round((1-μz)·E/(2-μz))` gives `s = E/2` at the far plane (z=0), not `E`. If the guide dots or the pattern tile use `E`, they are off by a factor of 2. Parametrize by the far-plane period `P` and set `E = 2P`.
- A naive `same[right] = left` overwrite loses constraints when links collide. Use union-find with the root kept as the leftmost index (`same[i] <= i`), then fill left→right by copying `row[same[x]]`.
- Real Thimbleby hidden-surface removal ray-marches `t = 1…` while `zt = z + 2(2-μz)t/(μE) < 1`. The link is hidden if `depth[x±t] >= zt`. Comparing the max z of the endpoints is not equivalent.
- Keep `maxDepthShift < period - minPeriod`, or the separation clamps to 1 px and the row degenerates.

## noise
- Gradient (Perlin/simplex) noise is 0 at integer lattice points. Sampling it at integer coords for "random each frame" gives a flat result. Use a hash for white noise.
- For animated SIRDS noise, quantize the grain after applying the drift offset (`floor((x - moveX)/grain)`), so the stable seed pans as one persistent pattern.
- Procedural tile textures must use a seeded PRNG, not `Math.random`, or regenerating on resize/slider changes flickers.

## canvas
- Procedural depth maps must be sized relative to the canvas `w, h`. Absolute pixel coordinates break when the canvas follows its container.
- Position the canvas absolutely inside its wrapper. Otherwise canvas size → layout → ResizeObserver → resize makes a feedback loop.
