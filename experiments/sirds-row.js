// Validation for the gf.html SIRDS core: separation helper, union-find linking, HSR.
// run: node experiments/sirds-row.js
const { loadCore } = require('./gf-core');
const core = loadCore();
const { MIN_SHIFT, periodAt, packRGBA, texel, linkRow, PAT } = core;

let failed = 0;
function check(name, ok, detail) {
	if (!ok) failed++;
	console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + detail));
}

// --- periodAt -------------------------------------------------------------
for (const P of [60, 100, 400, 640]) {
	check('periodAt(z=0) === P  P=' + P, periodAt(0, P, 20) === P);
}
check('periodAt(1,100,20) === 80', periodAt(1, 100, 20) === 80);
check('degenerate P=60 D=160 clamps to MIN_SHIFT', periodAt(1, 60, 160) === MIN_SHIFT, 'got ' + periodAt(1, 60, 160));
check('periodAt monotonic in z', periodAt(0.2, 200, 50) > periodAt(0.8, 200, 50));

// --- helpers --------------------------------------------------------------
function makeRow(w, spec) {
	const d = new Float32Array(w);
	for (let x = 0; x < w; x++) d[x] = spec(x);
	return d;
}

function renderRow(depth, w, P, D, hsr) {
	const links = new Int32Array(w);
	linkRow(depth, links, 0, w, P, D, hsr, new Float32Array(w), new Float32Array(w));
	const out = new Uint32Array(w);
	for (let x = 0; x < w; x++) out[x] = links[x] === x ? texel(x, 0) : out[links[x]];
	return { links, out };
}

PAT.type = 0; PAT.grain = 1; PAT.moveX = 0; PAT.moveY = 0; PAT.timeZ = 0; PAT.frame = 0;

// --- invariants on a step row --------------------------------------------
const W = 400;
const stepRow = makeRow(W, x => (x >= 150 && x < 250 ? 0.8 : 0));

for (const hsr of [false, true]) {
	const { links, out } = renderRow(stepRow, W, 100, 20, hsr);

	let rootsLeft = true;
	for (let x = 0; x < W; x++) if (links[x] > x) rootsLeft = false;
	check('links[x] <= x (hsr=' + hsr + ')', rootsLeft);

	let flat = true;
	for (let x = 0; x < W; x++) if (links[links[x]] !== links[x]) flat = false;
	check('links point straight at a root (hsr=' + hsr + ')', flat);

	// every link the renderer kept must actually show the same colour in both eyes
	let pairsOk = true, pairs = 0;
	for (let x = 0; x < W; x++) {
		const s = periodAt(stepRow[x], 100, 20);
		const left = x - (s >> 1), right = left + s;
		if (left < 0 || right >= W) continue;
		if (links[left] !== links[right]) continue;
		pairs++;
		if (out[left] !== out[right]) pairsOk = false;
	}
	check('linked pairs are byte-equal (hsr=' + hsr + ')', pairsOk && pairs > 0, pairs + ' pairs');
}

// --- union-find beats plain same[right]=left -----------------------------
// A ramp makes several links collide on the same right index; the naive overwrite drops
// the earlier constraint, union-find keeps both groups merged.
const rampRow = makeRow(W, x => Math.min(1, Math.max(0, (x - 120) / 160)));
{
	const { links } = renderRow(rampRow, W, 120, 60, false);
	let groups = 0;
	for (let x = 0; x < W; x++) if (links[x] === x) groups++;
	check('ramp collapses to few roots (union-find merged groups)', groups < W * 0.45, groups + ' roots of ' + W);
}

// --- HSR removes echoes ---------------------------------------------------
{
	const off = renderRow(stepRow, W, 100, 40, false);
	const on = renderRow(stepRow, W, 100, 40, true);
	let diff = 0;
	for (let x = 0; x < W; x++) if (off.links[x] !== on.links[x]) diff++;
	check('HSR changes the linking of a depth step', diff > 0, diff + ' px relinked');

	let suppressed = 0;
	for (let x = 0; x < W; x++) if (on.links[x] === x && off.links[x] !== x) suppressed++;
	check('HSR frees occluded pixels (they get fresh noise)', suppressed > 0, suppressed + ' px freed');

	// a flat surface has nothing to occlude: HSR must be a no-op there
	const flatRow = makeRow(W, () => 0.4);
	const a = renderRow(flatRow, W, 100, 40, false);
	const b = renderRow(flatRow, W, 100, 40, true);
	let same = true;
	for (let x = 0; x < W; x++) if (a.links[x] !== b.links[x]) same = false;
	check('HSR is a no-op on a flat surface', same);
}

