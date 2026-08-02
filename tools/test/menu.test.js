'use strict';
/**
 * menu.test.js — 移动端菜单背景。
 *
 * 背景故事：上游唯一那条针对 .mobile-menu 的规则被作者用 Sass 风格的 `//`
 * 注释掉了，而 `//` 在 CSS 里是非法写法，整条规则直接失效；它引用的
 * images/menu_back.jpg 也根本不存在。实测打开菜单时
 * `backgroundImage: "none"`、`backgroundColor: "rgba(0,0,0,0)"` ——
 * 所谓「黑不溜秋」其实是**根本没有背景**，白字直接压在 3D 场景上。
 *
 * 所以这里守两件事：
 *   1. 三套预设都真的生成了背景，而且是加在正确的选择器上；
 *   2. 白字（上游写死 text-white，改不了）在最亮处的对比度过得了 AA。
 */
const fs = require('fs');
const { test, eq, ok, setFile } = require('./harness');
const { SRC } = require('../paths');
const {
  buildMenuCss, worstBackdrop, MENU_MODES, MENU_DEFAULTS, NOISE_URI, FROST_ALPHA,
  INK_STOPS, INK_MIN, INK_LIFT, INK_MEASURE,
} = require('../menu');
const { contrast, over } = require('../color');

setFile('menu');

const site = (menu) => ({ menu: Object.assign({}, MENU_DEFAULTS, menu || {}) });

// 三个选择器写全太长，测试里反复出现，抽出来对齐 menu.js 里的写法。
const SEL = '.mobile-menu.mobile-menu';   // 双写提权，和上游那条坏规则打平后靠顺序取胜
const NAV = `${SEL}>div:nth-child(2)`;    // 导航列（4 条 <a>）
const LINK = `${NAV}>a`;                  // 单条导航链接

// ------------------------------------------------------- 0. 根因还在不在
test('menu: 上游那条规则确实是坏的（用 // 注释，CSS 里非法）', () => {
  // 同一条规则在 index.html 的内联 <style> 和编译出来的 entry CSS 里各一份。
  for (const f of [SRC.html, SRC.css]) {
    ok(fs.readFileSync(f, 'utf8')
      .includes('.mobile-menu[data-v-89305177]{//background-image'),
    `${f} 里那条坏规则不见了 —— 说明产物换过，这个模块的前提要重新确认`);
  }
});

test('menu: 上游引用的 menu_back.jpg 本来就不存在', () => {
  ok(!fs.existsSync('src/images/menu_back.jpg'));
});

// ----------------------------------------------------------- 1. 三套预设
for (const mode of ['aurora', 'gradient', 'frost']) {
  test(`menu: 预设 ${mode} 生成了背景，挂在 .mobile-menu.mobile-menu 上`, () => {
    const r = buildMenuCss(site({ background: mode }));
    eq(r.errors, []);
    eq(r.mode, mode);
    ok(r.css.includes('.mobile-menu.mobile-menu{'), r.css.slice(0, 160));
    ok(/background-(image|color):/.test(r.css), '没有任何背景声明');
    // 不能污染 3D 场景或别的组件
    ok(!r.css.includes('canvas'), r.css);
  });

  test(`menu: 预设 ${mode} 的白字对比度过 WCAG AA（4.5:1）`, () => {
    const r = buildMenuCss(site({ background: mode }));
    ok(r.contrast >= 4.5, `只有 ${r.contrast}:1（等效底色 ${r.backdrop}）`);
    eq(r.warnings, [], r.warnings.join('\n'));
  });
}

test('menu: aurora 才有极光动画，gradient 是纯渐变（最省电）', () => {
  const a = buildMenuCss(site({ background: 'aurora' }));
  const g = buildMenuCss(site({ background: 'gradient' }));
  ok(a.css.includes('@keyframes ns-menu-aurora'), '极光预设没有动画');
  ok(!g.css.includes('@keyframes'), '纯渐变预设不该带动画');
});

test('menu: 动画只动 background-position，且挂在 .opacity-100（关着时零开销）', () => {
  const r = buildMenuCss(site({ background: 'aurora' }));
  const kf = /@keyframes ns-menu-aurora\{(.*?)\}\}/s.exec(r.css);
  ok(kf, '找不到关键帧');
  const props = [...kf[1].matchAll(/\{([a-z-]+):/g)].map((m) => m[1]);
  eq([...new Set(props)], ['background-position'], props.join(', '));
  ok(r.css.includes('.mobile-menu.mobile-menu.opacity-100{animation:'),
    '动画没挂在打开状态上');
});

test('menu: motion:false 关掉动画，prefers-reduced-motion 也另外关一次', () => {
  ok(!buildMenuCss(site({ motion: false })).css.includes('animation:'),
    'motion:false 没生效');
  ok(buildMenuCss(site({})).css.includes(
    '@media(prefers-reduced-motion:reduce)'), '缺系统级动效开关');
});

