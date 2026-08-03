/**
 * paper 菜单预设的测试。
 *
 * 单独开一个文件而不是塞进 menu.test.js：那份文件通篇的前提是「文字是上游
 * 写死的白色，底必须够深」，paper 把这个前提整个掀了。两套断言放一起会互相
 * 干扰读者的理解，也容易在后面改动时被误改。
 */
const { test, eq, ok, setFile } = require('./harness');
const {
  buildMenuCss, paperWorst, solveInk, MENU_DEFAULTS, MENU_MODES, MENU_MIN,
  PAPER_WASH, PAPER_GRID, PAPER_MEASURE, PAPER_SMALL_MIN,
} = require('../menu');
const { contrast, over, rgba } = require('../color');
const { grainLift } = require('../grain');

setFile(__filename);

/** 只给 menu 段，其余走默认。 */
const site = (menu) => ({ menu: Object.assign({}, MENU_DEFAULTS, { background: 'paper' }, menu || {}) });
const base = buildMenuCss(site());

/** 抓出某条选择器的声明块（选择器要逐字给，测试就是在钉这些字面量）。 */
function block(css, sel) {
  const i = css.indexOf(`${sel}{`);
  if (i < 0) return null;
  const j = css.indexOf('}', i);
  return css.slice(i + sel.length + 1, j);
}

const SEL = '.mobile-menu.mobile-menu';
const NAV = `${SEL}>div:nth-child(2)`;
const LINK = `${NAV}>a`;
const SOCIAL = `${SEL}>div:nth-child(3)`;

test('menu/paper: paper 在可选预设里，而且是 config 的默认选择', () => {
  ok(MENU_MODES.has('paper'), 'MENU_MODES 里没有 paper');
  eq(base.mode, 'paper');
  eq(base.errors.length, 0, JSON.stringify(base.errors));
  eq(base.warnings.length, 0, JSON.stringify(base.warnings));
  // 仓库里真实生效的那份 config 必须已经切过去了 —— 不然这套 CSS 写了也白写。
  // eslint-disable-next-line global-require
  eq(require('../../config/site').menu.background, 'paper');
});

test('menu/paper: 拆掉上游写死的 text-white，这是整个预设的支点', () => {
  // 特异度 (0,2,1) 打得过 Tailwind 的 .text-white (0,1,0)，不需要 !important。
  eq(block(base.css, `${SEL} a`), `color:${MENU_DEFAULTS.paperInk}`);
  ok(!base.css.includes('!important'), 'paper 不该需要 !important');
});

test('menu/paper: 底是不透明纸 + 四角淡彩 + 细网格，顺序和 frost 一致', () => {
  const b = block(base.css, SEL);
  ok(b.includes(`background-color:${MENU_DEFAULTS.paper}`), '纸色没铺上');
  // 不透明：paper 的底不该出现 rgba() 形式的底色（彩晕自己是 rgba，那是另一层）。
  ok(!b.includes('background-color:rgba'), 'paper 的底色不该是半透明的');
  // 四个 wash 各一层 radial-gradient，中心权重就是 PAPER_WASH。
  for (const c of MENU_DEFAULTS.wash) {
    ok(b.includes(rgba(c, PAPER_WASH)), `淡彩 ${c} 没按 ${PAPER_WASH} 的权重进背景层`);
  }
  eq((b.match(/radial-gradient/g) || []).length, 4, '四角淡彩数量不对');
  // 网格是两条 1px 线，步长跟着 PAPER_GRID 走。
  eq((b.match(/linear-gradient/g) || []).length, 2, '网格线数量不对');
  ok(b.includes(`${PAPER_GRID.step}px ${PAPER_GRID.step}px`), '网格步长不对');
  // 量度留白：导航和社交行共用同一个变量，两处边界才对得齐。
  ok(b.includes(`(100% - ${PAPER_MEASURE}px)/2`), '量度宽度不对');
});

