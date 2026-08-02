'use strict';
/**
 * grain.js — 「彩色磨砂」材质层：菜单和加载页共用的一套底层。
 *
 * 为什么要有这个文件
 * ------------------
 * 上一版把菜单和加载页各写各的背景，结果两处都是平的色块，而且同样的
 * 「渐变 + 噪点」逻辑抄了两遍。这一版把材质抽成三个可组合的层，两边共用：
 *
 *   1) mesh   四角彩晕（radial-gradient），负责"有颜色"
 *   2) grid   1px 细网格（linear-gradient），负责"有结构"
 *   3) grain  颗粒（内联 SVG feTurbulence），负责"有质感"
 *
 * 参考站是 https://solitude.js.org/。它首屏用的是 @paper-design/shaders 的
 * MeshGradient，参数 `softness=.92 intensity=.58 noise=.34 shape="corners"`，
 * 也就是 WebGL 在混色阶段注入噪声。本模板零 npm 依赖、产物是打给静态站的
 * 补丁，不可能往移动端菜单里塞一个 WebGL 画布，所以这里用纯 CSS 复刻。
 *
 * 颗粒是怎么标定出来的
 * --------------------
 * 拿参考站 1440x900 @2x 的首屏截图做 5x5 高通，量到：浅色区颗粒 std ≈ 2.70
 * (R) / 2.67 (G)，横向自相关 lag1 ≈ 0.595、lag2 ≈ 0.08，相关长度约 1 个
 * CSS 像素。
 *
 * 这里的标定分成两步，中间那步很容易被跳过然后得出错的结论：
 *
 * 第一步 —— 量图块本身。把噪点图块单独铺满一张纯色页、层不透明度设成 1，
 * 量到的才是噪声自己的振幅，不掺底色和混合模式（/workspace/probe_noise.py）。
 * 结果：slope=1 时图块灰度 std = 19.85（记作 GRAIN.unitStd），振幅对 slope
 * 严格线性。自相关只跟 baseFrequency 有关，线性变换不改它：
 *
 *   baseFrequency   lag1    lag2
 *          0.54    0.758   0.267
 *          0.62    0.690   0.133
 *          0.70    0.618   0.020   <- 选它，lag1 距目标 0.595 偏 3.9%
 *
 * ⚠️ 自相关必须在 device_scale_factor=2 下量。同一张图块在 @1x 上 lag1 只有
 *    0.132 —— 不是参数变了，是一个噪声单元在 @2x 屏上占 2 个设备像素。参考站
 *    的 0.595 就是 @2x 量的，档位不一样比出来的数没有意义。
 *
 * 第二步 —— 算层不透明度。合成 out = (1-a)*bg + a*noise 对 a 严格线性，
 * 所以 最终std = a * slope * unitStd，需要的 a 直接除出来。
 *
 * 两个非显而易见的坑
 * ------------------
 * 1. **feTurbulence 连 alpha 通道也是噪声。** 直接画一个带这个滤镜的矩形，
 *    等于"随机颜色 + 随机透明度"，底色会从随机的窟窿里透出来，均值漂移且
 *    不可预测（实测纸底 #f2ede3 的 G 从 237 掉到 212）。所以滤镜链末尾必须
 *    用 feComponentTransfer 把 alpha 钉成 1（feFuncA slope=0 intercept=1）。
 * 2. **SVG 滤镜默认在 linearRGB 里算**，出来的灰度分布不以 0.5 为中心。
 *    必须显式写 color-interpolation-filters='sRGB'。
 *
 * 为什么混合模式是 normal 而不是 overlay
 * --------------------------------------
 * 上一版选的是 overlay，理由是它均值零漂移、振幅正比于 2*min(b,1-b)，能自动
 * 复刻参考站"浅区 2.7 / 彩区 5.5~6.8"的分布。放到深底菜单上直接翻车：
 *
 *   实测（overlay，层不透明度 .78）：彩晕峰值区 std 高到 21.6，近黑区只剩 8，
 *   全图平均 11 —— 目标上限是 6.84。观感是老电视雪花，不是磨砂。
 *
 * 根因是 overlay 的动态范围和这里的需求正好相反：参考站是浅底站，主体落在
 * b≈0.93 的收敛端；我们的菜单主体落在 b≈0.15~0.40 的放大端。同一条曲线，
 * 一个在尾巴上一个在腰上。
 *
 * normal 的振幅恒定，跟底色无关，这才是真实胶片颗粒的行为。它唯一的代价是
 * 均值会被噪点中心拽 —— 那就把噪点中心挪到表面自己的亮度附近去，漂移自然
 * 就没了。所以 GRAIN_SURFACES 里每个表面都自带一个 center：
 *
 *   表面    center  代表底色    漂移 = alpha*(center*255 - bg)
 *   light    .90    象牙纸 237   -2.6
 *   dark     .25    墨玻璃  46   +3.2
 *
 * 顺带解决了 overlay 那套没法解决的问题：近黑区终于也有颗粒了。
 *
 * 已知偏差（写进文档，不假装没有）
 * --------------------------------
 * 1. lag2 对不齐：参考站 0.08，我们在 freq=0.70 时是 0.02。fractalNoise 的
 *    功率谱和 shader 里那套 snoise 不是一回事，lag1 和 lag2 不能同时对上
 *    （freq=0.62 时 lag2=0.133 但 lag1 会跑到 0.690）。lag1 是主描述量。
 * 2. 参考站的颗粒在彩色区有很强的通道差异（R 1.55 / G 5.55 / B 6.84），那是
 *    shader 在混色阶段逐通道注入噪声的结果。CSS 叠加层只能给出灰噪点，三通道
 *    等幅。这一条复刻不了，不假装做到了。
 */
