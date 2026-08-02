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
  buildMenuCss, worstBackdrop, frostBlooms, MENU_MODES, MENU_DEFAULTS,
  FROST_ALPHA, FROST_GRID, FROST_WEIGHTS,
  INK_STOPS, INK_LIFT, INK_MEASURE,
} = require('../menu');
const {
  MENU_MIN, BLOOM_SIZE, worstCaseContrast, grainDataUri,
} = require('../grain');
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

test('menu: frost 不用 backdrop-filter —— 彩晕铺满后模糊层做的功一分都看不见', () => {
  const r = buildMenuCss(site({ background: 'frost' }));
  ok(!r.css.includes('backdrop-filter'),
    '彩晕权重 1.0 + SIZE 1.35 已经把面板铺满，背后那 10% 透光量视觉上全被盖掉。'
    + '再挂 blur 等于要求浏览器每帧重采样一遍背后的 3D 画布，纯烧低端安卓的 GPU。');
  // 既然没有磨砂，也就不需要「不支持磨砂」的回退分支了
  ok(!r.css.includes('@supports not ((-webkit-backdrop-filter'),
    '没有 backdrop-filter 就不该还留着它的回退分支');
  // ink 那边层次结构不同，磨砂仍然保留
  ok(buildMenuCss(site({ background: 'ink' })).css.includes('-webkit-backdrop-filter:blur('),
    'ink 的磨砂被误删了');
});

test('menu: frost 的底色不透明度撑得住白字 —— .62 就压不住 AAA 线', () => {
  // 只看底色这一层（彩晕之前）：它决定了整个对比度预算的上限。
  const bare = (alpha) => worstCaseContrast({
    base: MENU_DEFAULTS.ink, alpha, backdrop: '#ffffff',
  }).ratio;
  ok(bare(FROST_ALPHA) >= 15, `FROST_ALPHA=${FROST_ALPHA} 的裸底只有 ${bare(FROST_ALPHA)}:1`);
  ok(bare(0.62) < MENU_MIN, '如果 .62 也能过，说明 FROST_ALPHA 取保守了，可以调回去');
});

test('menu: frost 四个晕色都取在各自色相的天花板附近，权重不再打折', () => {
  // 权重打折 = 把已经取在天花板上的颜色往底色方向稀释，白丢彩度。
  eq(FROST_WEIGHTS, [1, 1, 1, 1]);
  const r = buildMenuCss(site({ background: 'frost' }));
  eq(r.errors, []);
  // 天花板的定义就是「再彩一点就跌破 7:1」。所以现在的成绩应该紧贴门槛，
  // 而不是富余一大截 —— 富余说明还有彩度没花出去。
  ok(r.contrast >= MENU_MIN, `只有 ${r.contrast}:1`);
  ok(r.contrast < MENU_MIN + 1.5,
    `${r.contrast}:1 离 ${MENU_MIN}:1 还差 ${(r.contrast - MENU_MIN).toFixed(1)} 档，`
    + '说明晕色还能再彩一点。');
  // 四团晕都真的画出来了，而且用的是配置里的颜色
  for (const c of MENU_DEFAULTS.bloom) {
    ok(r.css.includes(`radial-gradient(${BLOOM_SIZE * 100}% ${BLOOM_SIZE * 100}% at`),
      '彩晕尺寸没跟着 BLOOM_SIZE 走');
    const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    ok(r.css.includes(`rgba(${rr},${gg},${bb},1)`), `${c} 没进 CSS：${r.css.slice(0, 200)}`);
  }
});

test('menu: frost 的网格是暗线 —— 白线要占亮度预算却几乎看不见', () => {
  eq(FROST_GRID.color, '#000000');
  const r = buildMenuCss(site({ background: 'frost' }));
  ok(r.css.includes('linear-gradient(to right,rgba(0,0,0,.14) 0 1px'), r.css.slice(0, 400));
  // 关键性质：暗网格完全不占亮度预算。白字最坏点落在线与线之间（那里没有
  // 网格），所以加不加暗网格，最坏对比度一模一样。
  const args = {
    base: MENU_DEFAULTS.ink,
    alpha: FROST_ALPHA,
    blooms: frostBlooms(MENU_DEFAULTS.bloom),
    grain: 'dark',
    backdrop: '#ffffff',
  };
  const withGrid = worstCaseContrast(Object.assign({ grid: FROST_GRID }, args)).ratio;
  const without = worstCaseContrast(args).ratio;
  eq(withGrid, without,
    '暗网格改变了最坏对比度 —— 说明 worstCaseContrast 又只算线上不算线间了');
  // 反过来，白网格必须是要花钱的，否则这个模型是假的
  const white = worstCaseContrast(Object.assign({}, args, {
    grid: { color: '#ffffff', alpha: FROST_GRID.alpha },
  })).ratio;
  ok(white < without, `白网格没有降低对比度（${white} vs ${without}），模型不对`);
});

