# 700x450 period=120 depthScale=30, every 3rd row, 24-bit noise at grain 1

| preset | required | satisfied | dropped |
|---|---|---|---|
| shapes | 84613 | 84613 | 0 |
| torus | 84036 | 84036 | 0 |
| heart | 85418 | 85418 | 0 |
| ripples | 81842 | 81842 | 0 |
| pyramid | 85068 | 85068 | 0 |

ok   flat rows after an occluder are not corrupted by a stale eye buffer  35105 pairs, 35105 broken
ok   HSR is a no-op on a flat surface
ok   HSR relinks a depth step  108 px
ok   HSR_EPS keeps a sub-tolerance depth step linked
ok   HSR suppresses a point more than HSR_EPS behind the nearest

| preset | freed px | runs | longest run | mean run |
|---|---|---|---|---|
| shapes | 2.3% | 230 | 21 px | 10.4 px |
| torus | 2.8% | 2877 | 2 px | 1.0 px |
| heart | 1.5% | 692 | 7 px | 2.3 px |
| ripples | 4.6% | 4518 | 3 px | 1.1 px |
| pyramid | 1.8% | 682 | 3 px | 2.8 px |

A freed run of L px keeps its own pattern instead of the stretched one, so at grain 16 it
reads as a blob up to L*16 px of untouched texture — the smear that made this opt-in.

all checks passed
