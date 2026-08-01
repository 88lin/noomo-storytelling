'use strict';
/**
 * markup.js — compiles the config shorthand into the exact HTML shape the
 * Noomo text components expect (they set it via innerHTML).
 *
 * Design rule: everything that was hand-tuned per English string in the
 * original bundle (font-size pairs, decorative rule widths, nudges) is
 * expressed as a named parameter here, so copy and its layout travel together.
 *
 * Size tokens are always written "lg/xs" (desktop first), e.g. "50/30".
 * A single number means the same size on both breakpoints.
 */

class MarkupError extends Error {}

/** "50/30" -> {lg: "50", xs: "30"};  "66" -> {lg: "66", xs: "66"} */
function parseSizePair(tok, where) {
  if (tok == null) return null;
  const s = String(tok).trim();
  if (!/^\d+(\/\d+)?$/.test(s)) {
    throw new MarkupError(`${where}: size must be "lg" or "lg/xs" digits, got "${s}"`);
  }
  const [lg, xs] = s.split('/');
  return { lg, xs: xs === undefined ? lg : xs };
}

function sizeClasses(pair, family) {
  if (!pair) return '';
  if (pair.lg === pair.xs) return `text-${family}-${pair.lg}`;
  return `lg:text-${family}-${pair.lg} xs:text-${family}-${pair.xs}`;
}

/**
 * A DSL length -> a CSS length.
 *   4      -> 4px      (the compiled CSS uses --spacing:.1rem with html{font-size:10px},
 *                       so one Tailwind spacing unit is exactly one pixel here)
 *   8%     -> 8%
 *   1/3    -> 33.3333%
 *   [3vw]  -> 3vw      (escape hatch)
 */
function cssLen(value, what, where) {
  const raw = String(value).trim();
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  const sign = neg ? '-' : '';
  let m;
  if (/^\[[^\]]+\]$/.test(body)) return sign + body.slice(1, -1);
  if (/^\d+(\.\d+)?%$/.test(body)) return sign + body;
  if ((m = /^(\d+)\/(\d+)$/.exec(body))) {
    const pct = (Number(m[1]) / Number(m[2])) * 100;
    return `${sign}${Number(pct.toFixed(4))}%`;
  }
  if (/^\d+(\.\d+)?$/.test(body)) return `${sign}${body}px`;
  throw new MarkupError(
    `${where}: cannot read ${what} "${raw}" (use 4, -4, 8%, -8%, 1/3, -1/3 or [3vw])`);
}

const ICONS = {
  bird: 'text-icon-bird',
  bird2: 'text-icon-bird-2',
  feather: 'text-icon-feather-white',
  flower: 'text-icon-flower-white',
};

const LINE_FLAGS = new Set(['half', 'dark', 'lg-only', 'xs-only', 'no-scale']);
const LINE_KEYS = new Set(['w', 'x', 'y', 'xs-x', 'xs-y', 'lg-x', 'lg-y', 'my', 'mb', 'mt']);
const EM_KEYS = new Set(['sz', 'cls', 'x', 'y', 'xs-x', 'xs-y', 'lg-x', 'lg-y']);

/**
 * Nudges and widths are emitted as CSS custom properties rather than Tailwind
 * classes. Reason: `src/_nuxt/*.css` is a finished Tailwind build, so only the
 * handful of `translate-*` / `!w-*` values the original English copy happened
 * to use actually exist. Retuning Chinese line lengths needs arbitrary values,
 * so the build injects two generic rules (.ns-t / .ns-w, see tools/theme.js)
 * that read these variables.
 *
 * `x`/`y` set both breakpoints; `xs-*` and `lg-*` override one of them.
 */
const NUDGE_AXES = [['x', 'tx'], ['y', 'ty']];

function nudgeVars(attrs, where) {
  const vars = [];
  for (const [axis, name] of NUDGE_AXES) {
    for (const bp of ['xs', 'lg']) {
      const raw = attrs.has(`${bp}-${axis}`) ? attrs.get(`${bp}-${axis}`)
        : (attrs.has(axis) ? attrs.get(axis) : undefined);
      if (raw === undefined) continue;
      vars.push(`--ns-${name}-${bp}:${cssLen(raw, `${axis} offset`, where)}`);
    }
  }
  return vars;
}

function widthVars(value, where) {
  const s = String(value).trim();
  const parts = s.split('/');
  if (parts.length > 2 || parts.some((v) => !/^\d+(\.\d+)?$/.test(v))) {
    throw new MarkupError(`${where}: line width must be a number or "lg/xs" in px, got "${s}"`);
  }
  const [lg, xs] = parts;
  return [`--ns-w-lg:${lg}px`, `--ns-w-xs:${xs === undefined ? lg : xs}px`];
}