test('menu: grid:false 去掉网格，彩晕和颗粒都还在', () => {
  const r = buildMenuCss(site({ background: 'frost', grid: false }));
  eq(r.errors, []);
  ok(!r.css.includes('linear-gradient(to right'), '网格没去干净');
  ok(r.css.includes('radial-gradient('), '彩晕跟着一起没了');
  ok(r.css.includes('::after{content:""'), '颗粒跟着一起没了');
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
  // aurora / gradient 用的是打散色带的细噪点，frost 用的是标定过的胶片颗粒，
  // 两者是不同的发生器，但对 data URI 的要求完全一样。
  for (const css of [r.css, buildMenuCss(site({ background: 'frost' })).css]) {
    // SVG 通篇用单引号，所以 url() 必须用双引号包住 —— 用单引号的话
    // SVG 里第一个属性值就会把 url() 提前闭合。这条正则本身就是断言：
    // 只有双引号包住时它才匹配得到完整的 URI（URI 内部有 url(%23n) 这种
    // 括号，不带引号的写法在这里就会被截断）。
    const m = /url\("(data:image\/svg\+xml,[^"]*)"\)/.exec(css);
    ok(m, `url() 没用双引号包 data URI：${/url\([^\n]{0,60}/.exec(css)}`);
    ok(m[1].startsWith('data:image/svg+xml,%3Csvg'), m[1].slice(0, 40));
    ok(m[1].includes('feTurbulence'), '噪点应当用 feTurbulence 现生成');
    ok(!/%(?![0-9A-Fa-f]{2})/.test(m[1]), '有没转义干净的裸 % —— 会把 data URI 截断');
  }
  // 颗粒发生器本身也走同一套编码
  ok(grainDataUri('dark').startsWith('data:image/svg+xml,%3Csvg'));
  ok(!/%(?![0-9A-Fa-f]{2})/.test(grainDataUri('light')));
});

test('menu: 噪点层用 isolation + z-index:-1 垫在内容底下，不吃点击', () => {
  const r = buildMenuCss(aurora());
  ok(r.css.includes('isolation:isolate'), '没有 isolation，overlay 会串到整页');
  ok(/::after\{[^}]*z-index:-1/.test(r.css), '噪点层没垫到底下');
  ok(/::after\{[^}]*pointer-events:none/.test(r.css), '噪点层会挡住点击');
});

