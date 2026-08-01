'use strict';
/**
 * menu.js — 由 config/site.js 的 menu 段生成移动端菜单的背景样式。
 *
 * 这是在修一个上游的真实 bug
 * ---------------------------
 * 上游给菜单写过背景，但整条规则被 Sass 风格的 `//` 注释掉了 —— `//` 在
 * 纯 CSS 里不是注释，浏览器解析到非法声明会丢弃整条规则：
 *
 *   .mobile-menu[data-v-89305177]{//background-image:url(./images/menu_back.jpg);
 *     //background-size:cover;//background-position:center}
 *
 * 而且 `src/images/menu_back.jpg` 这个文件在仓库里根本不存在。实测（iPhone 13
 * 视口，打开菜单后读 computed style）：
 *   background-image: "none"，background-color: "rgba(0,0,0,0)"，backdrop-filter: "none"
 *
 * 也就是说菜单**没有自己的背景**：白色的导航文字直接压在进入结霜状态的 3D
 * 场景上（打开菜单会触发 setIceTransition(1)）。场景滚到哪、菜单就是什么底色，
 * 页面顶部是淡粉淡蓝（白字几乎看不见），往下滚是深色（于是"黑不溜秋"）。
 *
 * 所以这里给它一个**自己的、可预期的**背景。
 *
 * 为什么不碰引擎
 * ---------------
 * 类名 `.mobile-menu` 是上游写死的，scope 属性 `[data-v-89305177]` 也是编译
 * 产物的一部分。我们只要注入一条特异度打平、但排在后面的规则就能覆盖：
 *
 *   .mobile-menu[data-v-89305177]  → (0,2,0)  上游
 *   .mobile-menu.mobile-menu       → (0,2,0)  我们，靠出现顺序取胜
 *
 * 主题 CSS 由 build.js 插在 </head> 之前、所有站内 CSS 之后，所以顺序稳赢。
 * 重复类名这个写法的好处是**不用把 scope id 硬编码进模板** —— 上游哪天重新
 * 构建，hash 变了也不影响。
 *
 * 层级说明（为什么加 isolation / z-index:-1）
 * -------------------------------------------
 * `<header class="fixed z-10">` 里，logo 和关闭按钮在 `.container.relative.z-2`
 * 里，`.mobile-menu` 的 z-index 是 auto —— 也就是说容器永远盖在菜单背景之上，
 * 加背景不会遮住 logo 和关闭按钮（这点实测确认过）。
 * 噪点层用 `::after` 绝对定位实现，但绝对定位元素默认画在普通流内容**之后**，
 * 会盖住导航文字；给它 `z-index:-1` 就落到「背景之上、内容之下」那一层。
 * 配合父元素 `isolation:isolate`，`mix-blend-mode` 只跟菜单自己的背景混合，
 * 不会去和后面的 3D 画布叠加。
 */
const {
  isHex6, rgba, fade, contrast, over,
} = require('./color');

/** 可选的背景预设。none = 什么都不注入（保持上游行为，纯逃生口）。 */
const MENU_MODES = new Set(['aurora', 'gradient', 'frost', 'none']);

const MENU_DEFAULTS = {
  background: 'aurora',
  colors: ['#00276e', '#143a8a', '#062969'],
  glow: ['#4edbef', '#88aeff', '#6248a4'],
  noise: true,
  motion: true,
};

/**
 * 细噪点：内联 SVG feTurbulence，不新增文件、不发请求。
 * stitchTiles='stitch' 让 140×140 的图块能无缝平铺，否则每块边缘会有接缝。
 * 它的作用是打散大面积渐变里的色带（banding）—— 深蓝渐变在 6bit 面板上
 * 特别容易出环。
 */
const NOISE_URI = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' "
  + "width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' "
  + "baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E"
  + "%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** 三个光斑的位置 / 尺寸 / 强度。抽出来是为了让 keyframes 和静态值同源。 */
const BLOBS = [
  { size: '58% 44%', at: '18% 22%', alpha: 0.3, stop: '60%', bg: '180% 180%' },
  { size: '52% 40%', at: '84% 34%', alpha: 0.32, stop: '62%', bg: '170% 170%' },
  { size: '64% 48%', at: '50% 92%', alpha: 0.36, stop: '66%', bg: '190% 190%' },
];

