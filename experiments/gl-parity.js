// Shader contract for the WebGL2 gather, plus an optional pixel-parity run.
//
// Always (node, no GPU): the fragment shader extracted from gf.html must carry the same
// integer-hash constants, grain formula and root-gather as the CPU core. That is what makes
// white/color able to match byte for byte.
//
// With Chrome (SIRDS_GL=1, or puppeteer resolvable): compile the shipped shaders, draw the
// plan's parity case, and compare to the CPU gather. white/color must be exact. simplex/stripe
// are logged with their max channel delta — float sin/simplex are not bit-stable across GPUs.
//
// run: node experiments/gl-parity.js
const fs = require('fs');
const path = require('path');
const { loadCore, GF_PATH } = require('./gf-core');

const core = loadCore();
let failed = 0;
function check(name, ok, detail) {
	if (!ok) failed++;
	console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + detail));
}

const html = fs.readFileSync(GF_PATH, 'utf8');
const START = '// >>> gf-shader start';
const END = '// <<< gf-shader end';
const a = html.indexOf(START);
const b = html.indexOf(END);
check('shader markers present', a >= 0 && b > a);
const block = html.slice(html.indexOf('\n', a) + 1, b);
const shaders = new Function(block + '\nreturn { VERT_SRC, FRAG_SRC };')();
const frag = shaders.FRAG_SRC;
const vert = shaders.VERT_SRC;

check('vertex is WebGL2', vert.startsWith('#version 300 es') && vert.includes('gl_VertexID'));
check('fragment is WebGL2', frag.startsWith('#version 300 es'));

for (const k of core.HASH_K) {
	const hex = '0x' + (k >>> 0).toString(16) + 'u';
	check('shader hash ' + hex, frag.toLowerCase().includes(hex.toLowerCase()));
}
check('shader SEED matches core', frag.includes('const int SEED = ' + core.SEED) && core.SEED === 1);
check('shader HASH_BIAS matches core', frag.includes('0x' + core.HASH_BIAS.toString(16)));
check('grain formula is the shared floorDiv', frag.includes('return floorDiv(x * 10 - moveT, g * 10) * g'));
check('floorDiv matches the JS negative case', frag.includes('return -((-n + d - 1) / d)'));
check('y is flipped so row 0 stays the top', frag.includes('uH - 1 - int(gl_FragCoord.y)'));
check('colour comes from the link root, not the fragment x', frag.includes('texelFetch(uLinks') && frag.includes('grainOrigin(root,'));
check('white uses the high bit', frag.includes('>> 31u'));
check('color uses the top byte', frag.includes('>> 24u'));

const gradMatch = frag.match(/const int GRAD\[36\] = int\[36\]\(([\s\S]*?)\);/);
check('GRAD table present', !!gradMatch);
if (gradMatch) {
	const nums = gradMatch[1].split(',').map(s => parseInt(s, 10));
	let same = nums.length === core.simplexGrad3.length;
	for (let i = 0; i < nums.length && same; i++) if (nums[i] !== core.simplexGrad3[i]) same = false;
	check('GRAD matches simplexGrad3', same, nums.length + ' values');
}
check('perm table is sampled, not copied', frag.includes('texelFetch(uPerm'));

// CPU reference gather used by the optional GPU compare.
function renderCPU(w, h, period, depthScale, hsr, preset, pat) {
	const depth = new Float32Array(w * h);
	const links = new Int32Array(w * h);
	const out = new Uint32Array(w * h);
	const lz = new Float32Array(w), rz = new Float32Array(w);
	preset(depth, w, h);
	core.postProcessDepth(depth, w * h, false, 1);
	for (let y = 0; y < h; y++) core.linkRow(depth, links, y * w, w, period, depthScale, hsr, lz, rz);
	const prev = Object.assign({}, core.PAT);
	Object.assign(core.PAT, pat);
	for (let y = 0; y < h; y++) {
		const o = y * w;
		for (let x = 0; x < w; x++) {
			const r = links[o + x];
			out[o + x] = r === x ? core.texel(x, y) : out[o + r];
		}
	}
	Object.assign(core.PAT, prev);
	return { out, links, depth };
}