test('menu: noise:false 去掉颗粒层；frost 叠、ink 不叠', () => {
  ok(!buildMenuCss(aurora({ noise: false })).css.includes('::after{content'));
  ok(!buildMenuCss(site({ background: 'frost', noise: false })).css
    .includes('::after{content:""'), 'frost 的 noise:false 没生效');
  // frost 的颗粒是标定过的胶片颗粒，是材质的一部分，不是「打散色带」的补丁。
  ok(buildMenuCss(site({ background: 'frost' })).css.includes('::after{content:""'),
    'frost 缺颗粒层');
  // ink 是一块平的墨板，没有色带要打散，叠颗粒只会让它显脏。
  ok(!buildMenuCss(site({ background: 'ink' })).css.includes('::after{content:""'),
    'ink 不该叠颗粒');
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

// ------------------------------------------------------------ 5. frost 预设
test('menu: 默认就是 frost，底色 + 网格 + 四团彩晕 + 颗粒四层叠出来', () => {
  const r = buildMenuCss(site({}));
  eq(r.errors, []);
  eq(r.warnings, []);
  eq(r.mode, 'frost');
  ok(r.css.includes(`${SEL}{isolation:isolate`), r.css.slice(0, 120));
  ok(r.css.includes('background-color:rgba(12,12,14,.9)'), r.css.slice(0, 300));
  // 图层顺序：CSS 里先列的画在上面 → 网格压在彩晕上面
  const first = r.css.indexOf('linear-gradient(to right');
  const bloom = r.css.indexOf('radial-gradient(');
  ok(first !== -1 && bloom !== -1 && first < bloom, '网格应该压在彩晕上面');
  // 颗粒层
  ok(r.css.includes('::after{content:""'), '缺颗粒层');
  // aurora 那套深蓝一个都不该出现
  for (const c of ['#00276e', '#143a8a', '#062969', '#4edbef', '#88aeff', '#6248a4']) {
    ok(!r.css.includes(c), `frost 的 CSS 里不该出现 aurora 的 ${c}`);
  }
});

test('menu: frost 的导航是左对齐索引列，序号做成标签上方的小上标', () => {
  const r = buildMenuCss(site({}));
  // 真正垂直居中：顶部空 div 补出和底部等高的占位，导航吃掉两边 auto margin
  ok(r.css.includes(`${SEL}>div:first-child{flex:none;height:var(--ns-menu-foot)}`), r.css);
  ok(/nth-child\(2\)\{margin-block:auto;align-items:flex-start/.test(r.css), r.css);
  // 序号在 ::before（标签正上方），不是 ink 那种右对齐的 ::after
  ok(/>a::before\{content:counter\(ns-menu,decimal-leading-zero\)/.test(r.css),
    '序号不在 ::before 上 —— frost 的序号是小上标，不是右边缘的行号');
  ok(!/>a::after\{content:counter/.test(r.css), 'ink 那套右对齐序号漏进来了');
  ok(/>a\{[^}]*counter-increment:ns-menu/.test(r.css), '链接没自增计数器');
  // 写死序号就和条目数绑死了，加一条导航序号就断
  for (const n of ['"01"', '"02"', '"03"', '"04"']) {
    ok(!r.css.includes(n), `序号被写死成 ${n}`);
  }
  // 一条通栏线都不许有 —— 那是 ink 的语言，会把导航做成系统设置列表
  ok(!/border-top:1px solid/.test(r.css), 'frost 不该有通栏发丝线');
  // 下划线只贴着文字本身，随打开动画从左往右画出来
  ok(/>a\{[^}]*background-size:0 1px/.test(r.css), '下划线的起始宽度不是 0');
  ok(r.css.includes(`${SEL}.opacity-100>div:nth-child(2)>a{background-size:100% 1px}`), r.css);
  // 导航和社交行共用同一条量度边界
  ok(r.css.includes('--ns-menu-gut:max(24px,(100% - 560px)/2)'), r.css);
  ok(/nth-child\(3\)\{[^}]*padding-left:var\(--ns-menu-gut\)/.test(r.css), r.css);
});

test('menu: frost 的晕色压不住白字就报错，不是告警', () => {
  // 把四团晕全换成亮色 → 亮度预算爆掉
  const r = buildMenuCss(site({ bloom: ['#ffd0a0', '#ffb0c0', '#c0b0ff', '#a0e0ff'] }));
  eq(r.errors.length, 1, JSON.stringify(r.errors));
  ok(r.errors[0].includes(`${MENU_MIN}:1`), r.errors[0]);
  // 底一亮，74% 白的社交行会跟着掉下 3:1，那条告警是连带的，不是漏报
  ok(r.warnings.every((w) => /社交链接/.test(w)), r.warnings.join('\n'));
  // 格式写错也要报
  ok(/#RRGGBB/.test(buildMenuCss(site({ bloom: ['red', '#000', '#fff', '#000000'] }))
    .errors.join('\n')));
  ok(/#RRGGBB/.test(buildMenuCss(site({ ink: 'black' })).errors.join('\n')));
  // index 不是布尔值要报
  ok(/index/.test(buildMenuCss(site({ index: 'yes' })).errors.join('\n')));
});

test('menu: index:false 只去掉序号，索引列的版式还在', () => {
  const r = buildMenuCss(site({ index: false }));
  eq(r.errors, []);
  ok(!r.css.includes('counter'), '序号没去干净');
  ok(/>a\{[^}]*background-size:0 1px/.test(r.css), '下划线不该跟着一起没了');
});

// -------------------------------------------------------------- 6. ink 预设
const ink = (extra) => site(Object.assign({ background: 'ink' }, extra || {}));

test('menu: ink 仍然可用，墨底 + 磨砂 + 不支持磨砂时的实底兜底', () => {
  const r = buildMenuCss(ink());
  eq(r.errors, []);
  eq(r.warnings, []);
  eq(r.mode, 'ink');
  ok(/background-image:linear-gradient\(180deg,rgba\(12,12,14,\.9\) 0%/.test(r.css), r.css);
  ok(r.css.includes(`${SEL}.opacity-100{-webkit-backdrop-filter:blur(26px)`), r.css);
  // 不支持 backdrop-filter 就必须有实底，否则白字直接压在 3D 场景上
  const i = r.css.indexOf('@supports not ((-webkit-backdrop-filter');
  ok(i !== -1, '缺 backdrop-filter 的兜底');
  ok(r.css.slice(i, i + 200).includes('background-color:#0c0c0e'), r.css.slice(i, i + 200));
});

test('menu: ink 把导航改成通栏索引表，序号用 CSS 计数器而不是写死 01…04', () => {
  const r = buildMenuCss(ink());
  ok(r.css.includes(`${NAV}{gap:0;align-self:stretch;align-items:stretch;counter-reset:ns-menu}`),
    r.css);
  ok(/>a\{[^}]*counter-increment:ns-menu/.test(r.css), '链接没自增计数器');
  ok(r.css.includes('content:counter(ns-menu,decimal-leading-zero)'), '序号不是计数器生成的');
  // 发丝线通栏、文字受量度约束：两者用的不是同一个盒子边界
  ok(/>a\{[^}]*padding:clamp\(20px,3\.4vh,34px\) var\(--ns-menu-gut\)/.test(r.css), r.css);
  ok(r.css.includes(`--ns-menu-gut:max(20px,(100% - ${INK_MEASURE}px)/2)`), r.css);
});

test('menu: ink 的抬起动画复用上游的 delay-*，不自己写一套 transition-delay', () => {
  const r = buildMenuCss(ink());
  ok(r.css.includes(`transform:translateY(${INK_LIFT}px)`), '缺起始位移');
  ok(r.css.includes(`${SEL}.opacity-100>div:nth-child(2)>a{transform:none}`), '打开时没归位');
  ok(!/transition-delay/.test(r.css),
    '上游已经给这四条链接挂了 delay-200/250/300/350，自己再写一套只会打架');
  ok(/@media\(prefers-reduced-motion:reduce\)\{[^}]*transform:none/.test(r.css),
    '开了「减少动态效果」还在位移');
  // motion:false 直接不出位移
  ok(!buildMenuCss(ink({ motion: false })).css.includes('translateY'));
});

test('menu: ink 的墨色压不住白字就报错，不是告警', () => {
  const r = buildMenuCss(ink({ ink: '#6a6a6a' }));
  eq(r.warnings, []);
  eq(r.errors.length, 1, JSON.stringify(r.errors));
  ok(r.errors[0].includes(`${MENU_MIN}:1`), r.errors[0]);
});

test('menu: 补上 :focus-visible —— 上游整站一次都没写过', () => {
  for (const f of [SRC.html, SRC.css]) {
    eq(fs.readFileSync(f, 'utf8').split('focus-visible').length - 1, 0,
      `${f} 里已经有 focus-visible 了，这条补丁要重新评估`);
  }
  const r = buildMenuCss(site({}));
  ok(r.css.includes(`${SEL} a:focus-visible{outline:2px solid rgba(255,255,255,.7)`), r.css);
  // frost 的链接是行内块，描边贴着文字走就行
  ok(r.css.includes(`${LINK}:focus-visible{outline-offset:2px`), r.css);
  // ink 的序号是右对齐的，描边要往里收，否则会顶到发丝线外面
  ok(buildMenuCss(ink()).css.includes(`${LINK}:focus-visible{outline-offset:-6px`));
  // 别的预设只有那一条通用的
  eq(buildMenuCss(aurora()).css.split('focus-visible').length - 1, 1);
});
