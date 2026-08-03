'use strict';
/**
 * menu.js — 由 config/site.js 的 menu 段生成移动端菜单的背景样式与版式。
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
 * 颗粒层用 `::after` 绝对定位实现，但绝对定位元素默认画在普通流内容**之后**，
 * 会盖住导航文字；给它 `z-index:-1` 就落到「背景之上、内容之下」那一层。
 * 配合父元素 `isolation:isolate`，`mix-blend-mode` 只跟菜单自己的背景混合，
 * 不会去和后面的 3D 画布叠加。
 *
 * 默认预设 frost：这一版重做了什么
 * --------------------------------
 * 上一版默认的 ink 有四个具体毛病，都是看着截图逐条列的：
 *
 *   1. 它是一块**平的炭灰板** —— 不是黑、不是彩色、没有材质，读起来像
 *      "没做样式的深色 div"。
 *   2. `backdrop-filter: blur(26px)` **完全白费**：底色不透明度是 .90→.97，
 *      背后的 3D 场景一点都透不出来，花了 GPU 却什么都没换到。
 *   3. 四条**通栏满宽分隔线**把导航做成了"系统设置列表"，不是叙事页的导航。
 *   4. 序号 01–04 被推到**最右边缘**，标签在左，390px 宽的屏幕中间空出一大片
 *      死区。
 *
 * frost 换的不只是配色，是三件事：
 *
 *   材质  底色 + 四角彩晕 + 1px 细网格 + 颗粒，四层叠出"带颜色的磨砂玻璃"。
 *         这套材质抽在 tools/grain.js 里，和加载页共用同一份实现和同一组
 *         标定参数（参考 https://solitude.js.org/ 的首屏，标定过程见 grain.js）。
 *   版式  去掉所有通栏线；序号回到文字列里，做成标签正上方的小上标；导航块
 *         真正垂直居中；下划线只贴着文字本身，随打开动画从左往右画出来。
 *   预算  白字要 7:1，底色相对亮度就必须 Y ≤ 0.10；这条线以下每个色相能有
 *         多彩是硬性锁死的。四个晕色因此不是挑好看的，而是**逐色相解出
 *         天花板再取在天花板上**（见下面 FROST_WEIGHTS 上方的表）。
 *
 * 关于 backdrop-filter：frost 这一版**故意不用**。第 2 条毛病的正解不是
 * "把底色调透一点让模糊有事做"，而是承认在这个亮度预算下模糊根本没有可做
 * 的事 —— 彩晕铺满之后背后透出来的一点点全被盖掉了。所以直接删掉，省下
 * 低端 Android 每帧一次的全屏采样。ink 预设那边层次结构不同，保留。
 *
 * ink 保留为可选预设（`background: 'ink'`），没有删。
 *
 * 序号用 CSS 计数器（counter-reset / counter-increment / counter()）而不是
 * 写死 content:"01"…"04"，这样导航条目数变了序号自己跟着变，不用改样式。
 */
const {
  isHex6, rgba, fade, contrast, over,
} = require('./color');
const {
  MENU_MIN, grainRule, grainLift, meshLayers, gridLayers, worstCaseContrast, dec,
} = require('./grain');

/** 可选的背景预设。none = 什么都不注入（保持上游行为，纯逃生口）。 */
const MENU_MODES = new Set(['paper', 'frost', 'ink', 'aurora', 'gradient', 'none']);

const MENU_DEFAULTS = {
  background: 'frost',
  // frost / ink 用这两个
  ink: '#0c0c0e',
  index: true,
  // frost 独有。顺序 = 左上 / 右上 / 左下 / 右下，走一段蓝→紫→玫→红的色相旅程。
  bloom: ['#0055ba', '#8000e0', '#a9007b', '#b4003b'],
  grid: true,
  backdrop: '#ffffff',
  // paper 独有。纸色 / 墨色 / 四角淡彩（顺序同 bloom）。
  paper: '#f2ede3',
  paperInk: '#14120f',
  wash: ['#f6e6c1', '#edd1f5', '#c7d3f5', '#ccf5e2'],
  // aurora / gradient 用这两个
  colors: ['#00276e', '#143a8a', '#062969'],
  glow: ['#4edbef', '#88aeff', '#6248a4'],
  // 共用
  noise: true,
  motion: true,
};

// ---------------------------------------------------------------- frost 参数

/**
 * 底色不透明度。
 *
 * 菜单文字是上游写死的 text-white，改不了；背后是会动的 3D 场景，最坏情况
 * 接近纯白。所以底色必须自己把亮度压下去，不能指望背景帮忙。
 *
 * #0c0c0e 按 .90 压在纯白上得到 #242426（Y=0.018），白字 15.4:1 —— 这是
 * 还没叠彩晕的"预算上限"。剩下的 15.4 → 7 之间的空间全部交给彩晕去花。
 * 选 .90 而不是刚好够用的 .86：.86 的等效底色是 46 灰，整屏灰蒙蒙，彩晕浮
 * 在灰雾上显脏；.90 压到 36 灰，同样的晕色看着更纯。
 */
const FROST_ALPHA = 0.90;

/** 四角彩晕：位置固定（对应参考站 MeshGradient 的 shape="corners"）。 */
const FROST_CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];