/** 极光飘动的三帧。只动 background-position —— 比动 filter:blur 的元素便宜一个数量级。 */
const DRIFT = [
  ['12% 18%', '86% 30%', '50% 88%'],
  ['32% 36%', '62% 10%', '32% 72%'],
  ['6% 48%', '94% 50%', '70% 98%'],
];

/**
 * frost 预设的底色不透明度。
 * 为什么不是更通透的 .62：菜单背后是 3D 场景，最坏情况是整片白（页面顶部
 * 那段确实接近白）。#062969 以 .62 压在纯白上等效 #657aa2，白字对比度 4.32:1，
 * 差一点点够不到 WCAG AA 的 4.5。提到 .72 等效 #4a638f，约 5.8:1，安全。
 */
const FROST_ALPHA = 0.72;

/** 社交链接的不透明度，上游是 .61（太暗），提到这个值。 */
const SOCIAL_ALPHA = 0.74;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * 各预设「最亮处」的等效底色 —— 对比度体检要按最坏情况算，不是按平均。
 *   aurora / gradient  不透明，最坏就是 colors 里最浅的那个
 *   frost              半透明，最坏是背后的 3D 场景整片白
 * 注意 aurora 的光斑是加色叠上去的，理论上会再提亮一点；但光斑本身
 * 不透明度只有 .3 左右且大面积是零透明，忽略这点误差比虚报安全。
 */
function worstBackdrop(mode, colors) {
  if (mode === 'frost') return over(colors[2], '#ffffff', FROST_ALPHA);
  return colors.reduce((a, c) => (contrast('#ffffff', c) < contrast('#ffffff', a) ? c : a));
}

function checkColorList(list, key, want, errors) {
  const fallback = MENU_DEFAULTS[key];
  if (!Array.isArray(list) || list.length !== want) {
    errors.push(`site.menu.${key}: 需要 ${want} 个 #RRGGBB 颜色，`
      + `实际拿到 ${JSON.stringify(list)}`);
    return fallback;
  }
  const bad = list.filter((c) => !isHex6(c));
  if (bad.length) {
    errors.push(`site.menu.${key}: ${bad.map((c) => JSON.stringify(c)).join('、')} `
      + '不是 #RRGGBB 写法（菜单背景要拆成 rgba 做透明渐变，所以只收六位十六进制）');
    return fallback;
  }
  return list.map((c) => c.trim().toLowerCase());
}

/** 底色：160° 线性渐变，三段。三套预设共用。 */
function baseGradient(colors) {
  return `linear-gradient(160deg,${colors[0]} 0%,${colors[1]} 55%,${colors[2]} 100%)`;
}

function auroraLayers(glow) {
  return BLOBS.map((b, i) => `radial-gradient(${b.size} at ${b.at},`
    + `${rgba(glow[i], b.alpha)} 0%,${fade(glow[i])} ${b.stop})`);
}

/**
 * @param {object} site  config/site.js（原始或规范化后的都行，只读 menu 段）
 * @returns {{css:string, errors:string[], warnings:string[], mode:string, contrast:number}}
 */
