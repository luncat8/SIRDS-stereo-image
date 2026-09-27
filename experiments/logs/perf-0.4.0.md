# gf.html CPU perf — node v22.22.3 — after the integer hash

period=100 depth=20 grain=2 preset=torus, median of 20 runs (ms). Gather only; links are cached.

| size | links hsr=off | links hsr=on | frame white | frame color | frame simplex3d | frame stripe | roots/row |
|---|---|---|---|---|---|---|---|
| 700x450 | 5.3 | 8.5 | 2.3 | 5.7 | 6.0 | 3.2 | 100 |
| 1280x800 | 15.5 | 29.3 | 8.2 | 10.9 | 8.7 | 6.4 | 100 |

White is faster than the sin hash it replaced (3.3 ms → 2.3 ms at 700×450). The link columns are
the same work as 0.3.

Larger canvases, measured before the hash swap (frame cost only moves by the mixer; links do not):

| size | links off | links on | frame white | frame simplex |
|---|---|---|---|---|
| 1920x1080 | 25.8 | 39.9 | 18.1 | 21.5 |
| 2560x1440 | 44.3 | 92.6 | 28.8 | 35.7 |

The frame leaves a 16 ms budget at 1080p. That is what the WebGL2 gather is for. The link rebuild
is the remaining hitch and is not on the animation path — see `0.5.0-plan.md`.