/**
 * 权重全部拉满到 1.0。
 *
 * 上一版是 .38/.36/.42/.38，理由是"怕压过 7:1"。那是把预算算错了 —— 详见
 * 下面的色度天花板。晕色本身已经取在天花板上（叠完网格和颗粒刚好 7:1），
 * 再乘一个 <1 的权重只是把它往底色方向稀释，白白丢掉彩度。
 */
const FROST_WEIGHTS = [1, 1, 1, 1];

/**
 * 晕色是怎么选出来的：暗底上的色度天花板。
 *
 * 白字 7:1 → 底色相对亮度 Y ≤ 1.05/7 − 0.05 = 0.10。在这条线以下逐 OKLCh
 * 色相扫 sRGB 色域内的最大彩度（判据用的就是 worstCaseContrast 本身，
 * 网格 + 颗粒三态全算上），结果差了近 4 倍：
 *
 *   色相    0     20     40     60     80    100    120    140    160
 *   maxC  .199   .195   .151   .110   .095   .095   .108   .145   .102
 *   色相  180    200    220    240    260    280    300    320    340
 *   maxC  .083   .077   .083   .106   .192   .295   .267   .238   .213
 *
 * 结论：暗底上**紫红半圈能上色，青绿橙半圈上不了色**。上一版四色
 * #b8730a(h75) / #c33a22(h30) / #4a2ec4(h287) / #0d8598(h211) 里，琥珀和
 * 青正好压在天花板最低的两段（.095 / .077），红和紫又只用掉天花板的 42%
 * 和 41% —— 两头都没占着便宜，混出来的观感就是"泥"。
 *
 * 现在这四色全部取在各自色相的天花板上，并且只在紫红半圈里走：
 *
 *   左上 #0055ba  h≈258 蓝      右上 #8000e0  h≈300 紫
 *   左下 #a9007b  h≈345 玫      右下 #b4003b  h≈15  红
 *
 * 顺时针读下来是一段连续的色相旅程（蓝→紫→玫→红），四角互不打架；
 * 对角线上（蓝↔玫、紫↔红）的过渡色也都还在紫红区里，不会混出灰。
 */

/**
 * 细网格：给大面积彩晕一个尺度参照。step 对齐上游 nav 的 gap-64。
 *
 * 线色从白改成黑，这是实测逼出来的。白线要占亮度预算：叠上去之后为了守住
 * 7:1，彩晕得整体退一档，实测吃掉约 10% 的平均彩度；而在 alpha=.045 这种
 * 能守住对比度的强度下，白线在彩色背景上几乎看不见 —— 纯亏本。
 *
 * 黑线反过来：白字最坏点落在**线与线之间**（那里没有网格），所以暗网格
 * 完全不占亮度预算，最坏对比度和"根本没有网格"一模一样，可以放心加到
 * alpha=.14 这种真的看得见的强度。（worstCaseContrast 已改成线上/线间
 * 两态取更坏，不然会把暗网格的成绩算高。）
 *
 * .14 是目视挑的：.22 时格子重得像棋盘，.14 刚好是"知道有格子在但不抢戏"。
 */
const FROST_GRID = { color: '#000000', alpha: 0.14, step: 64 };

/** 序号（小上标）与文字下划线的白色不透明度。 */
const FROST_NUM = 0.46;
const FROST_RULE = [0.34, 0.08];

/** 文字量度上限（px）。平板通栏时不收着，文字会贴着左边跑一长条。 */
const MENU_MEASURE = 560;

// ---------------------------------------------------------------- paper 参数

/**
 * paper 预设：为什么它是现在的默认，以及它凭什么能用浅底。
 *
 * frost 的推导链是这样的：**上游把导航文字写死成 text-white → 底必须够暗
 * 才有 7:1 → 暗底上只有紫红半圈还剩得下彩度 → 四角只能取蓝 / 紫 / 玫 / 红**。
 * 每一步都对，但链条的第一环是假的 —— 我们本来就在往页面里注入样式，
 * `.mobile-menu.mobile-menu a` 的特异度是 (0,2,1)，Tailwind 的 `.text-white`
 * 只有 (0,1,0)，一行 `color:` 就能盖掉。
 *
 * 第一环一拆，后面全塌：不用暗底 → 不受 Y ≤ 0.10 的亮度预算约束 → 整个色相
 * 环都能用。实拍出来的差别不是"换了个配色"，是 frost 那块蓝紫品红的高饱和
 * 渐变（观感接近 iOS 壁纸）和站点其余部分——象牙纸加载页、淡彩小动物——
 * 根本不是一套东西，而 paper 是。
 *
 * 那 site.js 里原来写的"浅底会让上游反白的 logo 直接消失、修它要 :has()、
 * 代价比收益大"呢？那条结论过期了：:has() 在 2023 年 12 月随 Firefox 121
 * 落地，四大引擎齐了（Chrome 105 / Safari 15.4 / Firefox 121 / Edge 105），
 * 现在是 Baseline Widely Available。而且这里只用它做一件纯装饰的事（菜单
 * 打开时把 logo 压黑），外面套一层 @supports selector(:has(*))，老浏览器
 * 拿到的就是原来那个白 logo —— 退化，不是坏掉。
 *
 * 纸色和四角淡彩取自和小动物同一组静止色（tools/crystals.js 的 prism 预设
 * 解出来的 restColors），所以菜单和首页是同一套色。
 */
const PAPER_WASH = 0.55;

