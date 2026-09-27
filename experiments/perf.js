// Frame budget for the gf.html CPU path: link build (on control change) vs. gather+texel
// (every animation frame). run: node experiments/perf.js [> experiments/logs/perf-<date>.md]
const { loadCore } = require('./gf-core');
const { periodAt, texel, linkRow, PAT } = loadCore();

const SIZES = [[700, 450], [1280, 800]];
const PATTERNS = [['white', 0], ['color', 1], ['simplex3d', 2], ['stripe', 3]];
const PERIOD = 100, DEPTH = 20, GRAIN = 2, REPEATS = 20;

function fillTorus(d, w, h) {
	const cx = w * 0.5, cy = h * 0.5;
	const maxR = Math.min(w, h) * 0.31, minR = maxR * 0.36;
	const mid = (minR + maxR) * 0.5, thick = (maxR - minR) * 0.5;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const dx = x - cx, dy = y - cy;
			const ridge = 1 - Math.abs(Math.sqrt(dx * dx + dy * dy) - mid) / thick;
			d[y * w + x] = ridge > 0 ? ridge * 0.9 : 0;
		}
	}
}

function median(a) { a.sort((p, q) => p - q); return a[a.length >> 1]; }

function timed(n, fn) {
	const runs = [];
	for (let i = 0; i < n; i++) {
		const t0 = process.hrtime.bigint();
		fn(i);
		runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
	}
	return median(runs);
}

console.log('# gf.html CPU perf — node ' + process.version + ' — ' + new Date().toISOString());
console.log('period=' + PERIOD + ' depth=' + DEPTH + ' grain=' + GRAIN + ' preset=torus, median of ' + REPEATS + ' runs (ms)\n');
console.log('| size | links hsr=off | links hsr=on | ' + PATTERNS.map(p => 'frame ' + p[0]).join(' | ') + ' | roots/row |');
console.log('|---|---|---|---|---|---|---|---|');

for (const [w, h] of SIZES) {
	const depth = new Float32Array(w * h);
	const links = new Int32Array(w * h);
	const out = new Uint32Array(w * h);
	const lz = new Float32Array(w), rz = new Float32Array(w);
	fillTorus(depth, w, h);

	const build = hsr => timed(REPEATS, () => {
		for (let y = 0; y < h; y++) linkRow(depth, links, y * w, w, PERIOD, DEPTH, hsr, lz, rz);
	});
	const linkOff = build(false);
	const linkOn = build(true);

	let roots = 0;
	for (let x = 0; x < w; x++) if (links[x] === x) roots++;

	PAT.grain = GRAIN;
	const frames = PATTERNS.map(([, id]) => {
		PAT.type = id;
		return timed(REPEATS, i => {
			PAT.moveX = i; PAT.timeZ = i * 0.045; PAT.frame = i;
			for (let y = 0; y < h; y++) {
				const o = y * w;
				for (let x = 0; x < w; x++) {
					const r = links[o + x];
					out[o + x] = r === x ? texel(x, y) : out[o + r];
				}
			}
		});
	});

	console.log('| ' + w + 'x' + h + ' | ' + linkOff.toFixed(1) + ' | ' + linkOn.toFixed(1) + ' | ' +
		frames.map(f => f.toFixed(1)).join(' | ') + ' | ' + roots + ' |');
}

console.log('\nLinks are cached: they rebuild only when depth/period/depth-scale/HSR change,');
console.log('so the per-frame cost is the gather+texel column alone. periodAt(1,' + PERIOD + ',' + DEPTH + ')=' + periodAt(1, PERIOD, DEPTH) + ' px.');
