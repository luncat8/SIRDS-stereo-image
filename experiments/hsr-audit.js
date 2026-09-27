// Audit of the "hide hidden surfaces" pass in gf.html, independent of the implementation.
//
// The shipped linkRow decides visibility with a forward scatter: every surface point writes its
// depth into the two eye pixels it lands on, then keeps the pair only if it is still the closest
// writer. That is easy to get subtly wrong (stale buffer, off-by-one eye index, tolerance on the
// wrong side), so the reference here is built the other way round: for every eye pixel, collect
// the full list of claimants and take the nearest one. A row is correct when the renderer satisfies
// 100% of the constraints that reference demands, on colour noise where an accidental repeat is
// ~1/16M.
//
// Also measures what HSR costs visually: every suppressed point leaves a pixel that samples the
// pattern at its own position instead of a stretched one, and those pixels come in runs. That run
// length is the "smear" and it is the reason the toggle now defaults to off.
//
// run: node experiments/hsr-audit.js
const { loadCore } = require('./gf-core');
const core = loadCore();
const { HSR_EPS, PAT, periodAt, texel, linkRow, postProcessDepth } = core;

let failed = 0;
function check(name, ok, detail) {
	if (!ok) failed++;
	console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + detail));
}

const W = 700, H = 450, PERIOD = 120, DEPTH = 30, ROW_STEP = 3;

// reference visibility: per eye pixel, the nearest of all points that land on it
function refRequired(d, o, w, P, D) {
	const leftBest = new Float64Array(w).fill(-1);
	const rightBest = new Float64Array(w).fill(-1);
	const need = [];
	for (let x = 0; x < w; x++) {
		const s = periodAt(d[o + x], P, D);
		const left = x - (s >> 1), right = left + s;
		if (left < 0 || right >= w) continue;
		if (d[o + x] > leftBest[left]) leftBest[left] = d[o + x];
		if (d[o + x] > rightBest[right]) rightBest[right] = d[o + x];
	}
	for (let x = 0; x < w; x++) {
		const z = d[o + x];
		const s = periodAt(z, P, D);
		const left = x - (s >> 1), right = left + s;
		if (left < 0 || right >= w) continue;
		if (z < leftBest[left] - HSR_EPS || z < rightBest[right] - HSR_EPS) continue;
		need.push(left, right);
	}
	return need;
}

const depth = new Float32Array(W * H);
const links = new Int32Array(W * H);
const out = new Uint32Array(W * H);
const lz = new Float32Array(W), rz = new Float32Array(W);

PAT.type = 1; PAT.grain = 1; PAT.moveX = 0; PAT.moveY = 0; PAT.timeZ = 0; PAT.frame = 0;

function renderRows() {
	for (let y = 0; y < H; y++) linkRow(depth, links, y * W, W, PERIOD, DEPTH, true, lz, rz);
	for (let y = 0; y < H; y++) {
		const o = y * W;
		for (let x = 0; x < W; x++) {
			const r = links[o + x];
			out[o + x] = r === x ? texel(x, y) : out[o + r];
		}
	}
}

// --- A: the rendered image satisfies every constraint the reference demands ---
console.log('# ' + W + 'x' + H + ' period=' + PERIOD + ' depthScale=' + DEPTH + ', every ' + ROW_STEP + 'rd row, 24-bit noise at grain 1\n');
console.log('| preset | required | satisfied | dropped |');
console.log('|---|---|---|---|');
const PRESETS = { shapes: core.fillShapes, torus: core.fillTorus, heart: core.fillHeart, ripples: core.fillRipples, pyramid: core.fillPyramid };

for (const name of Object.keys(PRESETS)) {
	PRESETS[name](depth, W, H);
	postProcessDepth(depth, W * H, false, 1);
	renderRows();

	let req = 0, sat = 0;
	for (let y = 0; y < H; y += ROW_STEP) {
		const o = y * W;
		const need = refRequired(depth, o, W, PERIOD, DEPTH);
		req += need.length / 2;
		for (let i = 0; i < need.length; i += 2) if (out[o + need[i]] === out[o + need[i + 1]]) sat++;
	}
	const ok = sat === req;
	if (!ok) failed++;
	console.log('| ' + name + ' | ' + req + ' | ' + sat + ' | ' + (req - sat) + ' |');
}
console.log('');

// --- B: the eye buffers are per row, a previous row cannot leak into the next ---
{
	PRESETS.pyramid(depth, W, H);
	postProcessDepth(depth, W * H, false, 1);
	const flat = new Float32Array(W * H);
	flat.fill(0.5);
	const o = 3 * W;
	for (let x = 0; x < W; x++) flat[o + x] = depth[o + x];	// one occluding row, then all flat
	depth.set(flat);
	// the row before the flat one is a strong occluder; the flat rows must link normally
	PRESETS.heart(depth, W, H);
	postProcessDepth(depth, W * H, false, 1);
	for (let y = 0; y < H; y++) if (y > 40) for (let x = 0; x < W; x++) depth[y * W + x] = 0.5;
	renderRows();

	let bad = 0, ok = 0;
	for (let y = 41; y < H; y += 7) {
		const ro = y * W;
		const need = refRequired(depth, ro, W, PERIOD, DEPTH);
		ok += need.length / 2;
		for (let i = 0; i < need.length; i += 2) if (out[ro + need[i]] === out[ro + need[i + 1]]) bad++;
	}
	check('flat rows after an occluder are not corrupted by a stale eye buffer', bad === ok, ok + ' pairs, ' + bad + ' broken');
}

