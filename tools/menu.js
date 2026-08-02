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
 *
 * 默认预设为什么是 ink 而不是 aurora
 * -----------------------------------
 * aurora 那套（深蓝线性渐变 + 三团径向光斑 + 噪点）和上一版加载页用的是
 * **完全相同**的三个蓝、相同的光斑色、相同的手法。同一个站里两处大面积色块
 * 长得一模一样，既没有记忆点，也是典型的"默认审美"。而且它只解决了"有没有
 * 底色"，没有解决"菜单本身长什么样"—— 四个居中的白字、64px 等距、没有层次。
 *
 * ink 换的是**手法**，不是颜色：
 *   底    近黑墨色（#0c0c0e）的竖向三段渐变，从 90% 压到 97% 不透明度，
 *         配 backdrop-filter 的模糊 + 轻微增饱和 —— 背后的 3D 场景不是被
 *         盖掉，是被"磨"进底色里，顶部略透、底部近实。
 *   版    导航从居中列表改成**通栏索引表**：每一条自己占一行，上边一条发丝线，
 *         左边是标题、右边是 01/02/03/04 的序号，发丝线通栏、文字受量度约束。
 *   动    每条打开时从下方 14px 抬起。错峰直接复用上游自己的 delay-200/250/
 *         300/350（见下面 inkRules 里的说明），不另外写一套。
 *
 * 序号用 CSS 计数器（counter-reset / counter-increment / counter()）而不是
 * 写死 content:"01"…"04"，这样导航条目数变了序号自己跟着变，不用改样式。
 */
const {
  isHex6, rgba, fade, contrast, over,
} = require('./color');

/** 可选的背景预设。none = 什么都不注入（保持上游行为，纯逃生口）。 */
const MENU_MODES = new Set(['ink', 'aurora', 'gradient', 'frost', 'none']);

const MENU_DEFAULTS = {
  background: 'ink',
  // ink 用这两个
  ink: '#0c0c0e',
  index: true,
  // aurora / gradient / frost 用这两个
  colors: ['#00276e', '#143a8a', '#062969'],
  glow: ['#4edbef', '#88aeff', '#6248a4'],
  // 共用
  noise: true,
  motion: true,
};

// ------------------------------------------------------------------ ink 参数

/**
 * 墨底三段不透明度：顶 90% / 中 94% / 底 97%。
 * 不做成纯不透明，是因为 backdrop-filter 的模糊只有在底下透得出东西时才有
 * 意义 —— 全实心的话磨砂层等于白开。顶部留 10% 透光量，正好让打开菜单时
 * 背后那次 setIceTransition(1) 的结霜过渡还能隐约看见，动作有了去处。
 */
const INK_STOPS = [0.9, 0.94, 0.97];
const INK_BLUR = '26px';
const INK_SATURATE = '110%';

/** 发丝线和序号的白色不透明度。 */
const INK_LINE = 0.13;
const INK_NUM = 0.42;

/** 打开时每条导航从下方抬起的距离（px）。 */
const INK_LIFT = 14;

/**
 * 文字量度上限（px）。菜单一直用到 1024px（lg 断点）才换成桌面导航，
 * 平板通栏时如果不收着，标题贴左边、序号贴右边，中间空出一大片，读起来
 * 眼睛要横跳。发丝线仍然通栏 —— 只有文字受这个约束。
 */
const INK_MEASURE = 520;

/**
 * 墨色对白字的对比度下限。7:1 = WCAG AAA。
 * 这里**不达标直接报错**，不像别的预设只是告警 —— 菜单文字颜色是上游写死的
 * text-white，配一个压不住白字的墨色等于把导航做没了，没有"这是审美选择"
 * 的余地。
 */
const INK_MIN = 7;

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

/** 0.13 → ".13"。CSS 里省掉前导 0，和 color.js 里 rgba() 的写法保持一致。 */
const dec = (n) => String(n).replace(/^0\./, '.');

/** 单个颜色的校验，用法和 checkColorList 一样：出错时回退到默认值。 */
function checkHex(v, key, errors) {
  if (!isHex6(v)) {
    errors.push(`site.menu.${key}: ${JSON.stringify(v)} 不是 #RRGGBB 写法`);
    return MENU_DEFAULTS[key];
  }
  return v.trim().toLowerCase();
}

/**
 * 各预设「最亮处」的等效底色 —— 对比度体检要按最坏情况算，不是按平均。
 *   aurora / gradient  不透明，最坏就是 colors 里最浅的那个
 *   frost              半透明，最坏是背后的 3D 场景整片白
 * 注意 aurora 的光斑是加色叠上去的，理论上会再提亮一点；但光斑本身
 * 不透明度只有 .3 左右且大面积是零透明，忽略这点误差比虚报安全。
 */
