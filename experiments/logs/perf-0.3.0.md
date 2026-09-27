# gf.html CPU perf — node v22.22.3 — 2026-09-27T18:06:23.306Z
period=100 depth=20 grain=2 preset=torus, median of 20 runs (ms)

| size | links hsr=off | links hsr=on | frame white | frame color | frame simplex3d | frame stripe | roots/row |
|---|---|---|---|---|---|---|---|
| 700x450 | 5.3 | 8.6 | 3.7 | 5.6 | 6.6 | 3.7 | 100 |
| 1280x800 | 17.6 | 28.1 | 10.3 | 12.1 | 12.1 | 9.1 | 100 |

Links are cached: they rebuild only when depth/period/depth-scale/HSR change,
so the per-frame cost is the gather+texel column alone. periodAt(1,100,20)=80 px.