// --- C: flat surface is a no-op, a real step is not ---
{
	const flat = new Float32Array(W);
	flat.fill(0.4);
	const a = new Int32Array(W), b = new Int32Array(W);
	linkRow(flat, a, 0, W, PERIOD, DEPTH, false, lz, rz);
	linkRow(flat, b, 0, W, PERIOD, DEPTH, true, lz, rz);
	let same = true;
	for (let x = 0; x < W; x++) if (a[x] !== b[x]) same = false;
	check('HSR is a no-op on a flat surface', same);

	const step = new Float32Array(W);
	for (let x = 0; x < W; x++) step[x] = (x >= 200 && x < 320) ? 0.8 : 0;
	linkRow(step, a, 0, W, PERIOD, DEPTH, false, lz, rz);
	linkRow(step, b, 0, W, PERIOD, DEPTH, true, lz, rz);
	let diff = 0;
	for (let x = 0; x < W; x++) if (a[x] !== b[x]) diff++;
	check('HSR relinks a depth step', diff > 0, diff + ' px');
}

// --- D: the tolerance keeps near-equal neighbours on a smooth slope ---
{
	// Two points land on the same left pixel when the nearer one, having a smaller separation,
	// sits exactly one pixel to the left. The gap they can have is between 1/D and 2/D, so with
	// D=160 a gap under HSR_EPS is reachable and the tolerance has to keep both points linked.
	// The background is flat at the far point's own depth, so the right eye collides with nothing.
	const D = 160, P = 200, w = 600, xFar = 300, xNear = 299;
	const probe = (dz) => {
		const row = new Float32Array(w);
		row.fill(0.5);
		row[xNear] = 0.5 + dz;
		const sFar = periodAt(0.5, P, D), sNear = periodAt(0.5 + dz, P, D);
		const collide = (xFar - (sFar >> 1)) === (xNear - (sNear >> 1));
		const off = new Int32Array(w), on = new Int32Array(w);
		linkRow(row, off, 0, w, P, D, false, lz, rz);
		linkRow(row, on, 0, w, P, D, true, lz, rz);
		let same = true;
		for (let x = 0; x < w; x++) if (off[x] !== on[x]) same = false;
		return collide && same;
	};
	check('HSR_EPS keeps a sub-tolerance depth step linked', probe(0.008));
	check('HSR suppresses a point more than HSR_EPS behind the nearest', !probe(0.0125));
}

// --- E: what it costs on screen — freed pixels come in runs, that is the smear ---
console.log('\n| preset | freed px | runs | longest run | mean run |');
console.log('|---|---|---|---|---|');
const free = new Uint8Array(W);
const offLinks = new Int32Array(W * H);
for (const name of Object.keys(PRESETS)) {
	PRESETS[name](depth, W, H);
	postProcessDepth(depth, W * H, false, 1);
	for (let y = 0; y < H; y++) linkRow(depth, offLinks, y * W, W, PERIOD, DEPTH, false, lz, rz);
	const onLinks = new Int32Array(W * H);
	for (let y = 0; y < H; y++) linkRow(depth, onLinks, y * W, W, PERIOD, DEPTH, true, lz, rz);

	let freed = 0, longest = 0, runs = 0, total = 0, rows = 0;
	for (let y = 0; y < H; y += ROW_STEP) {
		const o = y * W;
		rows++;
		// a pixel HSR leaves unsourced samples the pattern at its own x instead of a stretched one
		for (let x = 0; x < W; x++) free[x] = (onLinks[o + x] === x && offLinks[o + x] !== x) ? 1 : 0;
		let run = 0;
		for (let x = 0; x <= W; x++) {
			if (x < W && free[x]) { run++; freed++; continue; }
			if (run > 0) { runs++; total += run; if (run > longest) longest = run; run = 0; }
		}
	}
	console.log('| ' + name + ' | ' + (freed / (W * rows) * 100).toFixed(1) + '% | ' + runs +
		' | ' + longest + ' px | ' + (total / Math.max(1, runs)).toFixed(1) + ' px |');
}
console.log('\nA freed run of L px keeps its own pattern instead of the stretched one, so at grain 16 it');
console.log('reads as a blob up to L*16 px of untouched texture — the smear that made this opt-in.');

console.log(failed === 0 ? '\nall checks passed' : '\n' + failed + ' check(s) FAILED');
process.exit(failed === 0 ? 0 : 1);