const {
  isHex6, rgba, fade, contrast, over,
} = require('./color');

// ------------------------------------------------------------------ 常量

/** 标定出来的颗粒参数。改这里等于改全站的磨砂质感。 */
const GRAIN = {
  /** 空间尺度。只有它影响自相关；lag1 目标 0.595，0.70 给出 0.618。 */
  freq: 0.70,
  octaves: 1,
  /** 图块边长（CSS px）。stitchTiles='stitch' 保证无缝平铺，只栅格化一次。 */
  tile: 160,
  /** 恒定振幅，跟底色无关 —— 见文件头"为什么是 normal 而不是 overlay"。 */
  blend: 'normal',
  /** slope=1 时图块自身的灰度 std，实测 @DSF2。所有 alpha 都从它除出来。 */
  unitStd: 19.85,
};

/**
 * 每个表面一组颗粒参数。三个数不是独立的：
 *
 *   std = alpha * slope * GRAIN.unitStd          （振幅，对齐参考站）
 *   漂移 = alpha * (center*255 - 底色)            （越接近 0 越好）
 *   截断 = center ± 3*slope*unitStd/255 越界的比例（要 < 1%）
 *
 * alpha 还有第三个作用：它会把底下彩晕的对比度削掉 alpha 那么多。所以在
 * 满足振幅的前提下 alpha 取小、slope 取大，直到 3σ 快要撞上 0 或 1 为止。
 *
 *   表面   center  slope  alpha   图块std  最终std  截断    削彩晕
 *   light   .90     .40    .340    7.94     2.70   0.01%    34%
 *   dark    .25     .90    .179   17.87     3.20   0.00%    18%
 *
 * dark 的目标定在 3.20 而不是 light 的 2.70：菜单底比纸底暗得多，同样的
 * 绝对振幅在暗处看着更弱（韦伯定律），补一档才和浅色区观感相当。
 */
const GRAIN_SURFACES = {
  light: { center: 0.90, slope: 0.40, alpha: 0.340 },
  dark: { center: 0.25, slope: 0.90, alpha: 0.179 },
};

/** 参考站浅色区实测颗粒 std，作为 light 的标定目标。 */
const GRAIN_TARGET_STD = 2.7;