test('menu/paper: 浅底要用 light 那档颗粒，不能拿 dark 的压在纸上', () => {
  const after = block(base.css, `${SEL}::after`);
  ok(after, '没有颗粒层');
  // light 档的 alpha 是 .34，dark 档是 .179 —— 用 opacity 值区分是哪一档。
  ok(after.includes('opacity:.34'), `颗粒不是 light 档：${after.slice(0, 120)}`);
  // 关掉 noise 就整层不要。
  const off = buildMenuCss(site({ noise: false }));
  ok(!off.css.includes(`${SEL}::after`), 'noise:false 还留着颗粒层');
  eq(off.errors.length, 0, JSON.stringify(off.errors));
});

test('menu/paper: 导航排成「序号 + 标签」两列，基线对齐', () => {
  const b = block(base.css, LINK);
  ok(b.includes('display:grid'), '链接不是 grid');
  ok(b.includes('grid-template-columns:auto 1fr'), '不是两列');
  ok(b.includes('align-items:baseline'), '两列没按基线对齐');
  ok(b.includes('counter-increment:ns-menu'), '序号计数器没递增');
  ok(block(base.css, NAV).includes('counter-reset:ns-menu'), '序号计数器没复位');
  // 序号走 CSS 计数器，条目数变了自己跟着变，不写死 01…04。
  const before = block(base.css, `${LINK}::before`);
  ok(before.includes('counter(ns-menu,decimal-leading-zero)'), '序号不是计数器生成的');
  ok(before.includes('tabular-nums'), '序号没等宽，四条标签的左缘会参差');
  ok(!base.css.includes('content:"01"'), '不该写死序号');
});

test('menu/paper: index:false 只去掉序号，版式回到单列但不塌', () => {
  const off = buildMenuCss(site({ index: false }));
  eq(off.errors.length, 0, JSON.stringify(off.errors));
  ok(!off.css.includes('::before'), '还留着序号');
  ok(!off.css.includes('counter-reset'), '还留着计数器');
  ok(block(off.css, LINK).includes('display:block'), '没退回单列');
  // 量度留白和居中骨架是版式，不是序号的附属品，得留着。
  ok(off.css.includes('--ns-menu-gut'), '量度留白没了');
  ok(off.css.includes('>div:first-child{flex:none'), '居中骨架没了');
});

test('menu/paper: 下划线只给当前页那一条，不再是四条长短不一的黑杠', () => {
  ok(base.css.includes(`${LINK}.router-link-active{text-decoration:underline`),
    '当前页没有下划线');
  // frost 那套用 background-size 从 0 拉到满宽，四条全画。paper 不能有。
  ok(!/background-size:0 1px/.test(base.css), '还在用 frost 那套四条下划线');
  ok(!/background-size:100% 1px/.test(base.css), '还在用 frost 那套四条下划线');
});

test('menu/paper: 入场动画复用上游的 delay-*，并且尊重「减少动态效果」', () => {
  ok(block(base.css, LINK).includes('transform:translateY(12px)'), '没有入场位移');
  ok(base.css.includes(`${SEL}.opacity-100>div:nth-child(2)>a{transform:none}`), '打开时没归位');
  ok(/@media\(prefers-reduced-motion:reduce\)\{[^}]*transform:none;transition:none/.test(base.css),
    '没给 prefers-reduced-motion 兜底');
  // 不许自己写一套 transition-delay 去和上游的 delay-200/250/300/350 打架。
  ok(!base.css.includes('transition-delay'), '自己写了 transition-delay');
  // motion:false 时连位移带动画一起不要。
  const still = buildMenuCss(site({ motion: false }));
  ok(!still.css.includes('translateY'), 'motion:false 还留着位移');
  eq(still.errors.length, 0, JSON.stringify(still.errors));
});

