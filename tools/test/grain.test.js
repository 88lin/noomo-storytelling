'use strict';
/**
 * grain.test.js — 「彩色磨砂」材质层。
 *
 * 这个模块里几乎每个常量都是量出来或解出来的，不是拍的。所以测试守的不是
 * 「函数会不会抛异常」，而是**那些标定结论还成不成立**：
 *
 *   1. 颗粒振幅确实等于 alpha*slope*unitStd，改任一个数振幅跟着走；
 *   2. data URI 的编码顺序不能换（换了会静默产出一张打不开的图）；
 *   3. feTurbulence 的两个坑（alpha 通道也是噪声 / 默认在 linearRGB 里算）
 *      对应的两条声明必须在；
 *   4. worstCaseContrast 的"线上 / 线间两态取更坏"—— 这条一旦退回只算线上，
 *      暗网格的成绩会被系统性算高，对比度门槛就变成假的。
 */
const { test, eq, ok, setFile } = require('./harness');
const {
  GRAIN, GRAIN_SURFACES, GRAIN_TARGET_STD, BLOOM_SIZE, BLOOM_STOP, MENU_MIN,
  PROBE_POINTS, grainDataUri, grainRule, grainShift, grainStd, grainLift,
  meshLayers, bloomWeightAt, gridLayers, worstCaseContrast, checkBlooms,
  dec, pct,
} = require('../grain');
const { contrast, over } = require('../color');

setFile('grain');

// ------------------------------------------------------- 1. 颗粒标定还在

test('grain: 振幅 = alpha × slope × unitStd，两个表面都对得上标定值', () => {
  // 参考站浅色区实测 std ≈ 2.70，light 直接对齐它。
  eq(grainStd('light'), GRAIN_TARGET_STD);
  // dark 故意高一档：菜单底比纸底暗得多，同样的绝对振幅在暗处看着更弱
  // （韦伯定律），补一档才和浅色区观感相当。
  eq(grainStd('dark'), 3.2);
  ok(grainStd('dark') > grainStd('light'), '暗表面的颗粒应当比浅表面强一档');
  // 公式本身：三个数任改一个，std 必须跟着线性变
  for (const name of Object.keys(GRAIN_SURFACES)) {
    const s = GRAIN_SURFACES[name];
    eq(grainStd(name), Math.round(s.alpha * s.slope * GRAIN.unitStd * 100) / 100,
      `${name} 的 std 和公式对不上`);
  }
});

test('grain: 3σ 不撞到 0 / 1，否则噪声会被截断成一层脏点', () => {
  for (const name of Object.keys(GRAIN_SURFACES)) {
    const s = GRAIN_SURFACES[name];
    const sigma = s.slope * GRAIN.unitStd / 255;   // 图块自身的 σ（0–1 尺度）
    ok(s.center - 3 * sigma > -0.02, `${name}: 下侧 3σ 撞到 0（center=${s.center}）`);
    ok(s.center + 3 * sigma < 1.02, `${name}: 上侧 3σ 撞到 1（center=${s.center}）`);
  }
});

test('grain: 噪点中心贴着表面自己的亮度，均值漂移压在 ±4/255 以内', () => {
  // normal 混合的代价就是均值会被噪点中心拽。把中心挪到表面亮度附近，
  // 漂移自然就没了 —— 这是选 normal 而不是 overlay 的前提条件。
  const cases = [['light', '#f2ede3'], ['dark', '#2e2e30']];
  for (const [name, bg] of cases) {
    const shifted = grainShift(bg, name);
    const g = (h) => parseInt(h.slice(3, 5), 16);
    const drift = g(shifted) - g(bg);
    ok(Math.abs(drift) <= 4, `${name} 表面上颗粒把底色拽了 ${drift}/255`);
  }
});

