'use strict';
/**
 * theme.js — 由 config/site.js 的 typography 段生成一小段注入 CSS。
 *
 * 为什么需要它
 * -------------
 * 原站用「衬线斜体」表示强调（`<i class="text-serif-50">`）。中文走不通：
 * 打包进来的两款字体（TheSeasons / TT Neoris）都不含 CJK 字形，中文会掉回
 * 系统字体，再被浏览器合成为伪斜体。所以强调改成换色 / 渐变，规则在构建时
 * 生成，插在 </head> 之前 —— 它排在站内 CSS 之后，同优先级下能覆盖。
 *
 * 两个色调类由编译器按段落底色自动挑选：
 *   .ns-em--on-dark   白字段落（smallDark / lines / big）
 *   .ns-em--on-light  深色字段落（smallLight，色值 --color-brand-black）
 *
 * 关于 .char：SmallTextNew / BigTextNew 用 GSAP SplitText 把文字逐字拆成
 * `.char`，`background-clip:text` 打在父元素上会失效（父元素已经没有文本
 * 节点了），所以渐变必须同时写到 `.char` 上 —— 这也是原站 `.gradient-text
 * .char` 的写法。
 */

/**
 * 布局用的两条通用规则，任何模式下都要注入。
 *
 * `src/_nuxt/*.css` 是 Tailwind 的编译产物 —— 只有原站英文文案用过的那几个
 * `!w-*` / `translate-*` 值才存在（桌面宽度只有 300/320/500/600 四档）。中文
 * 断行位置和英文不同，重调装饰线必须能用任意数值，所以宽度和位移改走 CSS
 * 变量：`{line w=418 x=-12%}` 生成 `class="… ns-w ns-t" style="--ns-w-lg:418px;…"`。
 *
 * 断点取值和站内 Tailwind 一致：xs = min-width:320px，lg = min-width:1024px。
 */
const BASE_RULES = [
  '@media(min-width:320px){'
  + '.ns-w{width:var(--ns-w-xs)!important}'
  + '.ns-t{translate:var(--ns-tx-xs,0) var(--ns-ty-xs,0)}}',
  '@media(min-width:1024px){'
  + '.ns-w{width:var(--ns-w-lg)!important}'
  + '.ns-t{translate:var(--ns-tx-lg,0) var(--ns-ty-lg,0)}}',
];

const MODES = new Set(['accent', 'gradient', 'italic', 'none']);
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-zA-Z]+)$/;

function checkColor(v, where, errors) {
  if (typeof v !== 'string' || !COLOR_RE.test(v.trim())) {
    errors.push(`site.typography.${where}: "${v}" 不像一个 CSS 颜色值`);
    return '#ffffff';
  }
  return v.trim();
}

function checkPair(v, where, errors) {
  if (!Array.isArray(v) || v.length !== 2) {
    errors.push(`site.typography.${where}: 需要 [起始色, 结束色] 两个颜色`);
    return ['#ffffff', '#ffffff'];
  }
  return [checkColor(v[0], `${where}[0]`, errors), checkColor(v[1], `${where}[1]`, errors)];
}

const clip = (grad) => `background-image:${grad};`
  + '-webkit-background-clip:text;background-clip:text;'
  + '-webkit-text-fill-color:transparent;color:transparent';

/**
 * @returns {{css: string, errors: string[], mode: string}}
 */
function buildTheme(site) {
  const errors = [];
  const t = (site && site.typography) || {};
  const mode = t.emphasis === undefined ? 'accent' : t.emphasis;
  const rules = [...BASE_RULES];

  if (!MODES.has(mode)) {
    errors.push(`site.typography.emphasis: 未知取值 "${mode}"`
      + `（可选: ${[...MODES].join(', ')}）`);
    return { css: rules.join('\n'), errors, mode: 'italic' };
  }
  if (mode === 'italic') return { css: rules.join('\n'), errors, mode };

  rules.push('.ns-em{font-style:normal}');

  if (mode === 'accent') {
    const onDark = checkColor(t.onDark === undefined ? '#88aeff' : t.onDark, 'onDark', errors);
    const onLight = checkColor(t.onLight === undefined ? '#3762be' : t.onLight, 'onLight', errors);
    rules.push(`.ns-em--on-dark,.ns-em--on-dark .char{color:${onDark};`
      + '-webkit-text-fill-color:currentcolor}');
    rules.push(`.ns-em--on-light,.ns-em--on-light .char{color:${onLight};`
      + '-webkit-text-fill-color:currentcolor}');
  } else if (mode === 'gradient') {
    const d = checkPair(t.gradientOnDark === undefined
      ? ['#ffffff', '#88aeff'] : t.gradientOnDark, 'gradientOnDark', errors);
    const l = checkPair(t.gradientOnLight === undefined
      ? ['#3762be', '#29345a'] : t.gradientOnLight, 'gradientOnLight', errors);
    rules.push(`.ns-em--on-dark,.ns-em--on-dark .char{${clip(`linear-gradient(96deg,${d[0]} 0%,${d[1]} 100%)`)}}`);
    rules.push(`.ns-em--on-light,.ns-em--on-light .char{${clip(`linear-gradient(96deg,${l[0]} 0%,${l[1]} 100%)`)}}`);
  }

  return { css: rules.join('\n'), errors, mode };
}

module.exports = { buildTheme, MODES };
