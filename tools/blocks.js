'use strict';
/**
 * blocks.js — compile config/story.js into the data the patched page chunk
 * consumes.
 *
 * Errors are collected, not thrown one at a time: fixing a config file one
 * typo per build is miserable, so a bad build reports everything wrong at once.
 */
const { compile, MarkupError } = require('./markup');
const { validateDescriptor } = require('./positions');
const { EXPECTED_KINDS } = require('./story');
const { unknownClasses, suggest } = require('./cssclasses');

const POS_KEYS = ['at', 'to', 'out', 'gone'];
const TEXT_KINDS = ['smallLight', 'smallDark', 'big', 'lines'];

const BLOCK_KEYS = new Set([
  'className', 'size', 'family', 'align', 'pClass', 'gradientDir', 'tone',
  'text', 'html', 'debug', 'toTop', ...POS_KEYS,
]);

/**
 * Which text colour each family of blocks renders on. SmallTextNew flips
 * between `text-brand-black` (mode "light") and `text-white` (mode "dark");
 * LinesText is always white; BigTextNew inherits and sits over the dark scene.
 * Used to pick the readable emphasis accent — override per block with `tone`.
 */
const KIND_TONE = {
  smallLight: 'light', smallDark: 'dark', big: 'dark', lines: 'dark',
};
const CASE_KEYS = new Set([
  'title', 'subtitle', 'url', 'side', 'crystal', 'className',
  'titleSize', 'subtitleSize', 'nowrapSubtitle', 'html',
]);

/**
 * The label markup every case shares. Upstream had four near-identical copies
 * with one inert difference (case 0 disabled the blur on mobile, on a span that
 * is `xs:hidden` anyway), so they are unified here.
 */
function caseHtml(c, where) {
  if (typeof c.html === 'string') return c.html;
  const side = c.side === 'right' ? 'right' : 'left';
  const tSize = c.titleSize || '50/26';
  const sSize = c.subtitleSize || '18';
  const size = (pair) => {
    const [lg, xs] = String(pair).split('/');
    return xs === undefined ? `text-sans-${lg}` : `lg:text-sans-${lg} xs:text-sans-${xs}`;
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!c.title) throw new MarkupError(`${where}: case needs a title`);
  return `<span class="flex xs:items-center lg:items-start gap-0 flex-col xs:relative `
    + `lg:absolute h-full lg:-top-12 lg:${side}-80">`
    + `<span class="${size(tSize)} whitespace-nowrap relative z-2">${esc(c.title)}</span><br>`
    + `<span class="${size(sSize)} -mt-10${c.nowrapSubtitle ? ' whitespace-nowrap' : ''} `
    + `relative z-2">${esc(c.subtitle || '')}</span>`
    + '<span class="absolute xs:hidden lg:block w-full blur-[80px] h-151 bg-dark-400 '
    + 'left-0 top-0 rounded-[100%] -translate-y-1/4"></span>'
    + '</span>';
}

function checkKeys(obj, allowed, where, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      errors.push(`${where}: 未知字段 "${k}"（可用: ${[...allowed].join(', ')}）`);
    }
  }
}

/**
 * src/_nuxt/*.css 是 Tailwind 的编译产物，只包含原站用过的类。写一个看起来
 * 合理但没被生成的类（`lg:text-serif-26`、`lg:translate-y-0`……）不会报错，
 * 只是排版悄悄不生效 —— 所以在这里拦下来。
 */
function checkClasses(html, known, where, errors) {
  if (!known) return;
  for (const c of unknownClasses(html, known)) {
    const hint = suggest(c, known);
    errors.push(`${where}: CSS 里没有类名 "${c}"`
      + `${hint.length ? `，是不是想写 ${hint.map((h) => `"${h}"`).join(' / ')}？` : ''}`
      + '（站内 CSS 是编译产物，只含原站用过的工具类）');
  }
}

/**
 * @param {object} story  config/story.js
 * @param {number} sectionCount  number of scroll sections in config/scene.js
 * @param {Set<string>} [knownClasses]  class names the compiled CSS ships
 * @returns {{data: object, errors: string[], stats: object}}
 */
function compileStory(story, sectionCount, knownClasses) {
  const errors = [];
  const data = {};
  const stats = {};

  for (const kind of Object.keys(EXPECTED_KINDS)) {
    const list = story[kind];
    if (!Array.isArray(list)) {
      errors.push(`story.${kind}: 需要一个数组，实际为 ${typeof list}`);
      continue;
    }
    if (list.length !== EXPECTED_KINDS[kind]) {
      errors.push(`story.${kind}: 必须正好 ${EXPECTED_KINDS[kind]} 项，`
        + `实际 ${list.length} 项（数量由预编译的 3D 场景决定，不能增删）`);
    }
  }

  for (const kind of TEXT_KINDS) {
    const list = Array.isArray(story[kind]) ? story[kind] : [];
    data[kind] = [];
    list.forEach((b, i) => {
      const where = `story.${kind}[${i}]`;
      checkKeys(b, BLOCK_KEYS, where, errors);
      const item = { className: b.className || '' };
      for (const k of POS_KEYS) {
        try {
          validateDescriptor(b[k], `${where}.${k}`, sectionCount);
          item[k] = b[k];
        } catch (err) { errors.push(err.message); }
      }
      try {
        item.html = typeof b.html === 'string' ? b.html : compile(b.text, {
          size: b.size,
          family: b.family,
          align: b.align,
          pClass: b.pClass,
          gradientDir: b.gradientDir,
          emphasisTone: b.tone === undefined ? KIND_TONE[kind] : b.tone,
          knownClasses,
          where,
        });
      } catch (err) {
        errors.push(err instanceof MarkupError ? err.message : `${where}: ${err.message}`);
      }
      if (item.html) checkClasses(item.html, knownClasses, where, errors);
      checkClasses(`class="${item.className}"`, knownClasses, `${where}.className`, errors);
      if (b.debug) item.debug = true;
      if (kind === 'lines') item.toTop = b.toTop === undefined ? 120 : b.toTop;
      data[kind].push(item);
    });
    stats[kind] = data[kind].length;
  }

  data.cases = [];
  (Array.isArray(story.cases) ? story.cases : []).forEach((c, i) => {
    const where = `story.cases[${i}]`;
    checkKeys(c, CASE_KEYS, where, errors);
    const side = c.side === 'right' ? 'right' : 'left';
    const item = {
      className: c.className || `xs:${side}-0 lg:${side}-[20vw]`,
      url: c.url || '',
      crystal: c.crystal || `crystal${i}`,
    };
    if (c.url && !/^(https?:\/\/|\/|#|mailto:)/.test(c.url)) {
      errors.push(`${where}.url: "${c.url}" 不是有效链接（用 https:// 开头的外部地址，或留空表示不可点击）`);
    }
    try { item.html = caseHtml(c, where); } catch (err) { errors.push(err.message); }
    if (item.html) checkClasses(item.html, knownClasses, where, errors);
    checkClasses(`class="${item.className}"`, knownClasses, `${where}.className`, errors);
    data.cases.push(item);
  });
  stats.cases = data.cases.length;

  return { data, errors, stats };
}

module.exports = { compileStory, caseHtml, EXPECTED_KINDS };