test('grain: 混合模式是 normal —— overlay 在暗底放大端会变成电视雪花', () => {
  eq(GRAIN.blend, 'normal');
  // normal 是 CSS 默认值，写出来只是白占字节
  ok(!grainRule('.x').includes('mix-blend-mode'), grainRule('.x'));
  // 但显式要求 overlay 时还是要写出来（逃生口保留）
  ok(grainRule('.x', { blend: 'overlay' }).includes('mix-blend-mode:overlay'));
});

// --------------------------------------------------- 2. data URI 的两个坑

test('grain: 滤镜链把 alpha 钉成 1 —— feTurbulence 连透明度也是噪声', () => {
  // 不钉的话等于"随机颜色 + 随机透明度"，底色会从随机的窟窿里透出来，
  // 均值漂移且不可预测（实测纸底 #f2ede3 的 G 从 237 掉到 212）。
  const uri = decodeURIComponent(grainDataUri({ surface: 'dark' }));
  ok(uri.includes("<feFuncA type='linear' slope='0' intercept='1'/>"), uri);
});

test('grain: 显式声明 sRGB —— SVG 滤镜默认在 linearRGB 里算', () => {
  const uri = decodeURIComponent(grainDataUri());
  ok(uri.includes("color-interpolation-filters='sRGB'"),
    'linearRGB 下出来的灰度分布不以 0.5 为中心，标定的 unitStd 会失效');
  ok(uri.includes("stitchTiles='stitch'"), '不 stitch 的话平铺会看到接缝');
  ok(uri.includes("type='fractalNoise'"), 'turbulence 型是分形湍流，不是我们要的白噪声形态');
});

test('grain: 编码顺序不能换 —— % 必须第一个转义', () => {
  const uri = grainDataUri();
  // 裸 % 一个都不许有：width='100%' 里的 % 如果没先转义，会被后续插入的
  // %23 / %3C 连坐，解码时把 "%'>" 当成一个残缺的百分号转义。
  eq((uri.match(/%(?![0-9A-Fa-f]{2})/g) || []).length, 0, uri);
  // # 不转义的话，从它开始后面全被当成 URL 片段标识符
  ok(!uri.includes('#'), '有裸 #，url(#n) 之后的内容会被当成 fragment 丢掉');
  ok(uri.includes('%25'), '100%25 不见了 —— % 没被转义');
  ok(uri.includes('url(%23n)'), '滤镜引用没转义');
  // 转义完还得能原样解回去
  const round = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
  ok(round.startsWith('<svg xmlns=') && round.endsWith('</svg>'), round.slice(0, 60));
});

test('grain: intercept 由 center 和 slope 解出来，改 center 图块跟着变', () => {
  const grab = (o) => Number(/intercept='(-?[\d.]+)'/.exec(
    decodeURIComponent(grainDataUri(o)))[1]);
  // out = slope*s + intercept，s 均值 .5 → intercept = center - slope/2
  for (const [center, slope] of [[0.25, 0.9], [0.9, 0.4], [0.5, 1.0]]) {
    eq(grab({ center, slope }), Math.round((center - slope / 2) * 10000) / 10000);
  }
});

test('grain: 颗粒层垫在内容底下、不吃点击，且要求父元素自己隔离', () => {
  const r = grainRule('.ns-x', { surface: 'light' });
  ok(r.startsWith('.ns-x::after{content:""'), r.slice(0, 40));
  // z-index:-1 只有在父元素建立了层叠上下文时才落在"父背景之上、内容之下"
  ok(r.includes('z-index:-1'), r);
  ok(r.includes('pointer-events:none'), r);
  ok(r.includes(`opacity:${dec(GRAIN_SURFACES.light.alpha)}`), r);
  ok(r.includes(`background-size:${GRAIN.tile}px ${GRAIN.tile}px`), r);
  // SVG 通篇单引号 → url() 必须双引号
  ok(r.includes('background-image:url("data:image/svg+xml,'), r);
});

// ------------------------------------------------------------- 3. 彩晕

