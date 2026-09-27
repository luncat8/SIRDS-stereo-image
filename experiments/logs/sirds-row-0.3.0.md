ok   periodAt(z=0) === P  P=60
ok   periodAt(z=0) === P  P=100
ok   periodAt(z=0) === P  P=400
ok   periodAt(z=0) === P  P=640
ok   periodAt(1,100,20) === 80
ok   degenerate P=60 D=160 clamps to MIN_SHIFT  got 8
ok   periodAt monotonic in z
ok   links[x] <= x (hsr=false)
ok   links point straight at a root (hsr=false)
ok   linked pairs are byte-equal (hsr=false)  300 pairs
ok   links[x] <= x (hsr=true)
ok   links point straight at a root (hsr=true)
ok   linked pairs are byte-equal (hsr=true)  284 pairs
ok   ramp collapses to few roots (union-find merged groups)  90 roots of 400
ok   HSR changes the linking of a depth step  32 px relinked
ok   HSR frees occluded pixels (they get fresh noise)  32 px freed
ok   HSR is a no-op on a flat surface
ok   packRGBA is opaque little-endian  0xff030201
ok   stripe red channel wraps over a full byte  max 255
ok   pan by one grain shifts the stable pattern

all checks passed
