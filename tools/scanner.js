'use strict';
/**
 * Quote/template-literal/comment aware bracket scanner for minified JS.
 *
 * Only what the build needs: find the extent of a balanced bracket region and
 * split a region into top-level chunks. No full parse.
 */

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = { ')': '(', ']': '[', '}': '{' };

/**
 * Walk from `start` (index of an opening bracket) to its matching close.
 * Returns the index of the matching close bracket.
 * Handles ' " ` strings, ${} interpolation nesting, regex-free (minified Nuxt
 * output in these bundles has no top-level regex literals inside the story
 * arrays; a regex would be detected as an unbalanced state and throw).
 */
function matchBracket(src, start) {
  const openCh = src[start];
  if (!OPEN[openCh]) {
    throw new Error(`matchBracket: index ${start} is '${openCh}', not an opening bracket`);
  }
  const stack = [openCh];
  // tmplStack tracks template-literal depth per interpolation level
  let i = start + 1;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === "'" || ch === '"') {
      i = skipQuoted(src, i);
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(src, i);
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated block comment');
      i = end + 2;
      continue;
    }
    if (OPEN[ch]) { stack.push(ch); i++; continue; }
    if (CLOSE[ch]) {
      const want = CLOSE[ch];
      const got = stack.pop();
      if (got !== want) {
        throw new Error(
          `bracket mismatch at ${i}: found '${ch}' but innermost open was '${got}'`);
      }
      if (stack.length === 0) return i;
      i++;
      continue;
    }
    i++;
  }
  throw new Error(`unbalanced bracket starting at ${start}`);
}

function skipQuoted(src, i) {
  const q = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === q) return i + 1;
    i++;
  }
  throw new Error('unterminated string literal');
}

/** i points at the opening backtick; returns index just past the closing one. */
function skipTemplate(src, i) {
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '`') return i + 1;
    if (src[i] === '$' && src[i + 1] === '{') {
      const close = matchBracket(src, i + 1);
      i = close + 1;
      continue;
    }
    i++;
  }
  throw new Error('unterminated template literal');
}

/**
 * Split the inside of a bracketed region into top-level, comma-separated
 * chunks. `inner` must NOT include the enclosing brackets.
 */
function splitTopLevel(inner, sep = ',') {
  const out = [];
  let depth = 0;
  let last = 0;
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === "'" || ch === '"') { i = skipQuoted(inner, i); continue; }
    if (ch === '`') { i = skipTemplate(inner, i); continue; }
    if (OPEN[ch]) { depth++; i++; continue; }
    if (CLOSE[ch]) { depth--; i++; continue; }
    if (ch === sep && depth === 0) {
      out.push(inner.slice(last, i));
      last = i + 1;
    }
    i++;
  }
  const tail = inner.slice(last);
  if (tail.trim() !== '') out.push(tail);
  return out;
}

/** Split `key:value` at the first top-level colon. */
function splitKeyValue(chunk) {
  let depth = 0;
  let i = 0;
  while (i < chunk.length) {
    const ch = chunk[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === "'" || ch === '"') { i = skipQuoted(chunk, i); continue; }
    if (ch === '`') { i = skipTemplate(chunk, i); continue; }
    if (OPEN[ch]) { depth++; i++; continue; }
    if (CLOSE[ch]) { depth--; i++; continue; }
    if (ch === ':' && depth === 0) {
      return [chunk.slice(0, i).trim(), chunk.slice(i + 1).trim()];
    }
    if (ch === '?' && depth === 0) {
      // ternary inside a bare value - no key here
      return null;
    }
    i++;
  }
  return null;
}

/** Parse an object literal source `{...}` into an ordered [key, rawValue] list. */
function parseObjectLiteral(src) {
  const t = src.trim();
  if (t[0] !== '{') throw new Error(`not an object literal: ${t.slice(0, 40)}`);
  const end = matchBracket(t, 0);
  if (end !== t.length - 1) {
    throw new Error('trailing content after object literal');
  }
  const pairs = [];
  for (const chunk of splitTopLevel(t.slice(1, end))) {
    if (chunk.trim() === '') continue;
    const kv = splitKeyValue(chunk);
    if (!kv) throw new Error(`cannot split key:value in ${chunk.slice(0, 60)}`);
    let [k, v] = kv;
    if ((k[0] === '"' && k.at(-1) === '"') || (k[0] === "'" && k.at(-1) === "'")) {
      k = k.slice(1, -1);
    }
    pairs.push([k, v]);
  }
  return pairs;
}

/** Parse an array literal `[...]` into a list of raw element sources. */
function parseArrayLiteral(src) {
  const t = src.trim();
  if (t[0] !== '[') throw new Error(`not an array literal: ${t.slice(0, 40)}`);
  const end = matchBracket(t, 0);
  return splitTopLevel(t.slice(1, end))
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Decode a JS template literal that contains no ${} interpolation. */
function decodeTemplate(raw) {
  const t = raw.trim();
  if (t[0] !== '`' || t.at(-1) !== '`') {
    throw new Error(`not a template literal: ${t.slice(0, 40)}`);
  }
  const body = t.slice(1, -1);
  if (/\$\{/.test(body)) throw new Error('template literal has interpolation');
  return body
    .replace(/\\`/g, '`')
    .replace(/\\\$/g, '$')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

module.exports = {
  matchBracket,
  splitTopLevel,
  splitKeyValue,
  parseObjectLiteral,
  parseArrayLiteral,
  decodeTemplate,
};
