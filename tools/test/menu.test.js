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
} = require('../menu');
const { contrast, over } = require('../color');

setFile('menu');

const site = (menu) => ({ menu: Object.assign({}, MENU_DEFAULTS, menu || {}) });

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
test('menu: 噪点是内联 SVG data URI，不新增文件请求', () => {
  const r = buildMenuCss(site({}));
  ok(r.css.includes('::after{content:""'), '缺噪点层');
  ok(NOISE_URI.startsWith('url("data:image/svg+xml'), NOISE_URI.slice(0, 40));
  ok(NOISE_URI.includes('feTurbulence'), '噪点应当用 feTurbulence 现生成');
});

test('menu: 噪点层用 isolation + z-index:-1 垫在内容底下，不吃点击', () => {
  const r = buildMenuCss(site({}));
  ok(r.css.includes('isolation:isolate'), '没有 isolation，overlay 会串到整页');
  ok(/::after\{[^}]*z-index:-1/.test(r.css), '噪点层没垫到底下');
  ok(/::after\{[^}]*pointer-events:none/.test(r.css), '噪点层会挡住点击');
});

test('menu: noise:false 去掉噪点层；frost 本来就不叠噪点', () => {
  ok(!buildMenuCss(site({ noise: false })).css.includes('::after{content'));
  ok(!buildMenuCss(site({ background: 'frost' })).css.includes('::after{content'),
    'frost 已经有模糊在打散色带了，再叠一层纯属浪费合成');
});

// ------------------------------------------------- 3. 不许碰错峰入场动画
test('menu: 绝不覆盖导航链接的 opacity（那是逐条错峰入场的动画值）', () => {
  const r = buildMenuCss(site({}));
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
  ok(/colors/.test(buildMenuCss(site({ colors: ['#000000'] })).errors.join('\n')));
  ok(/glow/.test(buildMenuCss(site({ glow: [] })).errors.join('\n')));
  const bad = buildMenuCss(site({ colors: ['#000', 'blue', '#ffffff'] }));
  ok(/#RRGGBB/.test(bad.errors.join('\n')), bad.errors.join('\n'));
});

test('menu: 配色太浅只告警不拦截（审美判断，不是正确性问题）', () => {
  const r = buildMenuCss(site({ colors: ['#ffffff', '#eeeeee', '#dddddd'] }));
  eq(r.errors, [], '不该拦截');
  ok(/WCAG AA/.test(r.warnings.join('\n')), r.warnings.join('\n'));
  ok(r.contrast < 4.5);
});

test('menu: 对比度取三色里最亮的那个算（最坏情况）', () => {
  const colors = ['#00276e', '#7fa8ff', '#062969'];
  eq(worstBackdrop('aurora', colors), '#7fa8ff');
});
