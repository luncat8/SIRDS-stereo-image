// Headless boot test for gf.html: a stub DOM just large enough to run the real <script>.
// Catches broken ids, boot order / TDZ errors and empty renders without a browser.
// run: node experiments/gf-smoke.js
const fs = require('fs');
const { GF_PATH } = require('./gf-core');

const html = fs.readFileSync(GF_PATH, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

let failed = 0;
function check(name, ok, detail) {
	if (!ok) failed++;
	console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + detail));
}

// --- stub DOM -------------------------------------------------------------
const camel = s => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function makeCtx(el) {
	let putCount = 0;
	return {
		el,
		get putCount() { return putCount; },
		fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
		fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, stroke() {}, fill() {}, fillText() {},
		measureText(s) { return { width: s.length * 40 }; },
		createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
		getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
		putImageData(img) { putCount++; el.lastImage = img; }
	};
}

function makeEl(tag, attrs) {
	const el = {
		tagName: tag.toUpperCase(), dataset: {}, style: {}, children: [], handlers: {},
		classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
		value: attrs.value !== undefined ? attrs.value : '',
		checked: 'checked' in attrs,
		min: attrs.min, max: attrs.max, step: attrs.step, type: attrs.type,
		width: attrs.width ? +attrs.width : 0, height: attrs.height ? +attrs.height : 0,
		innerText: '', textContent: '',
		addEventListener(ev, fn) { (el.handlers[ev] = el.handlers[ev] || []).push(fn); },
		setAttribute() {}, appendChild(c) { el.children.push(c); },
		getBoundingClientRect() { return { left: 0, top: 0, width: el.width, height: el.height }; },
		setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return true; },
		getContext() { el.ctx = el.ctx || makeCtx(el); return el.ctx; },
		fire(ev, extra) { for (const fn of el.handlers[ev] || []) fn(Object.assign({ pointerId: 1, clientX: 0, clientY: 0, preventDefault() {} }, extra)); }
	};
	el.classList = {
		add: c => el.classes.add(c), remove: c => el.classes.delete(c),
		contains: c => el.classes.has(c),
		toggle: (c, on) => (on === undefined ? (el.classes.has(c) ? el.classes.delete(c) : el.classes.add(c)) : (on ? el.classes.add(c) : el.classes.delete(c)))
	};
	for (const k in attrs) if (k.startsWith('data-')) el.dataset[camel(k.slice(5))] = attrs[k];
	return el;
}

const byId = {};
const i18nEls = [];
for (const m of html.matchAll(/<(\w+)([^>]*?)\/?>/g)) {
	const attrs = {};
	for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : a[2];
	if (attrs.id === undefined && attrs['data-i18n'] === undefined) continue;
	const el = makeEl(m[1], attrs);
	if (attrs.id !== undefined) byId[attrs.id] = el;
	if (attrs['data-i18n'] !== undefined) i18nEls.push(el);
}

const WRAP_W = 900, WRAP_H = 560;
const wrapper = makeEl('div', {});
wrapper.clientWidth = WRAP_W;
wrapper.clientHeight = WRAP_H;
byId.mainCanvas.parentElement = wrapper;

const document = {
	title: '', documentElement: {},
	getElementById: id => byId[id],
	querySelectorAll: () => i18nEls,
	createElement: tag => makeEl(tag, {})
};

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

// real rAF is a queue: animationLoop re-arms itself while a drag callback is also pending
const rafQueue = new Map();
let rafId = 0;
const requestAnimationFrame = fn => { rafQueue.set(++rafId, fn); return rafId; };
const cancelAnimationFrame = id => rafQueue.delete(id);
function runFrame() {
	const due = [...rafQueue.values()];
	rafQueue.clear();
	for (const fn of due) fn();
}
class ResizeObserver { constructor(fn) { this.fn = fn; } observe() {} }

// --- boot -----------------------------------------------------------------
new Function('document', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'setTimeout', script)(
	document, localStorage, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, fn => fn()
);

const canvas = byId.mainCanvas;
const ctx = canvas.ctx;
check('canvas resized to its wrapper', canvas.width === WRAP_W && canvas.height === WRAP_H, canvas.width + 'x' + canvas.height);
check('a frame was pushed to the canvas', ctx.putCount > 0, ctx.putCount + ' putImageData');
check('guide dots were drawn', !!byId.guideCanvas.ctx);
check('title translated', document.title.length > 0, JSON.stringify(document.title));

function stats() {
	const u32 = new Uint32Array(ctx.el.lastImage.data.buffer);
	const seen = new Set();
	let opaque = 0;
	for (let i = 0; i < u32.length; i += 7) { seen.add(u32[i]); if ((u32[i] >>> 24) === 255) opaque++; }
	return { colors: seen.size, opaque, total: Math.ceil(u32.length / 7) };
}

