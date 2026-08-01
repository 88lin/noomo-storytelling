'use strict';
/**
 * positions.js — scroll-position descriptors.
 *
 * In the original bundle every appear/disappear point is a hand-written
 * expression over closure variables, e.g.
 *
 *   scrollEnd2: e(15)+430-(a?10:0)-(t.value?70:0)
 *
 * where  e(k) = sum of scrollSections[0..k].scrollLength
 *        n    = isMobile ? 2 : 1
 *        a    = isMobile
 *        t    = isRealTablet ref
 *        l    = window.innerHeight ref
 *
 * The config expresses the same thing as data:
 *
 *   { s: 15, base: 430, mobile: -10, tablet: -70 }
 *
 * resolved at runtime by resolvePos() below (also inlined into the emitted
 * dist/_nuxt/story.data.js runtime).  `half` is the "/n" term: it is halved on
 * mobile, matching the original.  `short` applies when innerHeight < 850.
 */

const KEYS = ['s', 'base', 'half', 'mobile', 'tablet', 'short'];

function resolvePos(d, ctx) {
  const n = ctx.isMobile ? 2 : 1;
  return ctx.sectionSum(d.s || 0)
    + (d.base || 0)
    + (d.half || 0) / n
    + (ctx.isMobile ? (d.mobile || 0) : 0)
    + (ctx.isTablet ? (d.tablet || 0) : 0)
    + (ctx.innerHeight < 850 ? (d.short || 0) : 0);
}

/** Split an additive expression into signed top-level terms. */
function splitTerms(expr) {
  const terms = [];
  let depth = 0;
  let start = 0;
  let sign = 1;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth === 0 && (ch === '+' || ch === '-') && i > start) {
      terms.push({ sign, text: expr.slice(start, i).trim() });
      sign = ch === '+' ? 1 : -1;
      start = i + 1;
    }
  }
  terms.push({ sign, text: expr.slice(start).trim() });
  return terms.filter((t) => t.text !== '');
}

/**
 * Parse one original expression into a descriptor.
 * Throws on anything the grammar does not cover, so an upstream bundle change
 * surfaces instead of silently producing wrong positions.
 */
function parseExpr(raw) {
  const expr = String(raw).replace(/\s+/g, '');
  const d = { s: null, base: 0, half: 0, mobile: 0, tablet: 0, short: 0 };
  for (const { sign, text } of splitTerms(expr)) {
    let m;
    if ((m = /^e\((\d+)\)$/.exec(text))) {
      if (d.s !== null) throw new Error(`two e() terms in "${raw}"`);
      if (sign !== 1) throw new Error(`negated e() term in "${raw}"`);
      d.s = Number(m[1]);
      continue;
    }
    if ((m = /^(\d+(?:\.\d+)?)$/.exec(text))) { d.base += sign * Number(m[1]); continue; }
    if ((m = /^(\d+(?:\.\d+)?)\/n$/.exec(text))) { d.half += sign * Number(m[1]); continue; }
    if ((m = /^\(a\?(-?\d+(?:\.\d+)?):0\)$/.exec(text))) { d.mobile += sign * Number(m[1]); continue; }
    if ((m = /^\(t\.value\?(-?\d+(?:\.\d+)?):0\)$/.exec(text))) { d.tablet += sign * Number(m[1]); continue; }
    if ((m = /^\(l\.value<850\?(-?\d+(?:\.\d+)?):0\)$/.exec(text))) { d.short += sign * Number(m[1]); continue; }
    // `(t.value,0)` is a comma expression that always evaluates to 0.
    if (/^\(t\.value,0\)$/.test(text)) continue;
    throw new Error(`unsupported scroll term "${text}" in "${raw}"`);
  }
  if (d.s === null) throw new Error(`no e(section) term in "${raw}"`);
  const out = { s: d.s };
  for (const k of KEYS.slice(1)) if (d[k] !== 0) out[k] = d[k];
  return out;
}

/**
 * Evaluate an original expression directly, for the fidelity test.
 * ctx: { sectionSum, isMobile, isTablet, innerHeight }
 */
function evalExpr(raw, ctx) {
  const e = (k) => ctx.sectionSum(k);
  const a = ctx.isMobile;
  const n = a ? 2 : 1;
  const t = { value: ctx.isTablet };
  const l = { value: ctx.innerHeight };
  // eslint-disable-next-line no-new-func
  const f = new Function('e', 'a', 'n', 't', 'l', `return (${raw});`);
  return f(e, a, n, t, l);
}

function validateDescriptor(d, where, sectionCount) {
  if (!d || typeof d !== 'object') throw new Error(`${where}: position must be an object`);
  for (const k of Object.keys(d)) {
    if (!KEYS.includes(k)) {
      throw new Error(`${where}: unknown position key "${k}" (allowed: ${KEYS.join(', ')})`);
    }
    if (typeof d[k] !== 'number' || !Number.isFinite(d[k])) {
      throw new Error(`${where}: position "${k}" must be a finite number`);
    }
  }
  if (typeof d.s !== 'number') throw new Error(`${where}: position needs "s" (section index)`);
  if (d.s < 0 || d.s >= sectionCount) {
    throw new Error(`${where}: section ${d.s} out of range 0..${sectionCount - 1}`);
  }
}

module.exports = { resolvePos, parseExpr, evalExpr, validateDescriptor, splitTerms, KEYS };
