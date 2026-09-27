// End-to-end check of the rendered image, not of the linker's own bookkeeping.
//
// A: constraint satisfaction — every stereo link the depth map demands must end up as two
//    byte-equal pixels in the output. The old `same[right] = left` overwrite drops colliding
//    constraints, so it is run side by side to show the difference the union-find makes.
// B: ghost rate — pixels that also repeat at some *other* shift offer the eye a second,
//    wrong depth. HSR should lower it.
//
// 24-bit colour noise at grain 1 makes an accidental repeat ~1/16M, so a repeat is a real link.
// run: node experiments/verify-links.js
const { loadCore } = require('./gf-core');
const core = loadCore();
const { MIN_SHIFT, HSR_EPS, PAT, periodAt, texel, linkRow, postProcessDepth } = core;

const PRESETS = { shapes: core.fillShapes, torus: core.fillTorus, heart: core.fillHeart, ripples: core.fillRipples, pyramid: core.fillPyramid };
const W = 700, H = 450, PERIOD = 120, DEPTH = 30, ROW_STEP = 3;

PAT.type = 1; PAT.grain = 1; PAT.moveX = 0; PAT.moveY = 0; PAT.timeZ = 0; PAT.frame = 0;

const depth = new Float32Array(W * H);
const links = new Int32Array(W * H);
const out = new Uint32Array(W * H);
const lz = new Float32Array(W), rz = new Float32Array(W);

// gf.html before 0.3: the later link silently overwrites the earlier one
function linkRowNaive(d, l, o, w, period, depthScale) {
	for (let x = 0; x < w; x++) l[o + x] = x;
	for (let x = 0; x < w; x++) {
		const s = periodAt(d[o + x], period, depthScale);
		const left = x - (s >> 1), right = left + s;
		if (left >= 0 && right < w) l[o + right] = left;
	}
}

function fill() {
	for (let y = 0; y < H; y++) {
		const o = y * W;
		for (let x = 0; x < W; x++) {
			const r = links[o + x];
			out[o + x] = r === x ? texel(x, y) : out[o + r];
		}
	}
}

// visibility rule of the renderer, recomputed independently for the audit
function visibleMask(o, useHsr) {
	for (let x = 0; x < W; x++) { lz[x] = -1; rz[x] = -1; }
	if (!useHsr) return null;
	for (let x = 0; x < W; x++) {
		const s = periodAt(depth[o + x], PERIOD, DEPTH);
		const left = x - (s >> 1), right = left + s;
		if (left < 0 || right >= W) continue;
		if (depth[o + x] > lz[left]) lz[left] = depth[o + x];
		if (depth[o + x] > rz[right]) rz[right] = depth[o + x];
	}
	return true;
}

function audit(useHsr) {
	let required = 0, satisfied = 0, ghosts = 0, probed = 0;
	for (let y = 0; y < H; y += ROW_STEP) {
		const o = y * W;
		visibleMask(o, useHsr);
		for (let x = 0; x < W; x++) {
			const z = depth[o + x];
			const s = periodAt(z, PERIOD, DEPTH);
			const left = x - (s >> 1), right = left + s;
			if (left < 0 || right >= W) continue;
			if (useHsr && (z < lz[left] - HSR_EPS || z < rz[right] - HSR_EPS)) continue;
			required++;
			if (out[o + left] === out[o + right]) satisfied++;

			if (left < PERIOD || right >= W - PERIOD) continue;
			probed++;
			for (let k = MIN_SHIFT; k <= PERIOD; k++) {
				if (k === s) continue;
				if (out[o + left] === out[o + left + k]) { ghosts++; break; }
			}
		}
	}
	return { required, satisfied, ghosts, probed };
}

let failed = 0;
console.log('period=' + PERIOD + ' depthScale=' + DEPTH + ' size=' + W + 'x' + H + ', every ' + ROW_STEP + 'rd row\n');
console.log('| preset | linker | hsr | constraints met | ghost shifts |');
console.log('|---|---|---|---|---|');

for (const name of Object.keys(PRESETS)) {
	for (const hsr of [false, true]) {
		PRESETS[name](depth, W, H);
		postProcessDepth(depth, W * H, false, 1);

		for (let y = 0; y < H; y++) linkRow(depth, links, y * W, W, PERIOD, DEPTH, hsr, lz, rz);
		fill();
		const uf = audit(hsr);
		if (uf.satisfied !== uf.required) failed++;
		console.log('| ' + name + ' | union-find | ' + (hsr ? 'on ' : 'off') + ' | ' +
			(uf.satisfied / uf.required * 100).toFixed(2) + '% (' + uf.satisfied + '/' + uf.required + ') | ' +
			(uf.ghosts / uf.probed * 100).toFixed(1) + '% |');
	}

	// naive linker, no HSR — this is what gf.html shipped before
	PRESETS[name](depth, W, H);
	postProcessDepth(depth, W * H, false, 1);
	for (let y = 0; y < H; y++) linkRowNaive(depth, links, y * W, W, PERIOD, DEPTH);
	fill();
	const nv = audit(false);
	console.log('| ' + name + ' | naive | off | ' + (nv.satisfied / nv.required * 100).toFixed(2) +
		'% (' + nv.satisfied + '/' + nv.required + ') | ' + (nv.ghosts / nv.probed * 100).toFixed(1) + '% |');
}

console.log('\nUnion-find must satisfy 100% of the constraints; the naive overwrite drops the ones that collide.');
console.log(failed === 0 ? 'ok — no dropped constraints' : failed + ' case(s) FAILED');
process.exit(failed === 0 ? 0 : 1);