/** 四角淡彩的位置，和 frost 共用 FROST_CORNERS。 */
const PAPER_WEIGHTS = [PAPER_WASH, PAPER_WASH, PAPER_WASH, PAPER_WASH];

/**
 * 网格线比 frost 淡得多（.055 对 .14）。
 * 不是审美偏好：frost 的底等效亮度只有 36 灰，黑线要 .14 才看得见；paper 的
 * 底是 242 灰，同样的 .14 会重得像方格纸。两者在屏幕上的观感强度是一致的。
 */
const PAPER_GRID = { color: '#000000', alpha: 0.055, step: 64 };

/** 序号 / 社交行 / 脚线的目标对比度。11px 和 18px 都算正文，走 AA 的 4.5:1。 */
const PAPER_SMALL_MIN = 4.5;

/** 脚线与当前项下划线的墨色不透明度。纯装饰，不参与阅读。 */
const PAPER_HAIR = 0.14;
const PAPER_UNDERLINE = 0.34;

/** paper 的文字量度上限（px）。比 frost 宽一点 —— 浅底不怕字散。 */
const PAPER_MEASURE = 600;

// ------------------------------------------------------------------ ink 参数

/**
 * 墨底三段不透明度：顶 90% / 中 94% / 底 97%。
 * ink 是上一版的默认预设，现在降级为可选项，参数原样保留。
 */
const INK_STOPS = [0.9, 0.94, 0.97];
const INK_BLUR = '26px';
const INK_SATURATE = '110%';

/** 发丝线和序号的白色不透明度。 */
const INK_LINE = 0.13;
const INK_NUM = 0.42;

/** 打开时每条导航从下方抬起的距离（px）。 */
const INK_LIFT = 14;

/** ink 的文字量度上限（px）。比 frost 窄一点，因为它是通栏发丝线的版式。 */
const INK_MEASURE = 520;

/** 社交链接的不透明度，上游是 .61（太暗），提到这个值。 */
const SOCIAL_ALPHA = 0.74;

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

const round1 = (n) => Math.round(n * 10) / 10;