test('grain: 四团晕互不重叠在角上 —— 最坏情况就是单个晕的峰值', () => {
  const blooms = [[0, 0], [1, 0], [0, 1], [1, 1]].map((at) => ({
    color: '#ff0000', at, weight: 1,
  }));
  // 每个角上只有它自己那一团
  for (const [i, corner] of [[0, [0, 0]], [1, [1, 0]], [2, [0, 1]], [3, [1, 1]]]) {
    for (let j = 0; j < 4; j += 1) {
      const w = bloomWeightAt(blooms[j], corner[0], corner[1]);
      if (i === j) eq(w, 1, '自己那一团在自己的角上应该是满权重');
      else eq(w, 0, `第 ${j} 团晕漏到了第 ${i} 个角上（w=${w}）`);
    }
  }
});

test('grain: SIZE 1.35 让四团晕在中心叠出可见的混色（0.9 时中心是灰的）', () => {
  const b = { color: '#ff0000', at: [0, 0], weight: 1 };
  const wc = bloomWeightAt(b, 0.5, 0.5);
  // t = sqrt(2)*0.5/1.35 = 0.524 → w = 1 - 0.524/0.62 = 0.155
  ok(Math.abs(wc - 0.155) < 0.005, `中心权重是 ${wc}，和手算的 0.155 对不上`);
  ok(wc * 4 > 0.5, '四团晕在中心加起来不到一半，中间还是会发灰');
  // 反证：退回 0.9 中心只剩 5%
  const t09 = Math.hypot(0.5 / 0.9, 0.5 / 0.9);
  ok(1 - t09 / BLOOM_STOP < 0.07, 'SIZE=0.9 的中心权重应该低到 7% 以下');
});

test('grain: 彩晕收尾用 rgba(...,0) 而不是 transparent（避免灰脏边）', () => {
  const [layer] = meshLayers([{ color: '#0055ba', at: [0, 0], weight: 1 }]);
  ok(layer.includes(`radial-gradient(${pct(BLOOM_SIZE)} ${pct(BLOOM_SIZE)} at 0% 0%`), layer);
  ok(layer.includes('rgba(0,85,186,1) 0%'), layer);
  // transparent === rgba(0,0,0,0)，在非预乘插值里会往灰里带一道边
  ok(!layer.includes('transparent'), layer);
  ok(layer.includes(`rgba(0,85,186,0) ${pct(BLOOM_STOP)}`), layer);
});