/**
 * 四角彩晕的椭圆尺寸与收尾停点，对应参考站的 shape="corners"。
 *
 * SIZE 定到 1.35，是被"暗底上的色度天花板"逼出来的结果，不是审美偏好：
 *
 * 白字要 7:1，底色的相对亮度就必须 Y ≤ 0.10。在这条线以下，一个颜色能有
 * 多"彩"是被硬性锁死的 —— 逐 OKLCh 色相扫出来的最大彩度差了近 4 倍
 * （h=280 能到 C=0.276，h=200 只有 C=0.072）。也就是说暗底上想要"看得见
 * 的颜色"，唯一的自由度是**面积**：单点彩度封顶了，只能让高彩度的区域铺
 * 得更开。
 *
 * SIZE 0.9 时四团晕缩在角上，全场平均彩度 0.022、屏幕中央只有 0.0035，
 * 肉眼读作"四个角有点脏"而不是"有颜色"。放到 1.35 之后平均彩度 ~0.14、
 * 中央 ~0.12，才真的成为一张带颜色的磨砂面。1.25 / 1.35 / 1.45 三档目视
 * 差异很小，取中间值。
 *
 * 角上的峰值不受 SIZE 影响 —— 峰值在 t=0 处。所以放大 SIZE 不吃对比度
 * 预算，最坏点始终在四个角。
 */
const BLOOM_SIZE = 1.35;
const BLOOM_STOP = 0.62;

/** 白字对比度下限。7:1 = WCAG AAA。 */
const MENU_MIN = 7;

/** 采样点：四角 + 四边中点 + 中心。最坏情况在这九个点里取。 */
const PROBE_POINTS = [
  [0, 0], [1, 0], [0, 1], [1, 1],
  [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5],
  [0.5, 0.5],
];

// ------------------------------------------------------------------ 工具

/** 0.24 → ".24"。CSS 里省掉前导 0，和 color.js 的 rgba() 写法保持一致。 */
const dec = (n) => String(Math.round(n * 1000) / 1000).replace(/^0\./, '.').replace(/^-0\./, '-.');

/** 百分比：0.24 → "24%"。 */
const pct = (n) => `${Math.round(n * 1000) / 10}%`;

// ------------------------------------------------------------- 颗粒图块

/**
 * 生成颗粒图块的 data URI。
 *
 * 不落地成文件是有意的：产物是要打进别人静态站的补丁，多一个请求就多一次
 * 失败可能，而且 data URI 天然跟着 CSS 走、不受 baseURL 子路径部署影响。
 * 图块 160x160 平铺，浏览器只栅格化一次，滚动时没有额外开销。
 *
 * @param {object} [o]
 * @param {number} [o.freq]     baseFrequency
 * @param {number} [o.octaves]  numOctaves
 * @param {number} [o.slope]    噪声对比度斜率
 * @param {number} [o.tile]     图块边长
 * @returns {string} 可直接放进 url() 的 data URI（已做 URL 编码）
 */