async function gpuParity() {
	let puppeteer;
	try { puppeteer = require('puppeteer'); }
	catch (e) {
		try { puppeteer = require('/tmp/sirds-gl/node_modules/puppeteer'); }
		catch (e2) { return 'skipped — puppeteer not installed'; }
	}
	let exe;
	try { exe = await Promise.resolve(puppeteer.executablePath()); }
	catch (e) { return 'skipped — ' + e.message; }
	if (!exe || !fs.existsSync(exe)) return 'skipped — chrome not installed (' + exe + ')';

	const browser = await puppeteer.launch({
		executablePath: exe,
		headless: true,
		args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox']
	});
	try {
		const page = await browser.newPage();
		page.on('pageerror', err => console.log('pageerror', err.message));
		const harness = `<!DOCTYPE html><meta charset="utf-8"><canvas id="c"></canvas><script>
			const VERT = ${JSON.stringify(vert)};
			const FRAG = ${JSON.stringify(frag)};
			window.run = function(cfg) {
				const c = document.getElementById('c');
				c.width = cfg.w; c.height = cfg.h;
				const gl = c.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: true });
				if (!gl) return { error: 'no webgl2' };
				function compile(type, src) {
					const s = gl.createShader(type);
					gl.shaderSource(s, src); gl.compileShader(s);
					if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return gl.getShaderInfoLog(s);
					return s;
				}
				const vs = compile(gl.VERTEX_SHADER, VERT);
				const fs = compile(gl.FRAGMENT_SHADER, FRAG);
				if (typeof vs === 'string') return { error: 'vert ' + vs };
				if (typeof fs === 'string') return { error: 'frag ' + fs };
				const prog = gl.createProgram();
				gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
				if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { error: 'link ' + gl.getProgramInfoLog(prog) };
				gl.useProgram(prog);
				gl.bindVertexArray(gl.createVertexArray());
				gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
				const perm = gl.createTexture();
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, perm);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 512, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array(cfg.perm));
				const links = gl.createTexture();
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, links);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, cfg.w, cfg.h, 0, gl.RED_INTEGER, gl.INT, new Int32Array(cfg.links));
				gl.uniform1i(gl.getUniformLocation(prog, 'uLinks'), 0);
				gl.uniform1i(gl.getUniformLocation(prog, 'uPerm'), 1);
				gl.uniform1i(gl.getUniformLocation(prog, 'uPattern'), cfg.pattern);
				gl.uniform1i(gl.getUniformLocation(prog, 'uGrain'), cfg.grain);
				gl.uniform1i(gl.getUniformLocation(prog, 'uFrame'), cfg.frame);
				gl.uniform1i(gl.getUniformLocation(prog, 'uMoveXT'), cfg.moveXT);
				gl.uniform1i(gl.getUniformLocation(prog, 'uMoveYT'), cfg.moveYT);
				gl.uniform1f(gl.getUniformLocation(prog, 'uMoveX'), cfg.moveX);
				gl.uniform1f(gl.getUniformLocation(prog, 'uMoveY'), cfg.moveY);
				gl.uniform1f(gl.getUniformLocation(prog, 'uTimeZ'), cfg.timeZ);
				gl.uniform1i(gl.getUniformLocation(prog, 'uH'), cfg.h);
				gl.viewport(0, 0, cfg.w, cfg.h);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
				const buf = new Uint8Array(cfg.w * cfg.h * 4);
				gl.readPixels(0, 0, cfg.w, cfg.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
				// readPixels is bottom-up; flip to the CPU's top-left order
				const flip = new Uint8Array(buf.length);
				const stride = cfg.w * 4;
				for (let y = 0; y < cfg.h; y++) flip.set(buf.subarray((cfg.h - 1 - y) * stride, (cfg.h - y) * stride), y * stride);
				let mismatch = 0, maxDelta = 0, n = 0;
				const exp = cfg.expected;
				for (let i = 0; i < exp.length; i += 4) {
					n++;
					const dr = Math.abs(flip[i] - exp[i]);
					const dg = Math.abs(flip[i + 1] - exp[i + 1]);
					const db = Math.abs(flip[i + 2] - exp[i + 2]);
					const d = Math.max(dr, dg, db);
					if (d) mismatch++;
					if (d > maxDelta) maxDelta = d;
				}
				return { mismatch, maxDelta, n, sample: [flip[0], flip[1], flip[2], flip[3]], err: gl.getError() };
			};
		</script>`;
		await page.setContent(harness, { waitUntil: 'load' });

		const cases = [
			{ w: 700, h: 450, pattern: 0, name: 'white' },
			{ w: 700, h: 450, pattern: 1, name: 'color' },
			{ w: 1280, h: 800, pattern: 0, name: 'white-large' },
			{ w: 700, h: 450, pattern: 2, name: 'simplex' },
			{ w: 700, h: 450, pattern: 3, name: 'stripe' }
		];
		const PERIOD = 120, DEPTH = 28, GRAIN = 2;
		const lines = [];
		for (const cs of cases) {
			const pat = { type: cs.pattern, grain: GRAIN, moveX: 0, moveY: 0, timeZ: 0, frame: 0 };
			const cpu = renderCPU(cs.w, cs.h, PERIOD, DEPTH, true, core.fillShapes, pat);
			const expected = [];
			for (let i = 0; i < cpu.out.length; i++) {
				const v = cpu.out[i];
				expected.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, 255);
			}
			const result = await page.evaluate(cfg => window.run(cfg), {
				w: cs.w, h: cs.h, pattern: cs.pattern, grain: GRAIN, frame: 0,
				moveXT: core.tenthsOf(0), moveYT: core.tenthsOf(0), moveX: 0, moveY: 0, timeZ: 0,
				perm: Array.from(core.simplexPerm),
				links: Array.from(cpu.links),
				expected
			});
			if (result.error) {
				check('gpu ' + cs.name + ' compiled', false, result.error);
				continue;
			}
			const exact = cs.pattern <= 1;
			check('gpu ' + cs.name + (exact ? ' exact' : ' tolerance'),
				exact ? result.mismatch === 0 : result.maxDelta <= 8,
				result.mismatch + '/' + result.n + ' px differ, max channel delta ' + result.maxDelta);
			lines.push('| ' + cs.name + ' | ' + cs.w + 'x' + cs.h + ' | ' + result.mismatch + ' | ' + result.maxDelta + ' |');
		}
		return lines.join('\n');
	} finally {
		await browser.close();
	}
}

gpuParity().then(msg => {
	if (typeof msg === 'string' && msg.startsWith('skipped')) console.log('\nGPU: ' + msg);
	else console.log('\nGPU ran\n' + msg);
	console.log(failed === 0 ? '\nall checks passed' : '\n' + failed + ' check(s) FAILED');
	process.exit(failed === 0 ? 0 : 1);
}).catch(err => {
	console.error(err);
	process.exit(1);
});