function styleAttr(vars) {
  return vars.length ? ` style="${vars.join(';')}"` : '';
}

/**
 * Parse the inside of a `{line ...}` / `{icon ...}` tag into
 * {name, flags:Set, attrs:Map}.  Values may be quoted.
 */
function parseTag(body, where) {
  const tokens = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (/\s/.test(ch)) { i++; continue; }
    let start = i;
    let buf = '';
    while (i < body.length && !/\s/.test(body[i])) {
      if (body[i] === '"' || body[i] === "'") {
        const q = body[i];
        const end = body.indexOf(q, i + 1);
        if (end < 0) throw new MarkupError(`${where}: unterminated quote`);
        buf += body.slice(i + 1, end);
        i = end + 1;
        continue;
      }
      buf += body[i];
      i++;
    }
    tokens.push({ text: buf, at: start });
  }
  if (!tokens.length) throw new MarkupError(`${where}: empty tag`);
  const name = tokens[0].text;
  const flags = new Set();
  const attrs = new Map();
  for (const t of tokens.slice(1)) {
    const eq = t.text.indexOf('=');
    if (eq < 0) flags.add(t.text);
    else attrs.set(t.text.slice(0, eq), t.text.slice(eq + 1));
  }
  return { name, flags, attrs };
}

function buildLine(tag, where) {
  for (const f of tag.flags) {
    if (!LINE_FLAGS.has(f)) {
      throw new MarkupError(
        `${where}: unknown {line} flag "${f}" (allowed: ${[...LINE_FLAGS].join(', ')})`);
    }
  }
  for (const k of tag.attrs.keys()) {
    if (!LINE_KEYS.has(k)) {
      throw new MarkupError(
        `${where}: unknown {line} attribute "${k}" (allowed: ${[...LINE_KEYS].join(', ')})`);
    }
  }
  const cls = ['text-line'];
  if (!tag.flags.has('no-scale')) cls.push('from-scale');
  if (tag.flags.has('half')) cls.push('half');
  if (tag.flags.has('dark')) cls.push('dark');
  if (tag.flags.has('lg-only')) cls.push('xs:!hidden', 'lg:!block');
  if (tag.flags.has('xs-only')) cls.push('lg:!hidden', 'xs:!block');
  cls.push('ic');
  const vars = [];
  if (tag.attrs.has('w')) { cls.push('ns-w'); vars.push(...widthVars(tag.attrs.get('w'), where)); }
  const nud = nudgeVars(tag.attrs, where);
  if (nud.length) { cls.push('ns-t'); vars.push(...nud); }
  for (const m of ['my', 'mb', 'mt']) {
    if (!tag.attrs.has(m)) continue;
    const v = String(tag.attrs.get(m));
    const [lg, xs] = v.split('/');
    cls.push(xs === undefined ? `${m}-${lg}` : `lg:${m}-${lg} xs:${m}-${xs}`);
  }
  return `<span class="${cls.join(' ')}"${styleAttr(vars)}></span>`;
}

function buildIcon(tag, where) {
  const key = [...tag.flags][0] === undefined && tag.attrs.size === 0
    ? null : null;
  void key;
  const parts = [...tag.flags];
  const nameTok = parts.shift();
  if (!nameTok) throw new MarkupError(`${where}: {icon} needs a name`);
  const base = ICONS[nameTok];
  if (!base) {
    throw new MarkupError(
      `${where}: unknown icon "${nameTok}" (allowed: ${Object.keys(ICONS).join(', ')})`);
  }
  const cls = [base, 'ic'];
  if (parts.includes('rotate')) cls.push('rotate-180');
  if (parts.includes('block')) cls.push('!block', 'mx-auto');
  else cls.push('inline-block');
  for (const m of ['mb', 'mt']) {
    if (!tag.attrs.has(m)) continue;
    const v = String(tag.attrs.get(m));
    const [lg, xs] = v.split('/');
    cls.push(xs === undefined ? `${m}-${lg}` : `lg:${m}-${lg} xs:${m}-${xs}`);
  }
  const unknown = parts.filter((p) => !['rotate', 'block'].includes(p));
  if (unknown.length) {
    throw new MarkupError(`${where}: unknown {icon} flag "${unknown[0]}"`);
  }
  return `<span class="${cls.join(' ')}"></span>`;
}

