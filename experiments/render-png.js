// Renders the gf.html presets to PNG so depth maps and stereograms can be eyeballed
// without a browser. run: node experiments/render-png.js [outDir] [width] [height]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadCore } = require('./gf-core');

const core = loadCore();
const { PAT, periodAt, packRGBA, texel, linkRow, postProcessDepth } = core;
const PRESETS = { shapes: core.fillShapes, torus: core.fillTorus, heart: core.fillHeart, ripples: core.fillRipples, pyramid: core.fillPyramid };

const outDir = process.argv[2] || path.join(__dirname, 'logs', 'png');
const W = +(process.argv[3] || 700);
const H = +(process.argv[4] || 450);
const PERIOD = 100, DEPTH = 26, GRAIN = 2;

function crc32(buf) {
	let c = ~0;
	for (let i = 0; i < buf.length; i++) {
		c ^= buf[i];
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
	}
	return ~c >>> 0;
}

function chunk(type, data) {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, 'ascii');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
	return Buffer.concat([head, data, crc]);
}

function writePng(file, w, h, u32) {
	const raw = Buffer.alloc(h * (w * 4 + 1));
	for (let y = 0; y < h; y++) {
		let p = y * (w * 4 + 1) + 1;
		for (let x = 0; x < w; x++) {
			const v = u32[y * w + x];
			raw[p++] = v & 255; raw[p++] = (v >>> 8) & 255; raw[p++] = (v >>> 16) & 255; raw[p++] = 255;
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8; ihdr[9] = 6;
	fs.writeFileSync(file, Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
		chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))
	]));
}

fs.mkdirSync(outDir, { recursive: true });

const depth = new Float32Array(W * H);
const links = new Int32Array(W * H);
const out = new Uint32Array(W * H);
const lz = new Float32Array(W), rz = new Float32Array(W);

PAT.type = 0; PAT.grain = GRAIN; PAT.moveX = 0; PAT.moveY = 0; PAT.timeZ = 0; PAT.frame = 0;

function render(hsr) {
	for (let y = 0; y < H; y++) linkRow(depth, links, y * W, W, PERIOD, DEPTH, hsr, lz, rz);
	for (let y = 0; y < H; y++) {
		const o = y * W;
		for (let x = 0; x < W; x++) {
			const r = links[o + x];
			out[o + x] = r === x ? texel(x, y) : out[o + r];
		}
	}
}

console.log('# ' + W + 'x' + H + ' period=' + PERIOD + ' depth=' + DEPTH + ' (near separation ' + periodAt(1, PERIOD, DEPTH) + ' px)');
for (const name of Object.keys(PRESETS)) {
	PRESETS[name](depth, W, H);
	postProcessDepth(depth, W * H, false, 1);

	for (let i = 0; i < W * H; i++) { const v = (depth[i] * 255) | 0; out[i] = packRGBA(v, v, v); }
	writePng(path.join(outDir, name + '-depth.png'), W, H, out);

	render(true);
	writePng(path.join(outDir, name + '-sirds.png'), W, H, out);
	console.log('  ' + name + ' -> ' + name + '-depth.png, ' + name + '-sirds.png');
}

// HSR side by side on the preset with the hardest silhouette
PRESETS.pyramid(depth, W, H);
postProcessDepth(depth, W * H, false, 1);
render(false);
writePng(path.join(outDir, 'pyramid-sirds-hsr-off.png'), W, H, out);
console.log('  pyramid hsr=off -> pyramid-sirds-hsr-off.png');
console.log('written to ' + outDir);
