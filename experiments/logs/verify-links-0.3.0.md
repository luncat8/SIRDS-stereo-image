period=120 depthScale=30 size=700x450, every 3rd row

| preset | linker | hsr | constraints met | ghost shifts |
|---|---|---|---|---|
| shapes | union-find | off | 100.00% (87000/87000) | 9.2% |
| shapes | union-find | on  | 100.00% (84613/84613) | 0.0% |
| shapes | naive | off | 98.66% (85838/87000) | 4.8% |
| torus | union-find | off | 100.00% (87000/87000) | 11.9% |
| torus | union-find | on  | 100.00% (84036/84036) | 2.2% |
| torus | naive | off | 98.18% (85416/87000) | 9.1% |
| heart | union-find | off | 100.00% (87000/87000) | 8.8% |
| heart | union-find | on  | 100.00% (85418/85418) | 4.1% |
| heart | naive | off | 98.51% (85702/87000) | 6.2% |
| ripples | union-find | off | 100.00% (87000/87000) | 30.6% |
| ripples | union-find | on  | 100.00% (81842/81842) | 13.7% |
| ripples | naive | off | 95.69% (83251/87000) | 20.7% |
| pyramid | union-find | off | 100.00% (87000/87000) | 3.0% |
| pyramid | union-find | on  | 100.00% (85068/85068) | 0.0% |
| pyramid | naive | off | 98.93% (86068/87000) | 2.7% |

Union-find must satisfy 100% of the constraints; the naive overwrite drops the ones that collide.
ok — no dropped constraints