// --- pattern sampler ------------------------------------------------------
{
	check('packRGBA is opaque little-endian', packRGBA(1, 2, 3) === 0xff030201 >>> 0, '0x' + packRGBA(1, 2, 3).toString(16));

	PAT.type = 3; // stripe: the old (v + k + 255) % 255 could never produce 255
	let maxRed = 0;
	for (let x = 0; x < 2000; x++) maxRed = Math.max(maxRed, texel(x, x % 97) & 255);
	check('stripe red channel wraps over a full byte', maxRed === 255, 'max ' + maxRed);

	PAT.type = 0; PAT.grain = 4; PAT.moveX = 7; PAT.moveY = 0;
	// grain quantized after the pan: shifting the pan by one grain shifts the pattern exactly
	PAT.moveX = 0;
	const base = [];
	for (let x = 0; x < 64; x++) base.push(texel(x, 0));
	PAT.moveX = 4;
	let shifted = true;
	for (let x = 4; x < 64; x++) if (texel(x, 0) !== base[x - 4]) shifted = false;
	check('pan by one grain shifts the stable pattern', shifted);

	PAT.moveX = -4;
	let neg = true;
	for (let x = 0; x < 60; x++) if (texel(x, 0) !== base[x + 4]) neg = false;
	check('pan by minus one grain shifts the other way', neg);
	PAT.moveX = 0; PAT.grain = 1;
}

// --- integer grain + hash (the CPU/GPU parity contract) -------------------
{
	const { tenthsOf, floorDiv, grainOrigin, hashU32, HASH_BIAS, TENTHS_LIM } = core;
	check('tenthsOf(4) === 40', tenthsOf(4) === 40);
	check('tenthsOf(-1.6) === -16', tenthsOf(-1.6) === -16);
	check('tenthsOf clamps into int32', tenthsOf(1e15) === TENTHS_LIM && tenthsOf(-1e15) === -TENTHS_LIM);

	let grainOk = true;
	for (const g of [1, 2, 3, 7, 16]) {
		for (let moveT = -80; moveT <= 80; moveT += 7) {
			for (let x = -4; x < 90; x++) {
				const got = grainOrigin(x, moveT, g);
				const ref = Math.floor((x * 10 - moveT) / (g * 10)) * g;
				if (got !== ref) grainOk = false;
			}
		}
	}
	check('grainOrigin matches floor((10x - t) / (10g)) * g', grainOk);

	let restOk = true;
	for (let g = 1; g <= 8; g++) {
		for (let x = 0; x < 200; x++) if (grainOrigin(x, tenthsOf(0), g) !== Math.floor(x / g) * g) restOk = false;
	}
	check('zero pan matches the old floor(x/g)*g cells', restOk);

	const lo = grainOrigin(0, TENTHS_LIM, 1);
	check('biased grain coord stays non-negative', lo + HASH_BIAS >= 0, lo + ' + bias');
	check('hashU32 is stable uint32', hashU32(-3, 4, 1, 2) === hashU32(-3, 4, 1, 2) && hashU32(1, 2, 0, 0) <= 0xffffffff);

	PAT.type = 0; PAT.grain = 1; PAT.moveX = 0; PAT.moveY = 0; PAT.frame = 0;
	let binary = true;
	for (let i = 0; i < 64; i++) {
		const v = texel(i * 3, i);
		if (v !== 0xff000000 && v !== 0xffffffff) binary = false;
	}
	check('white noise is only black or white', binary);
}

console.log(failed === 0 ? '\nall checks passed' : '\n' + failed + ' check(s) FAILED');
process.exit(failed === 0 ? 0 : 1);