function buildMenuCss(site) {
  const errors = [];
  const warnings = [];
  const m = Object.assign({}, MENU_DEFAULTS, (site && site.menu) || {});
  const mode = m.background;

  if (!MENU_MODES.has(mode)) {
    errors.push(`site.menu.background: 未知取值 ${JSON.stringify(mode)}`
      + `（可选: ${[...MENU_MODES].join(', ')}）`);
    return {
      css: '', errors, warnings, mode: 'aurora', contrast: 0,
    };
  }
  if (mode === 'none') {
    return {
      css: '', errors, warnings, mode, contrast: 0,
    };
  }

  const colors = checkColorList(m.colors, 'colors', 3, errors);
  const glow = checkColorList(m.glow, 'glow', 3, errors);
  const motion = m.motion !== false;
  const noise = m.noise !== false;

  const rules = [];
  const sel = '.mobile-menu.mobile-menu';
  // 打开状态由 Vue 加上 `opacity-100`。把动画和 backdrop-filter 挂在这个类上，
  // 菜单关着的时候就不会有任何持续开销 —— 移动端这点很值。
  const open = `${sel}.opacity-100`;
  let linkExtra = '';

  if (mode === 'frost') {
    // 半透明深色 + 背景模糊：3D 场景隐约透出来，但文字有了稳定的底。
    // 不透明度取 FROST_ALPHA 而不是更通透的 .62 —— 见下面的对比度计算：
    // .62 在纯白场景下只有 4.32:1，压不住 AA 线。
    rules.push(`${sel}{isolation:isolate;`
      + `background-color:${rgba(colors[2], FROST_ALPHA)};`
      + `background-image:linear-gradient(170deg,${rgba(colors[0], 0.5)} 0%,`
      + `${rgba(colors[1], 0.24)} 48%,${rgba(colors[2], 0.5)} 100%)}`);
    rules.push(`${open}{-webkit-backdrop-filter:blur(28px) saturate(150%);`
      + 'backdrop-filter:blur(28px) saturate(150%)}');
    // 透出来的场景亮度不可控，给文字补一层阴影兜底（不计入 WCAG，只是好看）。
    linkExtra = `;text-shadow:0 1px 18px ${rgba(colors[2], 0.75)}`;
  } else if (mode === 'gradient') {
    rules.push(`${sel}{isolation:isolate;background-image:${baseGradient(colors)}}`);
  } else {
    // aurora
    const layers = [...auroraLayers(glow), baseGradient(colors)];
    rules.push(`${sel}{isolation:isolate;`
      + `background-image:${layers.join(',')};`
      + `background-size:${BLOBS.map((b) => b.bg).join(',')},100% 100%;`
      + `background-position:${DRIFT[0].join(',')},0 0}`);
    if (motion) {
      rules.push(`${open}{animation:ns-menu-aurora 34s ease-in-out infinite alternate}`);
      rules.push('@keyframes ns-menu-aurora{'
        + DRIFT.map((frame, i) => `${i * 50}%{background-position:${frame.join(',')},0 0}`).join('')
        + '}');
      // 系统级「减少动态效果」优先级高于配置项。
      rules.push(`@media(prefers-reduced-motion:reduce){${open}{animation:none}}`);
    }
  }

  if (noise && mode !== 'frost') {
    // frost 已经有背景模糊在打散色带了，再叠噪点纯属浪费一层合成。
    rules.push(`${sel}::after{content:"";position:absolute;inset:0;z-index:-1;`
      + 'pointer-events:none;opacity:.055;mix-blend-mode:overlay;'
      + `background-image:${NOISE_URI};background-size:140px 140px}`);
  }

  // 可读性微调。
  // 导航链接的 opacity 是逐条错峰动画（delay-200/250/300/350），绝对不能碰；
  // 社交行的错峰在父元素上，子元素的 opacity-61 是静态值，可以安全提亮。
  rules.push(`${sel} a{letter-spacing:.04em${linkExtra}}`);
  rules.push(`${sel} a.opacity-61{opacity:${String(SOCIAL_ALPHA).replace(/^0\./, '.')}}`);

  // 对比度体检：菜单文字是上游写死的 text-white，改不了，所以底色必须够深。
  // 只提示不拦截 —— 这是审美判断，不是正确性问题。
  const eff = worstBackdrop(mode, colors);
  const ratio = round1(contrast('#ffffff', eff));
  if (ratio < 4.5) {
    warnings.push(`site.menu：白色导航文字在最亮处的对比度只有 ${ratio}:1（等效底色 ${eff}），`
      + '低于 WCAG AA 的 4.5:1。菜单文字颜色是上游写死的 text-white，改不了，'
      + '请把 colors 换深一些'
      + (mode === 'frost' ? '，或改用 aurora / gradient 这类不透明预设。' : '。'));
  }
  // 社交行是 74% 白，单独再算一次（AA 对非正文的下限按 3:1 看）。
  const social = round1(contrast(over('#ffffff', eff, SOCIAL_ALPHA), eff));
  if (social < 3) {
    warnings.push(`site.menu：社交链接（${SOCIAL_ALPHA * 100}% 白）对比度只有 ${social}:1，偏低。`);
  }

  return {
    css: rules.join('\n'), errors, warnings, mode, contrast: ratio, backdrop: eff,
  };
}

module.exports = {
  buildMenuCss, worstBackdrop, MENU_MODES, MENU_DEFAULTS, NOISE_URI, FROST_ALPHA,
};
