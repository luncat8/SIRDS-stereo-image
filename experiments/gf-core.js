// Loads the DOM-free math core out of gf.html so node scripts test the shipped code,
// not a copy. gf.html stays a single file; the core is delimited by two marker comments.
const fs = require('fs');
const path = require('path');

const GF_PATH = path.join(__dirname, '..', 'gf.html');
const START = '// >>> gf-core start';
const END = '// <<< gf-core end';
const EXPORTS = 'SEED, MIN_SHIFT, HSR_EPS, HASH_K, HASH_BIAS, TENTHS_LIM, PAT, PATTERN_WHITE, PATTERN_COLOR, PATTERN_SIMPLEX, PATTERN_STRIPE, clamp, periodAt, packRGBA, hashU32, hashNoise, tenthsOf, floorDiv, grainOrigin, simplex3, simplexPerm, simplexGrad3, texel, linkRow, fillShapes, fillTorus, fillHeart, fillRipples, fillPyramid, postProcessDepth';

function loadCore() {
	const html = fs.readFileSync(GF_PATH, 'utf8');
	const a = html.indexOf(START);
	const b = html.indexOf(END);
	if (a < 0 || b < 0 || b < a) throw new Error('gf-core markers not found in gf.html');
	const src = html.slice(html.indexOf('\n', a) + 1, b);
	return new Function(src + '\nreturn { ' + EXPORTS + ' };')();
}

module.exports = { loadCore, GF_PATH };