function worstBackdrop(mode, colors, ink) {
  if (mode === 'ink') return over(ink, '#ffffff', INK_STOPS[0]);
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
 * ink 预设的全部规则。
 *
 * 选择器为什么按位置选（>div:nth-child(2)）
 * ------------------------------------------
 * 上游那三个直接子元素只有第二个（导航容器）带类名 `flex flex-col gap-64
 * items-center`，第一个是空 div、第三个的类名里全是 Tailwind 工具类。按类名
 * 选会跟工具类的语义绑死（比如哪天 gap-64 改成 gap-48 就失配），按位置选
 * 反而稳 —— 结构变了会立刻在截图里露馅，不会静默错位。
 *
 * 错峰为什么不自己写
 * -------------------
 * 上游给这四条链接挂的是 `transition-all duration-300`，打开时再各自加上
 * `delay-200 / delay-250 / delay-300 / delay-350`（实测这四个类在
 * entry.BEbxiOYI.css 里都有定义）。`transition-all` 意味着我们加的 transform
 * 会跟着同一条 transition 和同一份 delay 走 —— 直接白捡一套已经和不透明度
 * 对齐的错峰。自己再写一套 transition-delay 只会跟它打架。
 *
 * @param {string} sel   .mobile-menu.mobile-menu
 * @param {string} open  加了 .opacity-100 的同一个选择器
 */
function inkRules(sel, open, o) {
  const { ink, index, motion } = o;
  const nav = `${sel}>div:nth-child(2)`;
  const link = `${nav}>a`;
  const social = `${sel}>div:nth-child(3)`;
  const line = `1px solid ${rgba('#ffffff', INK_LINE)}`;
  const r = [];

  // 底：竖向三段墨色。--ns-menu-gut 是"量度留白"，导航和社交行共用一个值，
  // 这样两处的左右边界永远对齐。
  r.push(`${sel}{isolation:isolate;`
    + `--ns-menu-gut:max(20px,(100% - ${INK_MEASURE}px)/2);`
    + `background-image:linear-gradient(180deg,`
    + `${rgba(ink, INK_STOPS[0])} 0%,`
    + `${rgba(ink, INK_STOPS[1])} 58%,`
    + `${rgba(ink, INK_STOPS[2])} 100%)}`);

  // 上游写的是 h-screen（100vh）。移动端浏览器的地址栏收起前 100vh 比可视区
  // 高一截，底部那行社交链接会被切掉。dvh 支持就用 dvh。
  r.push(`@supports(height:100dvh){${sel}{height:100dvh}}`);

  // 磨砂只挂在打开态：菜单关着的时候不留任何持续合成开销。
  r.push(`${open}{-webkit-backdrop-filter:blur(${INK_BLUR}) saturate(${INK_SATURATE});`
    + `backdrop-filter:blur(${INK_BLUR}) saturate(${INK_SATURATE})}`);

  // 不支持磨砂（老 Firefox、关了硬件加速的环境）就补一层实底。
  // 没有这条的话透出来的是 3D 场景原色，白字随时可能糊掉。
  r.push('@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){'
    + `${sel}{background-color:${ink}}}`);

  // 导航容器：拆掉 gap-64 和 items-center，改成通栏索引表。
  r.push(`${nav}{gap:0;align-self:stretch;align-items:stretch`
    + `${index ? ';counter-reset:ns-menu' : ''}}`);

  const linkDecl = ['display:flex', 'align-items:baseline', 'justify-content:space-between',
    'padding:clamp(20px,3.4vh,34px) var(--ns-menu-gut)',
    `border-top:${line}`,
    'font-size:clamp(30px,7.2vw,42px)', 'line-height:1.05'];
  if (index) linkDecl.push('counter-increment:ns-menu');
  if (motion) linkDecl.push(`transform:translateY(${INK_LIFT}px)`);
  r.push(`${link}{${linkDecl.join(';')}}`);
  r.push(`${link}:last-child{border-bottom:${line}}`);

  if (index) {
    // decimal-leading-zero 给出 01/02/03…；序号是装饰性的读数，不进无障碍
    // 树也没关系（::after 的 content 本来就不是可选中文本）。
    r.push(`${link}::after{content:counter(ns-menu,decimal-leading-zero);`
      + 'font-size:11px;line-height:1;letter-spacing:.24em;margin-right:-.24em;'
      + `opacity:${dec(INK_NUM)};`
      + 'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}');
  }

  if (motion) {
    r.push(`${open}>div:nth-child(2)>a{transform:none}`);
    // 系统级「减少动态效果」优先级高于配置项：位移直接不要，不透明度的
    // 淡入是上游的、留着（那个不算前庭刺激）。
    r.push(`@media(prefers-reduced-motion:reduce){${link}{transform:none}}`);
  }

  // 社交行：接上最后一条发丝线，左右缩到和导航文字同一条边界上。
  r.push(`${social}{border-top:${line};padding-top:20px;`
    + 'padding-left:var(--ns-menu-gut);padding-right:var(--ns-menu-gut)}');

  // 序号是右对齐的，把导航链接的 :focus-visible 描边往里收 —— 默认那圈
  // outline-offset:3px 会顶到发丝线外面去，看着像错位。
  r.push(`${link}:focus-visible{outline-offset:-6px;border-radius:0}`);

  return r;
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
      css: '', errors, warnings, mode: MENU_DEFAULTS.background, contrast: 0,
    };
  }
  if (mode === 'none') {
    return {
      css: '', errors, warnings, mode, contrast: 0,
    };
  }

  const motion = m.motion !== false;
  const noise = m.noise !== false;
  // ink 只用 ink + index 两个键，别的预设只用 colors + glow。各校验各的，
  // 免得配了 ink 却因为没写 glow 而报一堆用不上的错。
  const isInk = mode === 'ink';
  const ink = isInk ? checkHex(m.ink, 'ink', errors) : MENU_DEFAULTS.ink;
  if (isInk && typeof m.index !== 'boolean') {
    errors.push(`site.menu.index: 需要 true / false，实际拿到 ${JSON.stringify(m.index)}`);
  }
  const index = m.index !== false;
  const colors = isInk ? MENU_DEFAULTS.colors : checkColorList(m.colors, 'colors', 3, errors);
  const glow = isInk ? MENU_DEFAULTS.glow : checkColorList(m.glow, 'glow', 3, errors);

  const rules = [];
  const sel = '.mobile-menu.mobile-menu';
  // 打开状态由 Vue 加上 `opacity-100`。把动画和 backdrop-filter 挂在这个类上，
  // 菜单关着的时候就不会有任何持续开销 —— 移动端这点很值。
  const open = `${sel}.opacity-100`;
  let linkExtra = '';

  if (isInk) {
    rules.push(...inkRules(sel, open, { ink, index, motion }));
  } else if (mode === 'frost') {
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

  if (noise && mode !== 'frost' && !isInk) {
    // frost 和 ink 都已经有背景模糊在打散色带了，再叠噪点纯属浪费一层合成。
    rules.push(`${sel}::after{content:"";position:absolute;inset:0;z-index:-1;`
      + 'pointer-events:none;opacity:.055;mix-blend-mode:overlay;'
      + `background-image:${NOISE_URI};background-size:140px 140px}`);
  }

  // 可读性微调。
  // 导航链接的 opacity 是逐条错峰动画（delay-200/250/300/350），绝对不能碰；
  // 社交行的错峰在父元素上，子元素的 opacity-61 是静态值，可以安全提亮。
  rules.push(`${sel} a{letter-spacing:.04em${linkExtra}}`);
  rules.push(`${sel} a.opacity-61{opacity:${dec(SOCIAL_ALPHA)}}`);

  // 键盘可达性：上游整个站里 focus-visible 出现 0 次，Tab 走到菜单里没有任何
  // 可见反馈。补一圈描边，所有预设都给。
  rules.push(`${sel} a:focus-visible{outline:2px solid ${rgba('#ffffff', 0.7)};`
    + 'outline-offset:3px;border-radius:3px}');

  // 对比度体检：菜单文字是上游写死的 text-white，改不了，所以底色必须够深。
  const eff = worstBackdrop(mode, colors, ink);
  const ratio = round1(contrast('#ffffff', eff));
  // ink 是我们自己定的默认预设，压不住白字就是坏了，直接拦；其它预设是
  // 用户自己配的颜色，只提示不拦截 —— 那是审美判断，不是正确性问题。
  if (isInk && ratio < INK_MIN) {
    errors.push(`site.menu.ink: ${ink} 在最透的那一段（${dec(INK_STOPS[0])} 不透明度，`
      + `等效底色 ${eff}）对白字只有 ${ratio}:1，低于要求的 ${INK_MIN}:1。把墨色调深。`);
  }
  if (!isInk && ratio < 4.5) {
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
  buildMenuCss,
  worstBackdrop,
  MENU_MODES,
  MENU_DEFAULTS,
  NOISE_URI,
  FROST_ALPHA,
  INK_STOPS,
  INK_MIN,
  INK_LIFT,
  INK_MEASURE,
};