/** 单个颜色的校验，用法和 checkColorList 一样：出错时回退到默认值。 */
function checkHex(v, key, errors) {
  if (!isHex6(v)) {
    errors.push(`site.menu.${key}: ${JSON.stringify(v)} 不是 #RRGGBB 写法`);
    return MENU_DEFAULTS[key];
  }
  return v.trim().toLowerCase();
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

/** frost 的四角彩晕，按 config 里的颜色顺序配上固定的角位与权重。 */
function frostBlooms(bloom) {
  return bloom.map((color, i) => ({
    color, at: FROST_CORNERS[i], weight: FROST_WEIGHTS[i],
  }));
}

/**
 * 各预设「最亮处」的等效底色 —— 对比度体检要按最坏情况算，不是按平均。
 *   aurora / gradient  不透明，最坏就是 colors 里最浅的那个
 *   ink                半透明，最坏是最透的那一段压在纯白场景上
 *   frost              半透明 + 彩晕 + 网格，交给 grain.js 的九点采样
 */
function worstBackdrop(mode, colors, ink) {
  if (mode === 'ink') return over(ink, '#ffffff', INK_STOPS[0]);
  return colors.reduce((a, c) => (contrast('#ffffff', c) < contrast('#ffffff', a) ? c : a));
}

/** 底色：160° 线性渐变，三段。aurora / gradient 共用。 */
function baseGradient(colors) {
  return `linear-gradient(160deg,${colors[0]} 0%,${colors[1]} 55%,${colors[2]} 100%)`;
}

function auroraLayers(glow) {
  return BLOBS.map((b, i) => `radial-gradient(${b.size} at ${b.at},`
    + `${rgba(glow[i], b.alpha)} 0%,${fade(glow[i])} ${b.stop})`);
}

/**
 * 在浅底上解出一档「够淡但仍达标」的墨色。
 *
 * 序号、社交链接这些副文本不能和主标题同一个浓度，否则整屏一样黑，层次全
 * 无；可一淡下去就要撞对比度下限。这里从 20% 起一档一档加浓度，取第一个
 * 满足 target 的值 —— 既是最淡的合格解，也让这个数字可复现，而不是拍脑袋
 * 写死一个 rgba。
 *
 * 返回不透明十六进制而不是 rgba：副文本压的是什么底是确定的，先合成好再
 * 输出，后面的体检就能把它当普通颜色算，不用再追 alpha 落在谁身上。
 */
function solveInk(ink, paper, target) {
  for (let i = 20; i <= 100; i += 1) {
    const c = over(ink, paper, i / 100);
    if (contrast(c, paper) >= target) return c;
  }
  return ink;
}

/** paper 的四角淡彩：角位沿用 frost 那套构图，权重换成 PAPER_WASH。 */
function paperBlooms(wash) {
  return wash.map((color, i) => ({
    color, at: FROST_CORNERS[i], weight: PAPER_WEIGHTS[i],
  }));
}

/**
 * paper 的最坏底色。
 *
 * 这里不需要 frost 那套九点采样：纸底不透明，backdrop 完全不参与；而
 * grain.js 里 bloomWeightAt 的推导已经给出结论 —— 相邻的晕在对角上权重
 * 归零，最浓处就是各自角上的峰值 PAPER_WASH。于是「最坏」只在四个角里选。
 *
 * 方向和 frost 正好相反：白字压暗底怕底变亮，墨字压浅底怕底变暗。所以网格
 * 取交叉点（两条暗线叠起来），颗粒取 -2σ（偏暗那一侧，覆盖 97.7%）。
 */
function paperWorst(paper, wash, grid, noise) {
  const darker = (a, b) => (contrast('#000000', a) < contrast('#000000', b) ? a : b);
  let worst = paper;
  wash.forEach((c) => { worst = darker(over(c, paper, PAPER_WASH), worst); });
  if (grid) worst = over(PAPER_GRID.color, worst, 1 - (1 - PAPER_GRID.alpha) ** 2);
  if (noise) worst = darker(grainLift(worst, 'light', -2), worst);
  return worst;
}

/**
 * paper 预设的全部规则。
 *
 * 为什么这一版敢用浅底
 * --------------------
 * frost 的整条推导链是这么开头的：「菜单文字是上游写死的 text-white，改不
 * 了，所以底必须暗到 Y ≤ 0.10」。链条的第一环是假的 —— 我们注入的
 * `.mobile-menu.mobile-menu a` 特异度 (0,2,1) 高于 Tailwind 的 `.text-white`
 * (0,1,0)，一行 color 就能盖掉，连 !important 都不用。
 *
 * 第一环一拆，后面全塌：暗底上紫红那一带的色度天花板（h≈280 maxC .295）
 * 是青蓝一带（h≈200 只有 .077）的近四倍，于是 frost 的四角只能往蓝→紫→玫
 * →红那半圈走 —— 那片扎眼的品红不是配错色，是暗底逼出来的唯一解。纸底没
 * 有这条约束，四角可以各挑一个方向的淡彩，整块面板也就安静下来。
 *
 * :has() 的代价现在也不成立了
 * ---------------------------
 * 上一版拒绝浅底的另一个理由是「菜单打开时要把白 logo 和白关闭图标反色，
 * 得用 :has()，兼容性代价大于收益」。:has() 现在已经是 Baseline Widely
 * Available（Chrome 105 / Edge 105 / Safari 15.4 / Firefox 121，2023-12
 * 全部到齐）。而且这里只有 logo 真的需要它：关闭图标本来就只在菜单打开时
 * 才可见，无条件反色即可。兜底也很软 —— 老浏览器只是 logo 压在纸上看不清，
 * 导航文字一切正常。
 */
function paperRules(sel, open, o) {
  const {
    paper, ink, wash, index, grid, motion,
  } = o;
  const nav = `${sel}>div:nth-child(2)`;
  const link = `${nav}>a`;
  const social = `${sel}>div:nth-child(3)`;
  const r = [];

  const mesh = meshLayers(paperBlooms(wash));
  const g = grid ? gridLayers(PAPER_GRID) : { images: [], sizes: [] };
  const images = [...g.images, ...mesh];
  const sizes = [...g.sizes, ...mesh.map(() => '100% 100%')];
  const repeats = [...g.images.map(() => 'repeat'), ...mesh.map(() => 'no-repeat')];

  // 副文本的墨色（序号 / 社交行）：浓度解出来，不是拍出来的。
  const faint = solveInk(ink, paper, PAPER_SMALL_MIN);

  // 底：不透明纸 + 四角淡彩 + 细网格。--ns-menu-gut 是量度留白，导航和社交
  // 行共用一个值，两处的左右边界因此永远对齐。
  r.push(`${sel}{isolation:isolate;`
    + `--ns-menu-gut:max(24px,(100% - ${PAPER_MEASURE}px)/2);`
    + '--ns-menu-foot:46px;'
    + `background-color:${paper};`
    + `background-image:${images.join(',')};`
    + `background-size:${sizes.join(',')};`
    + `background-repeat:${repeats.join(',')}}`);

  // 上游写的是 h-screen（100vh）。移动端地址栏收起前 100vh 比可视区高一截，
  // 底部那行社交链接会被切掉。支持 dvh 就用 dvh。
  r.push(`@supports(height:100dvh){${sel}{height:100dvh}}`);

  // 整个预设的支点：把上游写死的 text-white 换成墨色。
  r.push(`${sel} a{color:${ink}}`);

  // 顶部空 div 撑出和底部等高的占位，导航吃掉剩下的一半 → 真正居中。
  r.push(`${sel}>div:first-child{flex:none;height:var(--ns-menu-foot)}`);

  r.push(`${nav}{margin-block:auto;align-items:flex-start;`
    + 'gap:clamp(22px,4.2vh,36px);'
    + 'padding-inline:var(--ns-menu-gut)'
    + `${index ? ';counter-reset:ns-menu' : ''}}`);

  // 链接排成两列：序号一列、标签一列，基线对齐。
  //
  // frost 把序号摞在标签正上方，四条标签的左缘靠 items-start 对齐。这版改
  // 成同一行：序号列宽由最宽的序号决定，而 decimal-leading-zero 恒两位、
  // 再加 tabular-nums，四条序号完全等宽 —— 标签左缘于是天然是一条直线，
  // 竖向还少占四行高度，移动端菜单本来就没多少纵向余量。
  const linkDecl = index
    ? ['display:grid', 'grid-template-columns:auto 1fr',
      'align-items:baseline', 'column-gap:.42em']
    : ['display:block'];
  linkDecl.push('font-size:clamp(32px,8.2vw,44px)', 'line-height:1.06');
  if (index) linkDecl.push('counter-increment:ns-menu');
  // 上游给这四条链接挂了 `transition-all duration-300`，打开时再各自加
  // delay-200/250/300/350。transform 是可过渡属性，transition-all 会带上
  // 它 —— 于是「从下方 12px 浮上来」白捡了一套已经和不透明度对齐的错峰，
  // 不用另写 transition-delay 去跟它打架。
  if (motion) linkDecl.push('transform:translateY(12px)');
  r.push(`${link}{${linkDecl.join(';')}}`);

  if (index) {
    r.push(`${link}::before{content:counter(ns-menu,decimal-leading-zero);`
      + 'font-size:11px;line-height:1;letter-spacing:.26em;'
      + `color:${faint};`
      + 'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}');
  }

  // 下划线只留给当前页那一条。
  //
  // frost 给四条全画线（background-size 从 0 拉到满宽），暗底上那是一排微
  // 光；换到纸底就成了四条长短不一的黑杠 —— 字数不同线就不同长，读起来像
  // 排版事故。这版只留一条，让下划线回到它本来的职责：标出「你在哪」。
  r.push(`${link}.router-link-active{text-decoration:underline;`
    + 'text-underline-offset:.14em;text-decoration-thickness:1px;'
    + `text-decoration-color:${rgba(ink, PAPER_UNDERLINE)}}`);

  if (motion) {
    r.push(`${open}>div:nth-child(2)>a{transform:none}`);
    r.push('@media(prefers-reduced-motion:reduce){'
      + `${link},${open}>div:nth-child(2)>a{transform:none;transition:none}}`);
  }

  // 社交行改三列 grid。
  //
  // 上游是 `flex justify-between`：三条链接按各自内容宽度两端对齐，中间那
  // 个「X」只有 12px 宽却要顶住中位，实测它的中心落在容器 46% 处，看着就
  // 是歪的。1fr auto 1fr 让中间那条真的居中，两侧各自贴边。
  r.push(`${social}{display:grid;grid-template-columns:1fr auto 1fr;`
    + 'align-items:baseline;column-gap:16px;'
    + `border-top:1px solid ${rgba(ink, PAPER_HAIR)};padding-top:18px;`
    + 'padding-left:var(--ns-menu-gut);padding-right:var(--ns-menu-gut)}');
  r.push(`${social}>a:nth-child(1){justify-self:start}`);
  r.push(`${social}>a:nth-child(2){justify-self:center}`);
  r.push(`${social}>a:nth-child(3){justify-self:end}`);
  // 上游拿 opacity-61 做次要感。纸底上那就是 61% 的墨，半透明的小字压在颗
  // 粒层上会起毛边。换成实色 faint：观感一样，边缘干净，而且浓度有据可查。
  r.push(`${social}>a.opacity-61{opacity:1;color:${faint}}`);

  // 关闭图标：上游 close.svg 是 fill="white" 的纯白 X，纸底上等于消失。
  // brightness(0) 把任何颜色压成纯黑，不用改 SVG 文件。这条不需要 :has()
  // —— .close 本来就只在菜单打开时才不透明。
  r.push('.mobile-menu-button .close img{filter:brightness(0)}');

  // 汉堡按钮：上游类名里写了 backdrop-blur-2xl，但产物里那条工具类没生成
  // （实测 computed backdropFilter 是 none）。显式补上，按钮在纸底上才有
  // 厚度，不然就是一块平的白胶布。
  r.push('.mobile-menu-button{-webkit-backdrop-filter:blur(18px);'
    + 'backdrop-filter:blur(18px)}');

  // logo 也是纯白 SVG，菜单打开时压在纸上会消失。这是唯一真正需要 :has()
  // 的地方 —— 反色的触发条件在兄弟节点上，没有别的选择器能表达。
  r.push('@supports selector(:has(*)){'
    + 'header:has(.mobile-menu.opacity-100) .logo-wrapper img,'
    + 'header:has(.mobile-menu.opacity-100) .logo-wrapper-2 img{filter:brightness(0)}'
    + 'header:has(.mobile-menu.opacity-100) .mobile-menu-button{'
    + `background-color:${rgba(ink, 0.06)};`
    + `box-shadow:inset 0 0 0 1px ${rgba(ink, 0.16)}}}`);

  return r;
}

/**
 * frost 预设的全部规则。
 *
 * 选择器为什么按位置选（>div:nth-child(2)）
 * ------------------------------------------
 * 上游那三个直接子元素只有第二个（导航容器）带类名 `flex flex-col gap-64
 * items-center`，第一个是空 div、第三个的类名里全是 Tailwind 工具类。按类名
 * 选会跟工具类的语义绑死（比如哪天 gap-64 改成 gap-48 就失配），按位置选
 * 反而稳 —— 结构变了会立刻在截图里露馅，不会静默错位。
 *
 * 下划线为什么用 background-size 做
 * ---------------------------------
 * 上游给这四条链接挂的是 `transition-all duration-300`，打开时再各自加上
 * `delay-200 / delay-250 / delay-300 / delay-350`。background-size 是可过渡
 * 属性，`transition-all` 会带上它 —— 于是下划线从 0 画到 100% 这件事，直接
 * 白捡了一套已经和不透明度对齐的错峰，不用另写 transition-delay 去跟它打架。
 *
 * 垂直居中为什么要给第一个空 div 一个高度
 * ---------------------------------------
 * 上游是 `flex flex-col justify-between pb-24`，三个子元素分别是空 div、
 * 导航、社交行。空 div 高 0，社交行占了底部一块，于是"两端对齐"算出来的
 * 导航中心比视口中心高出约 22px，下面空一大片。给空 div 一个等于底部占位
 * （社交行 + pb-24）的高度，再让导航吃掉两边的 auto margin，中心就正好落在
 * 视口中线上。
 */
function frostRules(sel, open, o) {
  const {
    ink, bloom, index, grid, motion,
  } = o;
  const nav = `${sel}>div:nth-child(2)`;
  const link = `${nav}>a`;
  const social = `${sel}>div:nth-child(3)`;
  const r = [];

  const blooms = frostBlooms(bloom);
  const mesh = meshLayers(blooms);
  const g = grid ? gridLayers(FROST_GRID) : { images: [], sizes: [] };
  const images = [...g.images, ...mesh];
  const sizes = [...g.sizes, ...mesh.map(() => '100% 100%')];
  const repeats = [...g.images.map(() => 'repeat'), ...mesh.map(() => 'no-repeat')];

  // 底：纯色底 + 彩晕 + 网格。--ns-menu-gut 是"量度留白"，导航和社交行共用
  // 一个值，这样两处的左右边界永远对齐。
  r.push(`${sel}{isolation:isolate;`
    + `--ns-menu-gut:max(24px,(100% - ${MENU_MEASURE}px)/2);`
    + '--ns-menu-foot:46px;'
    + `background-color:${rgba(ink, FROST_ALPHA)};`
    + `background-image:${images.join(',')};`
    + `background-size:${sizes.join(',')};`
    + `background-repeat:${repeats.join(',')}}`);

  // 上游写的是 h-screen（100vh）。移动端浏览器的地址栏收起前 100vh 比可视区
  // 高一截，底部那行社交链接会被切掉。dvh 支持就用 dvh。
  r.push(`@supports(height:100dvh){${sel}{height:100dvh}}`);

  // frost 故意不用 backdrop-filter。
  //
  // 上一版挂了 blur(18px) saturate(150%)，理由是"alpha=.86 还剩 14% 透光，
  // 模糊有事可做"。这一版彩晕权重拉满到 1.0、SIZE 放到 1.35，整块面板已经
  // 被自己的彩晕铺满，背后那 10% 透光量在视觉上完全被盖掉 —— 模糊层做的功
  // 一分都看不见，却要求浏览器每帧把背后的 3D 画布再采样模糊一次。低端
  // Android 上这是纯烧 GPU。所以直接不要。
  //
  // 顺带好处：不用再写 `@supports not (backdrop-filter)` 的回退分支了，
  // 因为现在所有环境看到的都是同一个结果。
  //
  // ink 预设保留 backdrop-filter，那边的层次结构不一样（见 buildInk）。

  // 顶部空 div 撑出和底部等高的占位，导航吃掉剩余空间的一半 → 真正居中。
  r.push(`${sel}>div:first-child{flex:none;height:var(--ns-menu-foot)}`);

  // 导航容器：拆掉 items-center 的居中和 64px 等距，改成左对齐的索引列。
  r.push(`${nav}{margin-block:auto;align-items:flex-start;`
    + 'gap:clamp(24px,4.4vh,38px);'
    + 'padding-inline:var(--ns-menu-gut)'
    + `${index ? ';counter-reset:ns-menu' : ''}}`);

  // 链接本体。inline-block 让下划线只有文字那么宽（贴着字，不通栏）。
  const linkDecl = [
    'display:inline-block', 'position:relative',
    'font-size:clamp(32px,8.2vw,44px)', 'line-height:1.06',
    'background-repeat:no-repeat', 'background-position:0 100%',
    'background-size:0 1px',
    `background-image:linear-gradient(90deg,${rgba('#ffffff', FROST_RULE[0])} 0%,`
      + `${rgba('#ffffff', FROST_RULE[1])} 100%)`,
    'padding-bottom:.14em',
  ];
  if (index) linkDecl.push('counter-increment:ns-menu');
  r.push(`${link}{${linkDecl.join(';')}}`);

  if (index) {
    // 序号放在标签正上方，和标签同一条左边界 —— 不再甩到屏幕最右边留死区。
    // decimal-leading-zero 给出 01/02/03…；序号是装饰性读数，不进无障碍树
    // 也没关系（::before 的 content 本来就不是可选中文本）。
    r.push(`${link}::before{content:counter(ns-menu,decimal-leading-zero);`
      + 'display:block;font-size:11px;line-height:1;letter-spacing:.26em;'
      + `margin-bottom:.7em;opacity:${dec(FROST_NUM)};`
      + 'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}');
  }

  if (motion) {
    // 打开时下划线从 0 画到满宽，走的是上游自己的 delay-200/250/300/350。
    r.push(`${open}>div:nth-child(2)>a{background-size:100% 1px}`);
    r.push('@media(prefers-reduced-motion:reduce){'
      + `${link},${open}>div:nth-child(2)>a{background-size:100% 1px;transition:none}}`);
  } else {
    r.push(`${link}{background-size:100% 1px}`);
  }

  // 社交行：左右缩到和导航文字同一条边界上，顶上补一条只到量度宽度的细线。
  r.push(`${social}{padding-left:var(--ns-menu-gut);padding-right:var(--ns-menu-gut)}`);

  // 焦点圈往里收一点，免得顶到彩晕最亮的角上。
  r.push(`${link}:focus-visible{outline-offset:2px;border-radius:2px}`);

  return r;
}

/**
 * ink 预设的全部规则（上一版的默认，现在是可选项，原样保留）。
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

  r.push(`${sel}{isolation:isolate;`
    + `--ns-menu-gut:max(20px,(100% - ${INK_MEASURE}px)/2);`
    + `background-image:linear-gradient(180deg,`
    + `${rgba(ink, INK_STOPS[0])} 0%,`
    + `${rgba(ink, INK_STOPS[1])} 58%,`
    + `${rgba(ink, INK_STOPS[2])} 100%)}`);

  r.push(`@supports(height:100dvh){${sel}{height:100dvh}}`);

  r.push(`${open}{-webkit-backdrop-filter:blur(${INK_BLUR}) saturate(${INK_SATURATE});`
    + `backdrop-filter:blur(${INK_BLUR}) saturate(${INK_SATURATE})}`);

  r.push('@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){'
    + `${sel}{background-color:${ink}}}`);

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
    r.push(`${link}::after{content:counter(ns-menu,decimal-leading-zero);`
      + 'font-size:11px;line-height:1;letter-spacing:.24em;margin-right:-.24em;'
      + `opacity:${dec(INK_NUM)};`
      + 'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}');
  }

  if (motion) {
    r.push(`${open}>div:nth-child(2)>a{transform:none}`);
    r.push(`@media(prefers-reduced-motion:reduce){${link}{transform:none}}`);
  }

  r.push(`${social}{border-top:${line};padding-top:20px;`
    + 'padding-left:var(--ns-menu-gut);padding-right:var(--ns-menu-gut)}');

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
  // frost / ink 只用 ink + index（frost 再加 bloom + grid），aurora / gradient
  // 只用 colors + glow。各校验各的，免得配了 frost 却因为没写 glow 报一堆
  // 用不上的错。
  const isPaper = mode === 'paper';
  const isFrost = mode === 'frost';
  const isInk = mode === 'ink';
  const dark = isFrost || isInk;
  // paper 和 dark 两族共享「序号 + 网格 + 量度」这套排版骨架，只是底色反过
  // 来。mesh 用来区分「自己写的排版预设」和「用户随便配颜色的 aurora /
  // gradient」—— 前者压不住就是我们的 bug，直接拦；后者只提示。
  const mesh = dark || isPaper;

  const ink = dark ? checkHex(m.ink, 'ink', errors) : MENU_DEFAULTS.ink;
  const paper = isPaper ? checkHex(m.paper, 'paper', errors) : MENU_DEFAULTS.paper;
  const paperInk = isPaper ? checkHex(m.paperInk, 'paperInk', errors) : MENU_DEFAULTS.paperInk;
  const wash = isPaper ? checkColorList(m.wash, 'wash', 4, errors) : MENU_DEFAULTS.wash;
  if (mesh && typeof m.index !== 'boolean') {
    errors.push(`site.menu.index: 需要 true / false，实际拿到 ${JSON.stringify(m.index)}`);
  }
  const index = m.index !== false;
  const grid = m.grid !== false;
  const bloom = isFrost
    ? checkColorList(m.bloom, 'bloom', 4, errors)
    : MENU_DEFAULTS.bloom;
  const backdrop = isFrost ? checkHex(m.backdrop, 'backdrop', errors) : MENU_DEFAULTS.backdrop;
  const colors = mesh ? MENU_DEFAULTS.colors : checkColorList(m.colors, 'colors', 3, errors);
  const glow = mesh ? MENU_DEFAULTS.glow : checkColorList(m.glow, 'glow', 3, errors);

  const rules = [];
  const sel = '.mobile-menu.mobile-menu';
  // 打开状态由 Vue 加上 `opacity-100`。把动画和 backdrop-filter 挂在这个类上，
  // 菜单关着的时候就不会有任何持续开销 —— 移动端这点很值。
  const open = `${sel}.opacity-100`;

  if (isPaper) {
    rules.push(...paperRules(sel, open, {
      paper, ink: paperInk, wash, index, grid, motion,
    }));
  } else if (isFrost) {
    rules.push(...frostRules(sel, open, {
      ink, bloom, index, grid, motion,
    }));
  } else if (isInk) {
    rules.push(...inkRules(sel, open, { ink, index, motion }));
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

  // 颗粒层。frost 用它做磨砂质感（这是这一版的重点，不再是"打散色带"的
  // 附属品）；aurora / gradient 是不透明的大面积渐变，叠一层同样能压色带。
  // ink 保持上一版的行为：它已经有 26px 的背景模糊在打散色带了，不再叠。
  if (noise && !isInk) {
    let grainOpt;
    // paper 是浅底，颗粒要用 light 那档参数（GRAIN_SURFACES.light 的中心
    // 定在 .90，振幅按参考站浅色区的 std=2.7 标定过）。拿 dark 那档压在纸
    // 上会是一层脏灰雾。
    if (isPaper) grainOpt = { surface: 'light' };
    else if (isFrost) grainOpt = { surface: 'dark' };
    // aurora / gradient 只是要压住渐变色带，不需要对齐参考站的振幅，
    // 用中灰噪点 + overlay 就够（它俩的底是不透明的，不怕均值漂移）。
    else grainOpt = { alpha: 0.42, slope: 2, center: 0.5, blend: 'overlay' };
    rules.push(grainRule(sel, grainOpt));
  }

  // 可读性微调。
  // 导航链接的 opacity 是逐条错峰动画（delay-200/250/300/350），绝对不能碰；
  // 社交行的错峰在父元素上，子元素的 opacity-61 是静态值，可以安全提亮。
  rules.push(`${sel} a{letter-spacing:.04em}`);
  // paper 已经在 paperRules 里把这条换成了实色 faint（半透明小字压在颗粒层
  // 上会起毛边），这里就不再重复输出一条注定被覆盖的规则。
  if (!isPaper) rules.push(`${sel} a.opacity-61{opacity:${dec(SOCIAL_ALPHA)}}`);

  // 键盘可达性：上游整个站里 focus-visible 出现 0 次，Tab 走到菜单里没有任何
  // 可见反馈。补一圈描边，所有预设都给 —— 颜色跟着文字走，纸底上用墨色。
  rules.push(`${sel} a:focus-visible{outline:2px solid ${rgba(isPaper ? paperInk : '#ffffff', 0.7)};`
    + 'outline-offset:3px;border-radius:3px}');

  // 对比度体检。
  //
  // frost / ink / aurora / gradient 都是白字压暗底：文字固定白，底越亮越
  // 危险。paper 反过来 —— 墨字压纸底，底越暗越危险。文字色和「最坏方向」
  // 两头都翻了，所以分开算，别想着共用一条公式。
  let ratio;
  let eff;
  let text = '#ffffff';
  if (isPaper) {
    text = paperInk;
    eff = paperWorst(paper, wash, grid, noise);
    ratio = round1(contrast(text, eff));
  } else if (isFrost) {
    const w = worstCaseContrast({
      base: ink,
      alpha: FROST_ALPHA,
      blooms: frostBlooms(bloom),
      grid: grid ? { color: FROST_GRID.color, alpha: FROST_GRID.alpha } : null,
      grain: noise ? 'dark' : null,
      backdrop,
    });
    ratio = w.ratio;
    eff = w.effective;
  } else {
    eff = worstBackdrop(mode, colors, ink);
    ratio = round1(contrast(text, eff));
  }

  // paper / frost / ink 是我们自己定的预设，压不住文字就是坏了，直接拦；
  // aurora / gradient 是用户自己配的颜色，只提示不拦截 —— 那是审美判断，
  // 不是正确性问题。
  if (isPaper && ratio < MENU_MIN) {
    errors.push('site.menu：paper 叠完四角淡彩、网格和颗粒之后，墨色 '
      + `${paperInk} 在最坏底色（${eff}）上只有 ${ratio}:1，低于要求的 ${MENU_MIN}:1。`
      + '把 wash 挑淡一些，或者把 paperInk 调深。');
  }
  if (isFrost && ratio < MENU_MIN) {
    errors.push(`site.menu：frost 叠完四角彩晕和网格之后，白字在最坏背景`
      + `（${backdrop}）上只有 ${ratio}:1（等效底色 ${eff}），低于要求的 ${MENU_MIN}:1。`
      + '把 bloom 换深一些，或者把 ink 调深。');
  }
  if (isInk && ratio < MENU_MIN) {
    errors.push(`site.menu.ink: ${ink} 在最透的那一段（${dec(INK_STOPS[0])} 不透明度，`
      + `等效底色 ${eff}）对白字只有 ${ratio}:1，低于要求的 ${MENU_MIN}:1。把墨色调深。`);
  }
  if (!mesh && ratio < 4.5) {
    warnings.push(`site.menu：白色导航文字在最亮处的对比度只有 ${ratio}:1（等效底色 ${eff}），`
      + '低于 WCAG AA 的 4.5:1。aurora / gradient 不改文字颜色（保持上游的 '
      + 'text-white），请把 colors 换深一些，或者改用 paper 预设。');
  }
  // 社交行单独再算一次（AA 对非正文的下限按 3:1 看）。paper 用的是解出来的
  // 实色 faint，其它预设是 74% 白压在最坏底上。
  const socialInk = isPaper
    ? solveInk(paperInk, paper, PAPER_SMALL_MIN)
    : over('#ffffff', eff, SOCIAL_ALPHA);
  const social = round1(contrast(socialInk, eff));
  if (social < 3) {
    warnings.push(`site.menu：社交链接（${socialInk}）对比度只有 ${social}:1，偏低。`);
  }

  return {
    css: rules.join('\n'), errors, warnings, mode, contrast: ratio, backdrop: eff,
  };
}

module.exports = {
  buildMenuCss,
  worstBackdrop,
  frostBlooms,
  paperBlooms,
  paperWorst,
  solveInk,
  MENU_MODES,
  MENU_DEFAULTS,
  MENU_MIN,
  MENU_MEASURE,
  PAPER_WASH,
  PAPER_WEIGHTS,
  PAPER_GRID,
  PAPER_SMALL_MIN,
  PAPER_HAIR,
  PAPER_UNDERLINE,
  PAPER_MEASURE,
  FROST_ALPHA,
  FROST_CORNERS,
  FROST_WEIGHTS,
  FROST_GRID,
  INK_STOPS,
  INK_LIFT,
  INK_MEASURE,
};