test('menu/paper: 社交行改三列 grid，中间那条真的居中', () => {
  const b = block(base.css, SOCIAL);
  ok(b.includes('grid-template-columns:1fr auto 1fr'), '不是 1fr auto 1fr');
  ok(base.css.includes(`${SOCIAL}>a:nth-child(2){justify-self:center}`), '中间那条没居中');
  ok(base.css.includes(`${SOCIAL}>a:nth-child(1){justify-self:start}`), '左边那条没贴边');
  ok(base.css.includes(`${SOCIAL}>a:nth-child(3){justify-self:end}`), '右边那条没贴边');
  // 左右边界要和导航文字共用同一个量度留白。
  ok(b.includes('padding-left:var(--ns-menu-gut)'), '社交行没对齐导航');
  // 半透明小字压在颗粒层上会起毛边，换成解出来的实色。
  const faint = solveInk(MENU_DEFAULTS.paperInk, MENU_DEFAULTS.paper, PAPER_SMALL_MIN);
  ok(base.css.includes(`${SOCIAL}>a.opacity-61{opacity:1;color:${faint}}`), '社交行没换成实色');
  // 那条给暗底用的 74% 白不该出现在 paper 里。
  ok(!/a\.opacity-61\{opacity:\.74\}/.test(base.css), 'paper 还输出了暗底那条 opacity 规则');
});

