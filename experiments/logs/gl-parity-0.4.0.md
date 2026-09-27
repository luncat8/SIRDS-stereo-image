# gl-parity 0.4.0

`node experiments/gl-parity.js` — shader block extracted from `gf.html`.

Structural contract passed: hash literals, `HASH_BIAS`, `SEED`, `GRAD` vs `simplexGrad3`, integer
grain formula, y-flip, root fetch, white high-bit, color top-byte.

`@shaderfrog/glsl-parser` accepts both `#version 300 es` shaders. Warnings about `gl_VertexID`,
`gl_Position` and `gl_FragCoord` are the parser not knowing the built-ins.

GPU pixel compare skipped: Chrome is not installed in this sandbox (TLS to the browser CDN failed).
The harness runs automatically when puppeteer's Chrome binary exists. Expected bar: exact white/color
at 700×450 and 1280×800 for period=120, depth=28, grain=2, preset=shapes; simplex/stripe logged
with a channel tolerance.