test('grain: checkBlooms 拦下非 #RRGGBB 的晕色和空数组', () => {
  let errs = [];
  eq(checkBlooms([], 'x', errs), null);
  ok(/非空/.test(errs[0]), errs[0]);
  errs = [];
  eq(checkBlooms([{ color: 'red', at: [0, 0], weight: 1 }], 'x', errs), null);
  ok(/#RRGGBB/.test(errs[0]), errs[0]);
  errs = [];
  const okList = checkBlooms([{ color: '#00AABB', at: ['0', '1'], weight: '0.5' }], 'x', errs);
  eq(errs, []);
  eq(okList, [{ color: '#00aabb', at: [0, 1], weight: 0.5 }]);
});

// ------------------------------------------------------------- 4. 网格

test('grain: gridLayers 用调用方给的线色，不再硬编码白', () => {
  const g = gridLayers({ color: '#000000', alpha: 0.14, step: 64 });
  eq(g.images.length, 2, '横竖两条');
  ok(g.images[0].includes('rgba(0,0,0,.14) 0 1px'), g.images[0]);
  ok(g.images[0].includes('rgba(0,0,0,0) 1px 100%'), g.images[0]);
  eq(g.sizes, ['64px 64px', '64px 64px']);
});

// -------------------------------------------------- 5. 对比度门（关键）

const FROST = {
  base: '#0c0c0e',
  alpha: 0.90,
  blooms: [
    { color: '#0055ba', at: [0, 0], weight: 1 },
    { color: '#8000e0', at: [1, 0], weight: 1 },
    { color: '#a9007b', at: [0, 1], weight: 1 },
    { color: '#b4003b', at: [1, 1], weight: 1 },
  ],
  grain: 'dark',
  backdrop: '#ffffff',
};

test('grain: 最坏点在四个角上（那里彩晕权重最高）', () => {
  const w = worstCaseContrast(FROST);
  const [x, y] = w.at;
  ok((x === 0 || x === 1) && (y === 0 || y === 1), `最坏点跑到了 (${x},${y})`);
  eq(PROBE_POINTS.length, 9, '九个采样点：四角 + 四边中点 + 中心');
});

test('grain: 暗网格不占亮度预算，白网格要花钱 —— 两态取更坏才看得出区别', () => {
  const bare = worstCaseContrast(FROST).ratio;
  const dark = worstCaseContrast({ ...FROST, grid: { color: '#000000', alpha: 0.14 } }).ratio;
  const white = worstCaseContrast({ ...FROST, grid: { color: '#ffffff', alpha: 0.045 } }).ratio;
  // 白字最坏点落在线与线之间 → 暗网格加不加，最坏值一样
  eq(dark, bare, '暗网格改变了最坏对比度 —— 说明退回只算线上了');
  // 白线反过来：交叉点是全场最亮的地方，最坏值必须掉下来
  ok(white < bare, `白网格没有降低对比度（${white} vs ${bare}），模型是假的`);
  // 而且暗网格的强度可以放心往上加，最坏值不动
  eq(worstCaseContrast({ ...FROST, grid: { color: '#000000', alpha: 0.3 } }).ratio, bare);
});

test('grain: 颗粒在彩晕峰值处是压暗的，所以对比度门不能只算"叠了颗粒"', () => {
  // 噪点中心是 25% 灰（Y≈0.051），比四角的彩晕峰值（Y≈0.10）暗。normal
  // 混合会把底色往中心拽 → 在角上是**压暗**，白送一档对比度。
  const corner = FROST.blooms[3].color;
  const meanY = (h) => {
    const s = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  };
  ok(meanY(grainShift(corner, 'dark')) < meanY(corner),
    '颗粒在彩晕峰值处应该是压暗的');
  // 真按"叠了颗粒"这一种状态算，用户写一句 noise:false 就会跌破门槛。
  // 三态取最坏之后，开不开颗粒结果一样 —— 这正是要守住的性质。
  const gated = worstCaseContrast({ ...FROST, grid: { color: '#000000', alpha: 0.14 } }).ratio;
  const noNoise = worstCaseContrast({
    ...FROST, grain: null, grid: { color: '#000000', alpha: 0.14 },
  }).ratio;
  eq(gated, noNoise, '对比度门依赖了颗粒这层可关的装饰');
  // 反过来在近黑的底上（没有彩晕），颗粒确实是提亮的
  const dark = worstCaseContrast({ base: FROST.base, alpha: FROST.alpha, grain: 'dark' }).ratio;
  const darkBare = worstCaseContrast({ base: FROST.base, alpha: FROST.alpha }).ratio;
  ok(dark < darkBare, `近黑底上颗粒应该提亮（${dark} vs ${darkBare}）`);
});

test('grain: 现行 frost 配色刚好压在 7:1 门槛上，富余不超过 1 档', () => {
  const r = worstCaseContrast({ ...FROST, grid: { color: '#000000', alpha: 0.14 } });
  ok(r.ratio >= MENU_MIN, `只有 ${r.ratio}:1（等效底色 ${r.effective}）`);
  // 天花板的定义就是"再彩一点就跌破 7:1"。富余一大截 = 还有彩度没花出去。
  ok(r.ratio < MENU_MIN + 1, `${r.ratio}:1 富余太多，晕色还能再彩一点`);
});

test('grain: 同样的 7:1 预算，新配色在四角给出 3 倍的色彩跨度', () => {
  // "预算花得好不好"不能用对比度富余量衡量 —— 上一版也贴着门槛。真正的
  // 差别在**同样贴着门槛时拿到了多少颜色**：
  //   · 权重 0.38 把晕色往近黑的底色方向稀释掉大半；
  //   · 琥珀(h75) / 青(h211) 落在天花板最低的两段，本来就没多少彩度可拿。
  const base = over(FROST.base, '#ffffff', FROST.alpha);
  const span = (h) => {
    const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return Math.max(...v) - Math.min(...v);
  };
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const oldSpan = mean(['#b8730a', '#c33a22', '#4a2ec4', '#0d8598']
    .map((c) => span(over(c, base, 0.38))));
  const newSpan = mean(FROST.blooms.map((b) => span(over(b.color, base, b.weight))));
  ok(newSpan > 3 * oldSpan,
    `新配色的色彩跨度只有 ${newSpan.toFixed(0)}，上一版是 ${oldSpan.toFixed(0)}`);
  // 而且两者都真的贴着门槛 —— 不是靠牺牲对比度换来的
  const oldRatio = worstCaseContrast({
    ...FROST,
    blooms: ['#b8730a', '#c33a22', '#4a2ec4', '#0d8598'].map((color, i) => ({
      color, at: [[0, 0], [1, 0], [0, 1], [1, 1]][i], weight: 0.38,
    })),
    grid: { color: '#ffffff', alpha: 0.045 },
  }).ratio;
  ok(oldRatio >= MENU_MIN && oldRatio < MENU_MIN + 1,
    `上一版是 ${oldRatio}:1 —— 两者应当在同一条门槛线上比`);
});

// --------------------------------------------------------------- 6. 小工具

test('grain: grainLift 双向可用 —— 暗底怕颗粒偏亮，浅底怕颗粒偏暗', () => {
  const sdDark = grainStd('dark');
  const sdLight = grainStd('light');
  ok(sdDark > 0 && sdLight > 0, '标准差得是正数');

  // 暗底压白字：吃亏的是颗粒偏亮的那一侧，k 取正
  const dark = grainShift('#242426', 'dark');
  ok(contrast('#ffffff', grainLift('#242426', 'dark', 2)) < contrast('#ffffff', dark),
    'k=+2 应当让白字更难看清');
  // 浅底压深字：吃亏的是颗粒偏暗的那一侧，k 取负
  const light = grainShift('#f2ede3', 'light');
  ok(contrast('#64625d', grainLift('#f2ede3', 'light', -2)) < contrast('#64625d', light),
    'k=-2 应当让淡墨更难看清');
  eq(grainLift('#f2ede3', 'light', 0), light);

  // 两端都得 clamp。负 k 打到 0 以下会算出负数通道，toString(16) 会吐出
  // "-a" 这种非法值，直接把整条 CSS 写坏；正 k 打爆 255 同理。
  for (const hex of [grainLift('#000000', 'light', -40), grainLift('#ffffff', 'dark', 40)]) {
    ok(/^#[0-9a-f]{6}$/.test(hex), `clamp 没兜住：${hex}`);
  }
  eq(grainLift('#000000', 'light', -40), grainLift('#000000', 'light', -80));
});

test('grain: dec 省掉前导 0，pct 保留一位小数', () => {
  eq(dec(0.179), '.179');
  eq(dec(-0.5), '-.5');
  eq(dec(1), '1');
  eq(dec(0.9), '.9');
  eq(pct(1.35), '135%');
  eq(pct(0.62), '62%');
  eq(pct(0.5), '50%');
});

test('grain: over() 的合成顺序和 CSS 一致（后列的在下面）', () => {
  // worstCaseContrast 依赖这个语义：over(上层, 下层, 上层不透明度)
  eq(over('#ffffff', '#000000', 1), '#ffffff');
  eq(over('#ffffff', '#000000', 0), '#000000');
  eq(contrast('#ffffff', '#000000'), 21);
});