/** Escape text that goes into HTML (shorthand output is otherwise trusted). */
function esc(s) {
  return s.replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const PAIRED = {
  em: null,          // handled specially (serif, size-aware)
  grad: (inner) => `<span class="gradient-text">${inner}</span>`,
  z: (inner) => `<span class="relative z-2">${inner}</span>`,
  lg: (inner) => `<span class="xs:hidden lg:inline-block">${inner}</span>`,
  xs: (inner) => `<span class="xs:inline lg:hidden">${inner}</span>`,
};

/**
 * Compile one block's shorthand into HTML.
 *
 * opts:
 *   size        "50/30"      body font pair; also drives [[...]] serif size
 *   family      sans|serif   which face the block's own size classes use
 *   align       left|center|right
 *   gradientDir left|right|null   -> which class {g} emits
 *   pClass      extra classes appended to the wrapping <p>
 *   where       label used in error messages
 */
function compile(text, opts = {}) {
  const where = opts.where || 'block';
  if (typeof text !== 'string') {
    throw new MarkupError(`${where}: text must be a string`);
  }
  const family = opts.family || 'sans';
  if (family !== 'sans' && family !== 'serif') {
    throw new MarkupError(`${where}: family must be "sans" or "serif", got "${family}"`);
  }
  // Emphasis tone: which text colour this block sits on, so the injected theme
  // CSS can pick a readable accent. null opts out entirely (raw upstream look).
  const tone = opts.emphasisTone === undefined ? 'dark' : opts.emphasisTone;
  if (tone !== null && tone !== 'dark' && tone !== 'light') {
    throw new MarkupError(`${where}: emphasisTone must be "dark", "light" or null, got "${tone}"`);
  }
  const emTone = tone === null ? [] : ['ns-em', `ns-em--on-${tone}`];
  const rootSize = parseSizePair(opts.size, where);
  const sizeStack = [rootSize];
  const out = [];
  let i = 0;
  const n = text.length;

  const currentSerif = () => sizeClasses(sizeStack[sizeStack.length - 1], 'serif');

  const openTags = [];

  while (i < n) {
    // raw escape hatch
    if (text.startsWith('{raw}', i)) {
      const end = text.indexOf('{/raw}', i);
      if (end < 0) throw new MarkupError(`${where}: {raw} is never closed`);
      out.push(text.slice(i + 5, end));
      i = end + 6;
      continue;
    }
    // [[emphasis]]
    if (text.startsWith('[[', i)) {
      const end = text.indexOf(']]', i + 2);
      if (end < 0) throw new MarkupError(`${where}: [[ is never closed with ]]`);
      const inner = compileInline(text.slice(i + 2, end), sizeStack, opts, where);
      const cls = [currentSerif(), ...emTone].filter(Boolean).join(' ');
      out.push(cls ? `<i class="${cls}">${inner}</i>` : `<i>${inner}</i>`);
      i = end + 2;
      continue;
    }
    if (text[i] === '{') {
      const close = text.indexOf('}', i);
      if (close < 0) throw new MarkupError(`${where}: "{" is never closed with "}"`);
      const body = text.slice(i + 1, close);

      // closing tag
      if (body.startsWith('/')) {
        const name = body.slice(1).trim();
        const top = openTags.pop();
        if (!top) throw new MarkupError(`${where}: stray {/${name}}`);
        if (top.name !== name) {
          throw new MarkupError(`${where}: {/${name}} closes {${top.name}}`);
        }
        const inner = out.splice(top.mark).join('');
        out.push(top.wrap(inner));
        if (top.pushedSize) sizeStack.pop();
        i = close + 1;
        continue;
      }

      const tag = parseTag(body, where);

      if (tag.name === 'line') { out.push(buildLine(tag, where)); i = close + 1; continue; }
      if (tag.name === 'icon') { out.push(buildIcon(tag, where)); i = close + 1; continue; }
      if (tag.name === 'br') { out.push('<br>'); i = close + 1; continue; }
      if (tag.name === 'nbsp') { out.push('&nbsp;'); i = close + 1; continue; }

      if (tag.name === 'sz') {
        const pair = parseSizePair([...tag.flags][0], where);
        if (!pair) throw new MarkupError(`${where}: {sz} needs a size, e.g. {sz 38/26}`);
        const cls = sizeClasses(pair, family);
        sizeStack.push(pair);
        openTags.push({
          name: 'sz', mark: out.length, pushedSize: true,
          wrap: (inner) => `<span class="${cls}">${inner}</span>`,
        });
        i = close + 1;
        continue;
      }

      if (tag.name === 'g') {
        const dir = opts.gradientDir;
        if (!dir) {
          throw new MarkupError(
            `${where}: {g} used but this block has no gradientDir ("left" or "right")`);
        }
        // Upstream wrote `lg:lines-text-gradient`, but that variant is absent from
        // the compiled CSS, so the gradient never rendered. Only the unprefixed
        // classes exist — use those so the effect actually shows up.
        const cls = dir === 'left' ? 'lines-text-gradient-left' : 'lines-text-gradient';
        openTags.push({
          name: 'g', mark: out.length,
          wrap: (inner) => `<span class="${cls}">${inner}</span>`,
        });
        i = close + 1;
        continue;
      }

      if (tag.name === 'span') {
        const cls = [...tag.flags].join(' ');
        if (!cls) throw new MarkupError(`${where}: {span} needs classes, e.g. {span "mt-5"}`);
        openTags.push({
          name: 'span', mark: out.length,
          wrap: (inner) => `<span class="${cls}">${inner}</span>`,
        });
        i = close + 1;
        continue;
      }

      if (tag.name === 'em') {
        if (tag.flags.size) {
          throw new MarkupError(
            `${where}: {em} takes attributes, not flags (got "${[...tag.flags][0]}")`);
        }
        for (const k of tag.attrs.keys()) {
          if (!EM_KEYS.has(k)) {
            throw new MarkupError(
              `${where}: unknown {em} attribute "${k}" (allowed: ${[...EM_KEYS].join(', ')})`);
          }
        }
        const forced = tag.attrs.has('sz') ? parseSizePair(tag.attrs.get('sz'), where) : null;
        const extra = tag.attrs.has('cls')
          ? String(tag.attrs.get('cls')).trim().split(/\s+/).filter(Boolean) : [];
        // Resolved at open time: the size context here is the one the author sees.
        const nud = nudgeVars(tag.attrs, where);
        // `translate` has no effect on a plain inline box, so a nudged <i>
        // becomes inline-block. (Upstream nudged <i> elements without it,
        // which is why those offsets never actually moved anything.)
        const cls = [sizeClasses(forced || sizeStack[sizeStack.length - 1], 'serif'),
          ...emTone, ...extra, ...(nud.length ? ['ns-t', 'inline-block'] : [])]
          .filter(Boolean).join(' ');
        const style = styleAttr(nud);
        openTags.push({
          name: 'em', mark: out.length,
          wrap: (inner) => (cls ? `<i class="${cls}"${style}>${inner}</i>` : `<i>${inner}</i>`),
        });
        i = close + 1;
        continue;
      }

      if (PAIRED[tag.name]) {
        const fn = PAIRED[tag.name];
        openTags.push({ name: tag.name, mark: out.length, wrap: fn });
        i = close + 1;
        continue;
      }

      throw new MarkupError(
        `${where}: unknown shorthand "{${tag.name}}". ` +
        'Known: line, icon, br, nbsp, sz, g, span, em, grad, z, lg, xs, raw');
    }

    // Backslash at end of line = continuation: no <br>. Lets a block put its
    // decorative {line}/{icon} tags on their own source lines while keeping the
    // rule "one rendered line per config line".
    if (text[i] === '\\' && text[i + 1] === '\n') {
      i += 2;
      while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
      continue;
    }

    if (text[i] === '\n') {
      out.push('<br>\n');
      i++;
      // swallow the indentation that follows a newline in template strings
      while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
      continue;
    }

    // plain run
    let j = i;
    if (text[i] === '\\') j = i + 1; // literal backslash, keep scanning after it
    while (j < n && text[j] !== '{' && text[j] !== '\n' && text[j] !== '\\'
      && !text.startsWith('[[', j)) j++;
    out.push(esc(text.slice(i, j)));
    i = j;
  }

  if (openTags.length) {
    throw new MarkupError(`${where}: {${openTags[openTags.length - 1].name}} is never closed`);
  }

  let inner = out.join('');
  // A trailing <br> before the closing </p> is noise; the original markup has
  // some, keeping them is harmless, but a trailing newline from the config
  // literal is not intentional.
  inner = inner.replace(/(<br>\n)+$/, '');

  const pcls = [];
  if (rootSize) pcls.push(sizeClasses(rootSize, family));
  if (opts.align) pcls.push(`text-${opts.align}`);
  if (opts.pClass) pcls.push(opts.pClass);
  return `<p class="${pcls.join(' ')}">${inner}</p>`;
}

/** Compile a fragment without wrapping it in <p>. */
function compileInline(text, sizeStack, opts, where) {
  return compile(text, { ...opts, size: null, align: null, pClass: null, where })
    .replace(/^<p class="">/, '')
    .replace(/<\/p>$/, '');
}

module.exports = { compile, MarkupError, parseSizePair, sizeClasses, cssLen };