test('menu: frost 用 backdrop-filter，同样只在打开时才付出代价', () => {
  const r = buildMenuCss(site({ background: 'frost' }));
  ok(r.css.includes('-webkit-backdrop-filter:blur('), '缺 Safari 前缀');
  ok(/\.opacity-100\{-webkit-backdrop-filter/.test(r.css), r.css);
});

test('menu: frost 的不透明度不能再低了 —— .62 就压不住 AA 线', () => {
  const c = MENU_DEFAULTS.colors[2];
  const at = (alpha) => contrast('#ffffff', over(c, '#ffffff', alpha));
  ok(at(FROST_ALPHA) >= 4.5, `FROST_ALPHA=${FROST_ALPHA} 只有 ${at(FROST_ALPHA)}:1`);
  ok(at(0.62) < 4.5, '如果 .62 也能过，说明 FROST_ALPHA 取保守了，可以调回去');
});

test('menu: background:none 输出空 CSS（完全不管菜单背景）', () => {
  const r = buildMenuCss(site({ background: 'none' }));
  eq(r.errors, []);
  eq(r.css, '');
});

// ------------------------------------------------------------- 2. 噪点层
const aurora = (extra) => site(Object.assign({ background: 'aurora' }, extra || {}));

test('menu: 噪点是内联 SVG data URI，不新增文件请求', () => {
  const r = buildMenuCss(aurora());
  ok(r.css.includes('::after{content:""'), '缺噪点层');
  ok(NOISE_URI.startsWith('url("data:image/svg+xml'), NOISE_URI.slice(0, 40));
  ok(NOISE_URI.includes('feTurbulence'), '噪点应当用 feTurbulence 现生成');
});

test('menu: 噪点层用 isolation + z-index:-1 垫在内容底下，不吃点击', () => {
  const r = buildMenuCss(aurora());
  ok(r.css.includes('isolation:isolate'), '没有 isolation，overlay 会串到整页');
  ok(/::after\{[^}]*z-index:-1/.test(r.css), '噪点层没垫到底下');
  ok(/::after\{[^}]*pointer-events:none/.test(r.css), '噪点层会挡住点击');
});

test('menu: noise:false 去掉噪点层；frost / ink 本来就不叠噪点', () => {
  ok(!buildMenuCss(aurora({ noise: false })).css.includes('::after{content'));
  for (const mode of ['frost', 'ink']) {
    ok(!buildMenuCss(site({ background: mode })).css.includes('::after{content:""'),
      `${mode} 已经有模糊在打散色带了，再叠一层纯属浪费合成`);
  }
});

// ------------------------------------------------- 3. 不许碰错峰入场动画
test('menu: 绝不覆盖导航链接的 opacity（那是逐条错峰入场的动画值）', () => {
  const r = buildMenuCss(aurora());
  const rules = r.css.split('\n').filter((s) => /\ba\{/.test(s));
  for (const rule of rules) {
    ok(!/[^-]opacity:/.test(rule), `动了链接的 opacity：${rule}`);
  }
  // 社交行的 opacity-61 是静态类，可以安全提亮
  ok(r.css.includes('a.opacity-61{opacity:.74}'), r.css);
});

// ---------------------------------------------------------------- 4. 校验
test('menu: 未知预设名报错并列出可选值', () => {
  const r = buildMenuCss(site({ background: '毛玻璃' }));
  ok(/未知取值/.test(r.errors[0]), r.errors[0]);
  for (const m of MENU_MODES) ok(r.errors[0].includes(m), `没列出 ${m}`);
  eq(r.css, '');
});

test('menu: colors / glow 数量或格式不对都要报错', () => {
  ok(/colors/.test(buildMenuCss(aurora({ colors: ['#000000'] })).errors.join('\n')));
  ok(/glow/.test(buildMenuCss(aurora({ glow: [] })).errors.join('\n')));
  const bad = buildMenuCss(aurora({ colors: ['#000', 'blue', '#ffffff'] }));
  ok(/#RRGGBB/.test(bad.errors.join('\n')), bad.errors.join('\n'));
  // ink 根本不读 colors / glow，配错了也不该拦着它
  eq(buildMenuCss(site({ background: 'ink', colors: ['#000'], glow: [] })).errors, []);
});

test('menu: 配色太浅只告警不拦截（审美判断，不是正确性问题）', () => {
  const r = buildMenuCss(aurora({ colors: ['#ffffff', '#eeeeee', '#dddddd'] }));
  eq(r.errors, [], '不该拦截');
  ok(/WCAG AA/.test(r.warnings.join('\n')), r.warnings.join('\n'));
  ok(r.contrast < 4.5);
});

test('menu: 对比度取三色里最亮的那个算（最坏情况）', () => {
  const colors = ['#00276e', '#7fa8ff', '#062969'];
  eq(worstBackdrop('aurora', colors), '#7fa8ff');
  // ink 的最坏情况是最透的那一段（顶部 90%）压在纯白场景上
  eq(worstBackdrop('ink', colors, '#0c0c0e'), over('#0c0c0e', '#ffffff', INK_STOPS[0]));
});

// -------------------------------------------------------------- 5. ink 预设
test('menu: 默认就是 ink，墨底 + 磨砂 + 不支持磨砂时的实底兜底', () => {
  const r = buildMenuCss(site({}));
  eq(r.errors, []);
  eq(r.warnings, []);
  eq(r.mode, 'ink');
  ok(r.css.includes(`${SEL}{isolation:isolate`), r.css.slice(0, 120));
  ok(/background-image:linear-gradient\(180deg,rgba\(12,12,14,\.9\) 0%/.test(r.css), r.css);
  ok(r.css.includes(`${SEL}.opacity-100{-webkit-backdrop-filter:blur(26px)`), r.css);
  // 不支持 backdrop-filter 就必须有实底，否则白字直接压在 3D 场景上
  const i = r.css.indexOf('@supports not ((-webkit-backdrop-filter');
  ok(i !== -1, '缺 backdrop-filter 的兜底');
  ok(r.css.slice(i, i + 200).includes('background-color:#0c0c0e'), r.css.slice(i, i + 200));
  // aurora 那套深蓝一个都不该出现
  for (const c of ['#00276e', '#143a8a', '#062969', '#4edbef', '#88aeff', '#6248a4']) {
    ok(!r.css.includes(c), `ink 的 CSS 里不该出现 aurora 的 ${c}`);
  }
});

test('menu: ink 把导航改成通栏索引表，序号用 CSS 计数器而不是写死 01…04', () => {
  const r = buildMenuCss(site({}));
  ok(r.css.includes(`${NAV}{gap:0;align-self:stretch;align-items:stretch;counter-reset:ns-menu}`),
    r.css);
  ok(/>a\{[^}]*counter-increment:ns-menu/.test(r.css), '链接没自增计数器');
  ok(r.css.includes('content:counter(ns-menu,decimal-leading-zero)'), '序号不是计数器生成的');
  // 写死序号就和条目数绑死了，加一条导航序号就断
  for (const n of ['"01"', '"02"', '"03"', '"04"']) {
    ok(!r.css.includes(n), `序号被写死成 ${n}`);
  }
  // 发丝线通栏、文字受量度约束：两者用的不是同一个盒子边界
  ok(/>a\{[^}]*padding:clamp\(20px,3\.4vh,34px\) var\(--ns-menu-gut\)/.test(r.css), r.css);
  ok(r.css.includes(`--ns-menu-gut:max(20px,(100% - ${INK_MEASURE}px)/2)`), r.css);
  // 社交行跟导航共用同一条边界
  ok(/nth-child\(3\)\{[^}]*padding-left:var\(--ns-menu-gut\)/.test(r.css), r.css);
});

test('menu: ink 的抬起动画复用上游的 delay-*，不自己写一套 transition-delay', () => {
  const r = buildMenuCss(site({}));
  ok(r.css.includes(`transform:translateY(${INK_LIFT}px)`), '缺起始位移');
  ok(r.css.includes(`${SEL}.opacity-100>div:nth-child(2)>a{transform:none}`), '打开时没归位');
  ok(!/transition-delay/.test(r.css),
    '上游已经给这四条链接挂了 delay-200/250/300/350，自己再写一套只会打架');
  ok(/@media\(prefers-reduced-motion:reduce\)\{[^}]*transform:none/.test(r.css),
    '开了「减少动态效果」还在位移');
  // motion:false 直接不出位移
  const still = buildMenuCss(site({ motion: false }));
  ok(!still.css.includes('translateY'), still.css);
});

test('menu: ink 的墨色压不住白字就报错，不是告警', () => {
  const r = buildMenuCss(site({ ink: '#6a6a6a' }));
  eq(r.warnings, []);
  eq(r.errors.length, 1, JSON.stringify(r.errors));
  ok(r.errors[0].includes(`${INK_MIN}:1`), r.errors[0]);
  // 格式写错也要报
  ok(/#RRGGBB/.test(buildMenuCss(site({ ink: 'black' })).errors.join('\n')));
  // index 不是布尔值要报
  ok(/index/.test(buildMenuCss(site({ index: 'yes' })).errors.join('\n')));
});

test('menu: index:false 只去掉序号，索引表的版式还在', () => {
  const r = buildMenuCss(site({ index: false }));
  eq(r.errors, []);
  ok(!r.css.includes('counter'), '序号没去干净');
  ok(/>a\{[^}]*border-top:1px solid/.test(r.css), '发丝线不该跟着一起没了');
});

test('menu: 补上 :focus-visible —— 上游整站一次都没写过', () => {
  for (const f of [SRC.html, SRC.css]) {
    eq(fs.readFileSync(f, 'utf8').split('focus-visible').length - 1, 0,
      `${f} 里已经有 focus-visible 了，这条补丁要重新评估`);
  }
  const r = buildMenuCss(site({}));
  ok(r.css.includes(`${SEL} a:focus-visible{outline:2px solid rgba(255,255,255,.7)`), r.css);
  // ink 的序号是右对齐的，描边要往里收，否则会顶到发丝线外面
  ok(r.css.includes(`${LINK}:focus-visible{outline-offset:-6px`), r.css);
  // 别的预设只有那一条通用的
  eq(buildMenuCss(aurora()).css.split('focus-visible').length - 1, 1);
});