test('menu/paper: 白 logo 和白关闭图标要在纸上反色', () => {
  // 关闭图标不需要 :has() —— .close 本来就只在菜单打开时才可见。
  ok(base.css.includes('.mobile-menu-button .close img{filter:brightness(0)}'), '关闭图标没反色');
  // logo 的触发条件在兄弟节点上，只能靠 :has()，而且要包在 @supports 里。
  ok(/@supports selector\(:has\(\*\)\)\{/.test(base.css), ':has() 没做特性检测');
  ok(base.css.includes('header:has(.mobile-menu.opacity-100) .logo-wrapper img'), 'logo 没反色');
  ok(base.css.includes('header:has(.mobile-menu.opacity-100) .logo-wrapper-2 img'), '第二枚 logo 没反色');
  // 上游类名里写了 backdrop-blur-2xl，但产物里那条工具类没生成，显式补上。
  ok(base.css.includes('.mobile-menu-button{-webkit-backdrop-filter:blur(18px)'), '汉堡按钮没补磨砂');
});

test('menu/paper: 焦点圈跟着文字走，纸底上不能还是白的', () => {
  const b = block(base.css, `${SEL} a:focus-visible`);
  ok(b.includes('rgba(20,18,15,.7)'), `焦点圈不是墨色：${b}`);
  ok(!b.includes('rgba(255,255,255'), '焦点圈还是白的');
});

test('menu/paper: 最坏底色算的是「最暗那一点」，方向和 frost 相反', () => {
  const { paper, wash, paperInk } = MENU_DEFAULTS;
  const worst = paperWorst(paper, wash, true, true);
  // 最坏底一定比纸暗（深字压浅底，底越暗越危险）。
  ok(contrast('#000000', worst) < contrast('#000000', paper), '最坏底色不比纸暗');
  // 三样东西都要算进去：淡彩峰值、网格交叉点、颗粒偏暗那一侧。
  const washOnly = wash
    .map((c) => over(c, paper, PAPER_WASH))
    .reduce((a, c) => (contrast('#000000', c) < contrast('#000000', a) ? c : a));
  ok(contrast('#000000', worst) < contrast('#000000', washOnly), '网格和颗粒没算进最坏底');
  eq(worst, buildMenuCss(site()).backdrop, 'buildMenuCss 报的最坏底色和 paperWorst 不一致');
  // 关掉网格和颗粒，最坏底就该回到淡彩峰值。
  eq(paperWorst(paper, wash, false, false), washOnly);
  // 颗粒必须往暗的一侧取（k 为负），取反了就是白送一档对比度。
  ok(contrast('#000000', grainLift(washOnly, 'light', -2))
    < contrast('#000000', grainLift(washOnly, 'light', 2)), 'grainLift 的方向搞反了');
  // 默认这组的余量：11.1:1，离 7:1 的门还很远。
  ok(base.contrast >= MENU_MIN, `墨字对比度只有 ${base.contrast}:1`);
  ok(base.contrast > 10, `余量不该这么小：${base.contrast}:1`);
  eq(base.contrast, Math.round(contrast(paperInk, worst) * 10) / 10);
});

test('menu/paper: 淡彩太浓压不住墨字就报错，不是告警', () => {
  // 四个角全塞饱和深色，最坏底会掉到墨字读不出的地步。
  const bad = buildMenuCss(site({ wash: ['#3a2f00', '#2d0044', '#001a4d', '#00331f'] }));
  ok(bad.errors.some((e) => e.includes('paper')), JSON.stringify(bad.errors));
  ok(bad.errors.some((e) => e.includes(String(MENU_MIN))), '报错里没写清门槛');
  // 底暗到这个地步，社交行那条淡墨自然也跟着不合格 —— 它是告警，但主诊断
  // 必须是 error（配错自家预设 = 坏了，不是审美问题）。
  ok(bad.warnings.every((w) => w.includes('社交')), `混进了别的告警：${JSON.stringify(bad.warnings)}`);
});

test('menu/paper: paper / paperInk / wash 的格式错误一次报全', () => {
  const bad = buildMenuCss(site({ paper: 'ivory', paperInk: '#GGG', wash: ['#f6e6c1'] }));
  ok(bad.errors.some((e) => e.includes('menu.paper:')), '没报 paper');
  ok(bad.errors.some((e) => e.includes('menu.paperInk:')), '没报 paperInk');
  ok(bad.errors.some((e) => e.includes('menu.wash:')), '没报 wash');
  // 报错之后要全部回退到默认值，CSS 不能是空的或者带着坏值。
  ok(bad.css.includes(`background-color:${MENU_DEFAULTS.paper}`), '没回退到默认纸色');
  ok(!bad.css.includes('ivory') && !bad.css.includes('#GGG'), '坏值漏进了 CSS');
  // 不该顺带报一堆 paper 根本用不上的键。
  ok(!bad.errors.some((e) => e.includes('menu.colors') || e.includes('menu.glow')),
    `报了用不上的键：${JSON.stringify(bad.errors)}`);
  ok(!bad.errors.some((e) => e.includes('menu.bloom')), 'paper 不该校验 frost 的 bloom');
});

test('menu/paper: solveInk 给的是最淡的合格解，纸色变了它跟着变', () => {
  const { paper, paperInk } = MENU_DEFAULTS;
  const faint = solveInk(paperInk, paper, PAPER_SMALL_MIN);
  ok(contrast(faint, paper) >= PAPER_SMALL_MIN, '解出来的淡墨不达标');
  // 再淡一档就该跌破 —— 证明它是卡在线上的最淡解，不是随手挑的。
  for (let i = 20; i <= 100; i += 1) {
    const c = over(paperInk, paper, i / 100);
    if (contrast(c, paper) >= PAPER_SMALL_MIN) {
      eq(c, faint);
      ok(i === 20 || contrast(over(paperInk, paper, (i - 1) / 100), paper) < PAPER_SMALL_MIN,
        '不是最淡的合格解');
      break;
    }
  }
  // 换一张更暗的纸，淡墨必须跟着变（不是写死的常量）。
  ok(solveInk(paperInk, '#d8d2c6', PAPER_SMALL_MIN) !== faint, '淡墨没跟着纸色走');
});

test('menu/paper: frost 一个字节都没动，改回去还是原来那套', () => {
  const frost = buildMenuCss({ menu: Object.assign({}, MENU_DEFAULTS, { background: 'frost' }) });
  eq(frost.mode, 'frost');
  eq(frost.errors.length, 0, JSON.stringify(frost.errors));
  // frost 的招牌特征：半透明墨底 + 四条下划线动画 + 白色焦点圈。
  ok(frost.css.includes(`background-color:rgba(12,12,14,.9)`), 'frost 的底色变了');
  ok(frost.css.includes('background-size:0 1px'), 'frost 的下划线动画没了');
  ok(frost.css.includes('rgba(255,255,255,.7)'), 'frost 的焦点圈变色了');
  // 而 paper 那套东西一样都不该漏进 frost。
  ok(!frost.css.includes(':has('), 'frost 里混进了 :has()');
  ok(!frost.css.includes('.mobile-menu-button'), 'frost 里混进了汉堡按钮规则');
  ok(!frost.css.includes(`${SEL} a{color:`), 'frost 里混进了文字改色');
});