function grainDataUri(o) {
  const {
    freq = GRAIN.freq, octaves = GRAIN.octaves, tile = GRAIN.tile,
    slope = GRAIN_SURFACES.dark.slope, center = GRAIN_SURFACES.dark.center,
  } = o || {};
  // out = slope*s + intercept，s 的均值是 .5，所以 intercept 决定中心落在哪。
  const icpt = Math.round((center - slope / 2) * 10000) / 10000;
  const transfer = ['R', 'G', 'B']
    .map((ch) => `<feFunc${ch} type='linear' slope='${slope}' intercept='${icpt}'/>`)
    .join('')
    + "<feFuncA type='linear' slope='0' intercept='1'/>";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'>`
    + "<filter id='n' x='0' y='0' width='100%' height='100%' "
    + "color-interpolation-filters='sRGB'>"
    + `<feTurbulence type='fractalNoise' baseFrequency='${freq}' `
    + `numOctaves='${octaves}' stitchTiles='stitch'/>`
    + "<feColorMatrix type='saturate' values='0'/>"
    + `<feComponentTransfer>${transfer}</feComponentTransfer>`
    + '</filter>'
    + `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  // 只编码在 data URI 里会出事的那几个字符，顺序不能换：
  //   '%' 必须**第一个**编码，否则 width='100%' 里的 % 会被后续插入的
  //       %23/%3C 之类连坐，解码时把 "%'>" 当成一个残缺的百分号转义。
  //   '#' 必须编码，否则从它开始后面全被当成 URL 片段标识符。
  //   '<' '>' 编码是为了让整段能安全地待在 CSS 的 url("...") 里。
  // SVG 里通篇只用单引号，所以双引号不用管。
  const enc = svg
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `data:image/svg+xml,${enc}`;
}

/**
 * 颗粒层的完整 CSS 规则（一条 ::after）。
 *
 * z-index:-1 是必须的：绝对定位元素默认画在普通流内容之后，会盖住导航文字；
 * -1 让它落到「背景之上、内容之下」。配合父元素的 isolation:isolate，
 * mix-blend-mode 只跟这个容器自己的背景混，不会去和后面的 3D 画布叠加。
 *
 * @param {string} sel      父选择器（父元素必须自带 isolation:isolate）
 * @param {object} [o]
 * @param {number} [o.alpha]  图层不透明度
 * @param {string} [o.blend]  混合模式
 */
function grainRule(sel, o) {
  const opt = o || {};
  const surf = GRAIN_SURFACES[opt.surface || 'dark'] || GRAIN_SURFACES.dark;
  const alpha = opt.alpha == null ? surf.alpha : opt.alpha;
  const slope = opt.slope == null ? surf.slope : opt.slope;
  const center = opt.center == null ? surf.center : opt.center;
  const blend = opt.blend || GRAIN.blend;
  const tile = opt.tile == null ? GRAIN.tile : opt.tile;
  // z-index:-1 只有在父元素自己建立了层叠上下文（isolation:isolate）时才会
  // 画在"父背景之上、内容之下"；不隔离的话它会掉到父背景底下，什么都看不见。
  const decl = [
    'content:""', 'position:absolute', 'inset:0', 'z-index:-1',
    'pointer-events:none', `opacity:${dec(alpha)}`,
    `background-image:url("${grainDataUri({ ...opt, slope, center })}")`,
    'background-repeat:repeat', `background-size:${tile}px ${tile}px`,
  ];
  // normal 是默认值，写出来只会多几个字节。
  if (blend !== 'normal') decl.splice(6, 0, `mix-blend-mode:${blend}`);
  return `${sel}::after{${decl.join(';')}}`;
}

/** 颗粒层对底色的均值影响：返回叠完颗粒之后的等效底色。 */
function grainShift(color, surface) {
  const s = GRAIN_SURFACES[surface] || GRAIN_SURFACES.dark;
  const gray = Math.round(s.center * 255);
  const hex = `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
  return over(hex, color, s.alpha);
}

/** 实际能拿到的颗粒振幅（灰度 std）。测试拿它对齐参考站。 */
function grainStd(surface) {
  const s = GRAIN_SURFACES[surface] || GRAIN_SURFACES.dark;
  return Math.round(s.alpha * s.slope * GRAIN.unitStd * 100) / 100;
}

/**
 * 颗粒往亮的一侧 k 个标准差时的等效底色。
 *
 * grainShift 给的是均值，但颗粒是一个分布：合成结果 = 均值 + alpha*noise，
 * 逐通道 std 正好是 grainStd()。白字压在偏亮的那些颗粒上时对比度更差，
 * 所以对比度门要把这一侧也算进去。k=2 覆盖 97.7%。
 *
 * k 可以是负的：浅底上压深色字时，吃亏的是颗粒偏暗的那一侧，传 k=-2。
 */