let st = stats();
check('stereogram is opaque everywhere', st.opaque === st.total, st.opaque + '/' + st.total);
check('stereogram is not a flat fill', st.colors > 1, st.colors + ' distinct colours');

// --- every preset renders -------------------------------------------------
for (const opt of ['shapes', 'torus', 'heart', 'ripples', 'pyramid', 'text3d']) {
	byId.depthPreset.value = opt;
	byId.depthPreset.fire('change');
	byId.showDepthBtn.fire('click');
	const d = new Uint32Array(ctx.el.lastImage.data.buffer);
	let min = 255, max = 0;
	for (let i = 0; i < d.length; i += 3) { const v = d[i] & 255; if (v < min) min = v; if (v > max) max = v; }
	// text3d gets a blank getImageData from the stub ctx, so only its plumbing is checked here
	check('preset ' + opt + ' fills a depth range', opt === 'text3d' ? max === min : max > min + 40, min + '..' + max);
	byId.showStereoBtn.fire('click');
}
byId.depthPreset.value = 'torus';
byId.depthPreset.fire('change');

// --- controls -------------------------------------------------------------
byId.patternWidth.value = '60';
byId.depthFactor.value = '160';
byId.patternWidth.fire('input');
check('depth is clamped below the period', +byId.depthFactor.value <= 60 - 8, 'depth=' + byId.depthFactor.value);
check('depth readout shows the separation range', /\d+…\d+ px/.test(byId.depthFactorVal.innerText), byId.depthFactorVal.innerText);

byId.patternWidth.value = '100';
byId.depthFactor.value = '20';
byId.patternWidth.fire('input');

for (const p of ['white', 'color', 'simplex3d', 'stripe']) {
	byId.patternType.value = p;
	byId.patternType.fire('change');
	check('texture ' + p + ' renders', stats().colors > 1, stats().colors + ' colours');
}
byId.patternType.value = 'white';
byId.patternType.fire('change');

// --- canvas drag ----------------------------------------------------------
const before = { p: +byId.patternWidth.value, d: +byId.depthFactor.value };
canvas.fire('pointerdown', { clientX: 400, clientY: 200 });
canvas.fire('pointermove', { clientX: 460, clientY: 140 });
runFrame();
check('drag dX raised the period', +byId.patternWidth.value > before.p, before.p + ' -> ' + byId.patternWidth.value);
check('drag dY (up) raised the depth', +byId.depthFactor.value > before.d, before.d + ' -> ' + byId.depthFactor.value);
canvas.fire('pointerup', { clientX: 460, clientY: 140 });
canvas.fire('pointermove', { clientX: 500, clientY: 100 });
check('pointerup released the drag', +byId.patternWidth.value === before.p + 60, byId.patternWidth.value);

// guide dots stay period-only
const dotY = WRAP_H - Math.max(20, Math.round(WRAP_H * 0.062));
const depthBefore = +byId.depthFactor.value;
canvas.fire('pointerdown', { clientX: (WRAP_W + 160) / 2, clientY: dotY });
canvas.fire('pointermove', { clientX: (WRAP_W + 300) / 2, clientY: dotY - 80 });
runFrame();
check('guide-dot drag sets the period only', +byId.patternWidth.value === 300 && +byId.depthFactor.value === depthBefore,
	'period=' + byId.patternWidth.value + ' depth=' + byId.depthFactor.value);
canvas.fire('pointerup', {});

// --- persistence ----------------------------------------------------------
byId.depthText.value = 'HI';
byId.depthText.fire('input');
byId.hsrToggle.checked = false;
byId.hsrToggle.fire('change');
const saved = JSON.parse(store.sirdsSettings);
check('settings persisted', saved.depthText === 'HI' && saved.hsr === false && saved.patternWidth === '300', JSON.stringify(saved.depthPreset) + ' ' + saved.patternWidth);

// --- animation ------------------------------------------------------------
byId.stableNoise.checked = true;
byId.noiseVx.value = '0';
byId.noiseVy.value = '0';
byId.noiseVx.fire('input');
const staticCount = ctx.putCount;
for (let i = 0; i < 5; i++) runFrame();
check('static settings skip redraws', ctx.putCount === staticCount, ctx.putCount - staticCount + ' extra frames');

byId.noiseVx.value = '1';
byId.noiseVx.fire('input');
const movingCount = ctx.putCount;
for (let i = 0; i < 5; i++) runFrame();
check('drifting noise redraws every frame', ctx.putCount === movingCount + 5, ctx.putCount - movingCount + ' frames');

console.log(failed === 0 ? '\nall checks passed' : '\n' + failed + ' check(s) FAILED');
process.exit(failed === 0 ? 0 : 1);