function grainLift(color, surface, k) {
  const sd = grainStd(surface);
  const up = (v) => Math.max(0, Math.min(255, Math.round(v + k * sd)));
  const base = grainShift(color, surface);
  const ch = [1, 3, 5].map((i) => up(parseInt(base.slice(i, i + 2), 16)));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------- 彩晕 / 网格

/**
 * 四角彩晕。对应参考站 MeshGradient 的 shape="corners"。
 *
 * 每个晕是一个 120% x 120% 的椭圆径向渐变，锚在一个角上，62% 处收干净。
 * 用 fade() 而不是 transparent 收尾：transparent 等于 rgba(0,0,0,0)，
 * 在非预乘的插值里会往灰里带一道脏边。
 *
 * @param {Array<{color:string, at:[number,number], weight:number}>} blooms
 * @returns {string[]} 每个晕一条 radial-gradient，按传入顺序（先传的画在上层）
 */
function meshLayers(blooms) {
  return blooms.map((b) => {
    const [x, y] = b.at;
    return `radial-gradient(${pct(BLOOM_SIZE)} ${pct(BLOOM_SIZE)} at ${pct(x)} ${pct(y)},`
      + `${rgba(b.color, b.weight)} 0%,${fade(b.color)} ${pct(BLOOM_STOP)})`;
  });
}

/**
 * 某个彩晕在归一化坐标 (x,y) 处的实际权重。
 *
 * CSS 的 radial-gradient(S S at bx by, C 0%, T 62%) 里，渐变参数
 * t = sqrt(((x-bx)/S)^2 + ((y-by)/S)^2)，权重从 t=0 的 w 线性掉到 t=0.62
 * 的 0。两个推论（S = BLOOM_SIZE = 1.35）：
 *
 *   中心点  从 (0,0) 的晕看去 t = sqrt(2)*0.5/1.35 = 0.524，还剩 15.5%
 *           的权重。四团晕在中心各留 15.5% 叠起来 —— 这正是 SIZE 从 0.9
 *           放到 1.35 换来的东西（0.9 时中心只剩 5%，屏幕中间是灰的）。
 *   相邻角  t = 1/1.35 = 0.741，已经出了 62% 的停点，完全是 0。
 *
 * 所以最坏情况**仍然**是单个晕的峰值：四个角上各自只有自己那一团。放大
 * SIZE 只增加中间的混色，不动亮度预算。
 */
function bloomWeightAt(bloom, x, y) {
  const [bx, by] = bloom.at;
  const t = Math.hypot((x - bx) / BLOOM_SIZE, (y - by) / BLOOM_SIZE);
  if (t >= BLOOM_STOP) return 0;
  return bloom.weight * (1 - t / BLOOM_STOP);
}

/**
 * 1px 细网格。参考站叠了一层 `.home-grid`（两条 1px linear-gradient，
 * opacity .55），作用是给大面积渐变一个尺度参照，不然彩晕会显得没有边界感。
 *
 * @returns {{images:string[], sizes:string[]}} 直接拼进 background-image / -size
 */
function gridLayers(o) {
  const { color = '#ffffff', alpha = 0.05, step = 64 } = o || {};
  const line = rgba(color, alpha);
  const gone = fade(color);
  return {
    images: [
      `linear-gradient(to right,${line} 0 1px,${gone} 1px 100%)`,
      `linear-gradient(to bottom,${line} 0 1px,${gone} 1px 100%)`,
    ],
    sizes: [`${step}px ${step}px`, `${step}px ${step}px`],
  };
}

// --------------------------------------------------------------- 对比度门

/**
 * 整套材质叠完之后，文字最坏情况下的对比度。
 *
 * 为什么要按"最坏"算：菜单底是半透明的，背后是会动的 3D 场景，页面顶部
 * 那一段确实接近纯白。按平均色算出来的对比度是自欺欺人 —— 所以 backdrop
 * 默认取 #ffffff，也就是"背后最亮能亮成什么样"。
 *
 * 合成顺序和 CSS 的绘制顺序一致：backdrop → 底色(alpha) → 彩晕(从下往上)
 * → 网格线。颗粒层不计入：overlay 是零均值扰动，标定后的振幅只有 ±2.4/255，
 * 对 WCAG 亮度比的影响在小数点后第二位。
 *
 * @param {object} o
 * @param {string} o.base            底色
 * @param {number} o.alpha           底色不透明度
 * @param {Array}  [o.blooms]        彩晕
 * @param {object} [o.grid]          网格（{color, alpha}）
 * @param {string} [o.text]          文字色，默认白
 * @param {string} [o.backdrop]      最坏背景，默认纯白
 * @returns {{ratio:number, at:[number,number], effective:string}}
 */
function worstCaseContrast(o) {
  const {
    base, alpha, blooms = [], grid = null, grain = null,
    text = '#ffffff', backdrop = '#ffffff',
  } = o;
  let worst = null;
  PROBE_POINTS.forEach(([x, y]) => {
    let c = over(base, backdrop, alpha);
    // CSS 里先列出的图层画在上面，所以合成要从最后一个往前来。
    for (let i = blooms.length - 1; i >= 0; i -= 1) {
      const w = bloomWeightAt(blooms[i], x, y);
      if (w > 0) c = over(blooms[i].color, c, w);
    }
    // 网格是横竖两条独立的 1px 线。同一个采样点上，白字笔画可能压在
    // 交叉点（两条线都在，合成不透明度 1-(1-a)²），也可能落在线与线
    // 之间（完全没有网格）。这两种状态哪个更坏取决于线色：
    //   · 白网格 → 交叉点最亮 → 交叉点更坏
    //   · 暗网格 → 线间没有变暗 → 线间更坏
    // 只算交叉点的版本对暗网格会系统性高估（暗线把底压黑，看起来"对比度
    // 变好了"，但白字大部分笔画根本不在线上）。所以两态都算，取更坏的。
    const states = [c];
    if (grid) {
      const ga = grid.alpha == null ? 0.05 : grid.alpha;
      states.push(over(grid.color || '#ffffff', c, 1 - (1 - ga) ** 2));
    }
    states.forEach((s) => {
      // 颗粒层不是零均值的（normal 混合，中心在 GRAIN_SURFACES[].center），
      // 会把底色往中心拽 —— 往哪边拽取决于底色比噪点中心亮还是暗：
      //   近黑的底（Y 远低于 center）→ 被提亮 → 对比度下降
      //   彩晕峰值（比 center 亮）  → 被压暗 → 对比度反而上升
      // 所以不能只算"叠了颗粒"这一种状态：真按它算，四角的成绩会被颗粒
      // 白送一档，而用户只要写一句 noise:false 就跌破门槛（实测 7.2 → 6.1，
      // 构建直接报错）。对比度门不该依赖一层可关的装饰。
      //
      // 三态取最坏：
      //   1) 不叠颗粒        —— noise:false 的真实结果
      //   2) 叠颗粒（均值）  —— 默认结果
      //   3) 叠颗粒 +2σ      —— 颗粒是分布不是常数，亮的那一侧也要看
      const effs = [s];
      if (grain) {
        effs.push(grainShift(s, grain));
        effs.push(grainLift(s, grain, 2));
      }
      effs.forEach((eff) => {
        const ratio = contrast(text, eff);
        if (!worst || ratio < worst.ratio) worst = { ratio, at: [x, y], effective: eff };
      });
    });
  });
  return {
    ratio: Math.round(worst.ratio * 10) / 10,
    at: worst.at,
    effective: worst.effective,
  };
}

/** 彩晕列表的校验。出错时返回 null，由调用方决定回退。 */
function checkBlooms(list, key, errors) {
  if (!Array.isArray(list) || !list.length) {
    errors.push(`${key}: 需要一个非空的彩晕数组`);
    return null;
  }
  const bad = list.filter((b) => !b || !isHex6(b.color));
  if (bad.length) {
    errors.push(`${key}: ${bad.length} 个彩晕的 color 不是 #RRGGBB 写法`);
    return null;
  }
  return list.map((b) => ({
    color: b.color.trim().toLowerCase(),
    at: [Number(b.at[0]), Number(b.at[1])],
    weight: Number(b.weight),
  }));
}

module.exports = {
  GRAIN,
  GRAIN_SURFACES,
  GRAIN_TARGET_STD,
  BLOOM_SIZE,
  BLOOM_STOP,
  MENU_MIN,
  PROBE_POINTS,
  grainDataUri,
  grainRule,
  grainShift,
  grainLift,
  grainStd,
  meshLayers,
  bloomWeightAt,
  gridLayers,
  worstCaseContrast,
  checkBlooms,
  dec,
  pct,
};
