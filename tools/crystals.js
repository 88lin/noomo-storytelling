'use strict';
/**
 * crystals.js — 首页 7 颗水晶的配色与材质。
 *
 * 机制（实测，不是猜的）
 * ======================
 * 引擎默认设置对象 `cie` 里有两个键管水晶：
 *
 *   crystal:       { 25 个键 }      —— 共用基准
 *   crystalHovers: [ 7 × { 25 个键 } ] —— 每颗一组
 *
 * 消费代码在 `class Jh` 的构造函数里：
 *
 *   this.id = e;                                  // "crystal0" … "crystal6"
 *   this.hoverSettings = a;                       // a = crystalHovers[i]
 *   Object.keys(a).forEach(h => {
 *     const d = X.settings.crystal[h];            // 弹簧的**静止值**
 *     d instanceof Re ? this.addColorSpring(h, d.clone(), 20, 10)
 *                     : this.addSpringProvider(h, d, 20, 10);
 *   });
 *
 * 以及 `set isHovered(e)`：
 *
 *   e ? 弹簧目标 = hoverSettings[key]
 *     : 弹簧目标 = X.settings.crystal[key];
 *
 * 也就是说 ——
 *
 *   · `crystal`       = **静止态**，7 颗共用。上游是纯白 + envRefraction:0，
 *                       所以不划过的时候 7 颗都是一样的白色镜面块。
 *   · `crystalHovers` = **悬停态**，逐颗不同。上游那 7 个颜色**只在鼠标划过
 *                       时才出现**，而且移动端根本没有 hover。
 *   · `crystalHovers[i]` 的**键集合**还决定了这颗水晶给哪些参数建弹簧 ——
 *     少一个键 = 那个参数永远停在静止值。上游第 3 颗（索引 2）就少了
 *     `resetDistances`，这里逐条保留原样，不擅自补。
 *
 * 为什么还要再加一个 crystalRests
 * ================================
 * 上面两个键有个结构性的限制：静止态**只有一份**，7 颗共用。所以哪怕把
 * `crystal.baseColor` 从白改成淡蓝，7 颗也还是一模一样的淡蓝 —— 站在页面上
 * 看，跟上游的「7 块白玻璃」没有本质区别，这也正是上一版改完之后仍然被说
 * 「你好像没改吧」的原因：改的是所有人共用的那一份。
 *
 * 真正要的是**逐颗的静止色**。引擎里没有这个键，于是加一个：
 *
 *   crystalRests: { crystal0: {…}, …, crystal6: {…} }
 *
 * 再把上面两处 `X.settings.crystal[k]` 的读取改写成
 *
 *   (X.settings.crystalRests && X.settings.crystalRests[this.id]
 *     || X.settings.crystal)[k]
 *
 * `this.id` 在构造函数里比 hoverSettings 更早赋值，两处 `this` 都是词法绑定
 * 到实例的箭头函数，所以直接可用。`||` 兜底意味着：这个键不存在时行为
 * 逐字节回到上游，`palette:'legacy'` 连补丁都不下。
 *
 * 哪些参数不动
 * ============
 * `distancesFactor / convexityFactor / concavityFactor / uvShiftFactor /
 *  resetDistances / peaksFactor / colorFactor / decayFactor` 一律保持上游数值。
 * 原因：它们直接乘在 glb 里烘焙好的逐顶点属性上
 * （`_peaks / _convexity / _concavity / _thickness`，见顶点着色器
 *  `vThickness = mix(_thickness * distancesFactor, 0.1, resetDistances)` 和
 *  `vCurvature = _convexity * convexityFactor - _concavity * concavityFactor`），
 * 而这 7 个模型的烘焙数据各不相同 —— 原作者是逐颗调出来的，动它们等于
 * 破坏几何观感，而且沙箱里没法验证。
 *
 * `peaksFactor` 尤其要说一句：它**不是**「棱峰锐度」。顶点着色器里写的是
 *
 *   vGlassColor = mix(baseColor, peaksColor, clamp(_peaks * peaksFactor, 0., 1.));
 *
 * 也就是「多大比例的表面读作 peaksColor」。把它调高＝用 peaksColor 盖掉
 * baseColor，恰好和「让 7 颗颜色更分得开」这个目标相反。所以照抄上游。
 *
 * 为什么 baseColor 真的看得见
 * ===========================
 * 片元着色器最后一步是
 *
 *   float decay = exp(-vThickness * decayFactor);
 *   color *= mix(vGlassColor, vec3(1.), decay);
 *
 * 用 draco 解出 crystal0 的顶点属性实测：`_thickness` 中位数 .1705，
 * 静止态 decayFactor 是 20，于是 decay = exp(-.171 × 20) ≈ .033 ——
 * 玻璃色占了 97%，`baseColor` 基本是直接乘上去的。另外 `_peaks` 的中位数
 * 只有 .0064（p90 也才 .1923），所以 `vGlassColor ≈ baseColor`，
 * peaksColor 只在棱线上露一点。
 *
 * 反过来说：明度压到 L≈.55 以下就会发闷（乘法只会变暗）；而明度不够高，
 * 刻面高光也会被一起乘暗。所以静止态那 7 个颜色明度全在 .86–.89，
 * 靠色相和饱和度拉开差别，不靠明暗。
 *
 * 能改的、也确实改了的是纯光学的那一半：颜色、折射率、色散、虹彩、
 * 环境反射/折射比例、边缘光曲线、色彩曲线、亮度上限。
 * （对应的片元着色器：
 *   refraction = refract(V, N, 1./iorStart)，色散再算一条 1./(iorStart+iorDelta)；
 *   color = mix(color, fringeColor, fringeMix * pow(1-|dot(V,N)|, fringeCurve))；
 *   color = (color-luma) * colorBoost + luma；
 *   color *= mix(vGlassColor, vec3(1.), exp(-vThickness * decayFactor))；
 *   color += getEnvColor(reflect(V,N)) * envReflection * fresnel * iridescence；
 *   color = clamp(color, 0., maxColorValue)。）
 *
 * 诚实说明
 * ========
 * 这个玻璃着色器是多通道折射 + 虹彩，沙箱里只有 SwiftShader 软件渲染，
 * **渲不出真实效果**。这里能保证的是数值合法、构建通过、不报错、可一键
 * 回退（palette:'legacy'）；「好不好看」必须在真机上看。
 * 所以给了 5 套预设 + `base` / `items` 两层覆盖 + `npm run dev` 增量构建。
 */

const { isHex6, hexToHsl, hslToHex, hexToInt } = require('./color');
const { suggest } = require('./cssclasses');

// --------------------------------------------------------------- 上游原值
// 从 src/_nuxt/CbdjwYMp.js 里逐字解析出来的（偏移 1567637 / 1568079）。
// serializeBase / serializeHovers 必须能把它们还原成**逐字节相同**的字面量
// —— tools/test/crystals.test.js 直接拿引擎源码对比。

const UPSTREAM_BASE = { baseColor: '#FFFFFF', peaksColor: '#FFFFFF', fringeColor: '#FFFFFF', resetDistances: 0, distancesFactor: 1, iorStart: 1.2, iorDelta: 0.3, uvShiftFactor: 1, envReflection: 1, envRefraction: 0, reflectionIridescence: 0, refractionIridescence: 0, convexityFactor: 1, concavityFactor: 1, peaksFactor: 1, fringeCurve: 5, fringeMix: 1, colorBoost: 2, colorFactor: 2, colorCurve: 1.5, colorCurveR: 1, colorCurveG: 1, colorCurveB: 1, maxColorValue: 25, decayFactor: 20 };

const UPSTREAM_HOVERS = [
  { baseColor: '#FBE687', peaksColor: '#F8ECDE', fringeColor: '#F6EEDB', resetDistances: 0.33, distancesFactor: 22.22, iorStart: 1.3, iorDelta: 0.33, uvShiftFactor: 1.8, envReflection: 0.22, envRefraction: 0.72, reflectionIridescence: 0.16, refractionIridescence: 0.95, convexityFactor: 0.72, concavityFactor: 0.52, peaksFactor: 0.84, fringeCurve: 3.23, fringeMix: 0.83, colorBoost: 0.04, colorFactor: 2.58, colorCurve: 1.37, colorCurveR: 1, colorCurveG: 1.11, colorCurveB: 1.11, maxColorValue: 50, decayFactor: 250 },
  { baseColor: '#87ACFB', peaksColor: '#F8ECDE', fringeColor: '#F6EEDB', resetDistances: 0.33, distancesFactor: 22, iorStart: 1.3, iorDelta: 0.33, uvShiftFactor: 1.8, envReflection: 0.22, envRefraction: 0.72, reflectionIridescence: 0.15, refractionIridescence: 0.95, convexityFactor: 0.72, concavityFactor: 0.52, peaksFactor: 0.84, fringeCurve: 3.23, fringeMix: 0.83, colorBoost: 0.04, colorFactor: 2.58, colorCurve: 1.37, colorCurveR: 1, colorCurveG: 1.11, colorCurveB: 1.11, maxColorValue: 50, decayFactor: 250 },
  { baseColor: '#C2FAC9', peaksColor: '#FEF4F9', fringeColor: '#CBF7E7', distancesFactor: 15, iorStart: 1.33, iorDelta: 3, uvShiftFactor: 3, envReflection: 1, envRefraction: 0.88, reflectionIridescence: 0.47, refractionIridescence: 0.8, convexityFactor: 1, concavityFactor: 0.55, peaksFactor: 0.58, fringeCurve: 2.5, fringeMix: 0.7, colorBoost: 0.27, colorFactor: 2.5, colorCurve: 1.8, colorCurveR: 1.2, colorCurveG: 0.99, colorCurveB: 0.92, maxColorValue: 65, decayFactor: 500 },
  { baseColor: '#FFB0FA', peaksColor: '#E7E2FF', fringeColor: '#D6E1FC', resetDistances: 0, distancesFactor: 6, iorStart: 1.65, iorDelta: 5, uvShiftFactor: 2.14, envReflection: 0.8, envRefraction: 0.75, reflectionIridescence: 0.85, refractionIridescence: 0.75, convexityFactor: 0.22, concavityFactor: 0.67, peaksFactor: 2.67, fringeCurve: 4.8, fringeMix: 0.63, colorBoost: 0.5, colorFactor: 2, colorCurve: 0.72, colorCurveR: 1.14, colorCurveG: 1.11, colorCurveB: 1.16, maxColorValue: 100, decayFactor: 500 },
  { baseColor: '#CBDDD9', peaksColor: '#F9CFE5', fringeColor: '#CDD3DB', resetDistances: 0, distancesFactor: 4.35, iorStart: 1.98, iorDelta: 4, uvShiftFactor: 5, envReflection: 0.52, envRefraction: 0.49, reflectionIridescence: 0.5, refractionIridescence: 0.17, convexityFactor: 0.01, concavityFactor: 0.7, peaksFactor: 1.2, fringeCurve: 2.22, fringeMix: 0.65, colorBoost: 1.33, colorFactor: 2, colorCurve: 0.45, colorCurveR: 1.07, colorCurveG: 1.37, colorCurveB: 0.94, maxColorValue: 35, decayFactor: 50 },
  { baseColor: '#4EDBEF', peaksColor: '#C2C0FF', fringeColor: '#FCFCFC', resetDistances: 0, distancesFactor: 6, iorStart: 1.22, iorDelta: 5, uvShiftFactor: 1, envReflection: 0.68, envRefraction: 0.34, reflectionIridescence: 0.38, refractionIridescence: 0.22, convexityFactor: 0.21, concavityFactor: 0.55, peaksFactor: 2.34, fringeCurve: 3.02, fringeMix: 0.68, colorBoost: 0.3, colorFactor: 2, colorCurve: 1.24, colorCurveR: 0.28, colorCurveG: 1.52, colorCurveB: 1.04, maxColorValue: 100, decayFactor: 350 },
  { baseColor: '#CEF1E2', peaksColor: '#E4DAFF', fringeColor: '#D6EFE2', resetDistances: 0, distancesFactor: 24, iorStart: 1.5, iorDelta: 0.5, uvShiftFactor: 2.86, envReflection: 0.21, envRefraction: 0.95, reflectionIridescence: 0.9, refractionIridescence: 0.88, convexityFactor: 0.73, concavityFactor: 0.56, peaksFactor: 1.77, fringeCurve: 4.51, fringeMix: 0.71, colorBoost: 0.14, colorFactor: 2.58, colorCurve: 1.16, colorCurveR: 1.05, colorCurveG: 1.09, colorCurveB: 0.93, maxColorValue: 100, decayFactor: 450 },
];

const COLOR_KEYS = ['baseColor', 'peaksColor', 'fringeColor'];
const IS_COLOR = new Set(COLOR_KEYS);
const ALL_KEYS = Object.keys(UPSTREAM_BASE);
const KEY_SET = new Set(ALL_KEYS);
const COUNT = UPSTREAM_HOVERS.length;   // 7 —— 引擎用它决定案例热区数量

// 引擎里 `new Jh({id:"crystal"+e, …})`，所以 id 就是这 7 个字符串。
const IDS = Array.from({ length: COUNT }, (_, i) => `crystal${i}`);

// ------------------------------------------------------------- 序列化
// 输出必须长得像压缩产物：`.33` 而不是 `0.33`，颜色写成 `new Re(十进制)`。

/** 按 terser 的习惯格式化数字：去掉 `0.` 的前导 0。 */
function num(n) {
  let t = String(n);
  if (t.startsWith('0.')) t = `.${t.slice(2)}`;
  else if (t.startsWith('-0.')) t = `-.${t.slice(3)}`;
  return t;
}

/** 两位小数，并去掉 `1.00` 这种多余的尾零。 */
const r2 = (v) => Math.round(v * 100) / 100;

function serializeObj(o) {
  const body = Object.keys(o).map((k) => {
    const v = o[k];
    return `${k}:${IS_COLOR.has(k) ? `new Re(${hexToInt(v)})` : num(v)}`;
  }).join(',');
  return `{${body}}`;
}

const serializeHovers = (list) => `[${list.map(serializeObj).join(',')}]`;

/** 7 条静止态 → `{crystal0:{…},…,crystal6:{…}}`，键名对齐引擎里的 this.id。 */
const serializeRests = (list) =>
  `{${list.map((o, i) => `${IDS[i]}:${serializeObj(o)}`).join(',')}}`;

// 锚点用的上游字面量。由同一个序列化器生成 —— 万一它和上游对不上，
// applyAnchors 会因为 expect:1 落空而报错，不会静默改错地方。
const FIND_BASE = `crystal:${serializeObj(UPSTREAM_BASE)}`;
const FIND_HOVERS = `crystalHovers:${serializeHovers(UPSTREAM_HOVERS)}`;

// 两处「读静止值」的原文。改写成先查 crystalRests[this.id]，查不到再回落
// 到共用的 crystal —— 所以没有这个键的时候行为和上游一字不差。
const REST_LOOKUP = '(X.settings.crystalRests&&X.settings.crystalRests[this.id]||X.settings.crystal)';
const FIND_READ_INIT = 'const d=X.settings.crystal[h];d instanceof Re';
const NEXT_READ_INIT = `const d=${REST_LOOKUP}[h];d instanceof Re`;
const FIND_READ_RESET = 'const i=X.settings.crystal[t];i instanceof Re';
const NEXT_READ_RESET = `const i=${REST_LOOKUP}[t];i instanceof Re`;

// ------------------------------------------------------------- 配色工具

/** 色相环上取色，返回 #RRGGBB。h 允许超出 [0,360)，自动取模。 */
const tint = (h, s, l) => hslToHex(((h % 360) + 360) % 360, s, l);

/** derive() 的默认口径：悬停态用。 */
const HOVER_TINT = { ps: 0.72, pl: 0.93, fs: 0.60, fl: 0.88 };
/**
 * 静止态用。明度顶得很高（pl .98）、棱峰几乎不着色（ps .18）——
 * 因为 glass.frag 里底色是**乘上去**的（color *= mix(vGlassColor, 1., decay)，
 * decay = exp(-thickness * decayFactor)，decayFactor 20 已经把 decay 压到 0，
 * 也就是满额着色）。底色一深，刻面高光就被一起乘暗，水晶会糊成一层塑料漆：
 * 离屏预览台实测亮度动态范围 lumSpread 从上游白玻璃的 81 掉到 36，
 * 高光像素占比从 .54 掉到 .26。抬明度是唯一能同时保住色相和"晶"感的轴。
 * 实测口径与偏差声明见 PR #3 正文。
 */
const REST_TINT = { ps: 0.18, pl: 0.98, fs: 0.60, fl: 0.86 };

/**
 * 由主色派生棱峰高光与边缘光。
 *
 * 规则：棱峰沿色轮 **+34°**、边缘光 **−26°**，两侧都提亮压饱和。
 * 这不是物理色散（色轮不是波长轴，品红根本不在光谱上），纯粹是观感取舍：
 * 同一颗上出现三个相邻色相，转动时边缘会读出「彩边」，也就是虹彩感。
 * 上游其实也是这个路子 —— 第 4 颗主色 #FFB0FA（304°）配了 248° 的棱峰
 * 和 220° 的边缘光，只是每颗的偏移量都不一样。
 *
 * @param {string} base #RRGGBB 主色
 * @param {{ps:number,pl:number,fs:number,fl:number}} t 棱峰/边缘的饱和度与明度
 */
function derive(base, t = HOVER_TINT) {
  const [h] = hexToHsl(base);
  return {
    peaksColor: tint(h + 34, t.ps, t.pl),
    fringeColor: tint(h - 26, t.fs, t.fl),
  };
}

const toward = (v, t, k) => v + (t - v) * k;

// ------------------------------------------------------------------ 预设

/**
 * 预设结构
 *   hues      7 个色相
 *   sat       悬停态饱和度（数字 = 7 颗统一，数组 = 逐颗）
 *   light     悬停态明度（同上）
 *   restSat   **可选**。给了就逐颗生成静止色，写进 crystalRests
 *   restLight **可选**，同上。两个要么都给要么都不给
 *   rest      静止态 `crystal` 的覆盖项（7 颗共用的那一份 / 回落值）
 *   hover     悬停态的逐参数变换 (upstreamValue, index) => newValue
 */
const PALETTES = {
  // 棱镜 —— 默认。唯一一个**静止态就逐颗给色**的预设。
  //
  // 色相沿暖到冷走一圈：金 38° → 珊瑚 12° → 玫瑰 330° → 紫 286° →
  // 靛 224° → 青 188° → 薄荷 152°。相邻间隔 26°–38°，在多通道折射糊过
  // 一层之后仍然分得开；顺序是单调的，7 颗横排过去像一道分光。
  //
  // 明度静止 .86–.89 / 悬停 .77–.80 —— 见文件头「为什么 baseColor 真的
  // 看得见」：玻璃色是乘上去的，静止态压暗会把刻面高光一起乘没。
  // 饱和度静止 .64–.74、悬停 .80–.88，所以划过去那一下是「同一个色相
  // 突然浓起来」，不是换个颜色，读起来才像同一块玻璃被点亮。
  prism: {
    label: '棱镜',
    hues: [38, 12, 330, 286, 224, 188, 152],
    sat: [0.88, 0.86, 0.84, 0.80, 0.84, 0.86, 0.82],
    light: [0.78, 0.79, 0.80, 0.80, 0.78, 0.77, 0.78],
    // 静止态：高饱和 + 高明度 = 「淡染的白」，而不是「浅色漆」。
    // 见 REST_TINT 注释：离屏预览台实测，抬明度才保得住刻面高光。
    restSat: [0.74, 0.72, 0.68, 0.64, 0.70, 0.72, 0.66],
    restLight: [0.86, 0.87, 0.89, 0.89, 0.87, 0.86, 0.88],
    rest: {
      // 这一份是**回落值**：crystalRests 里查不到时才用（正常跑不到）。
      // 取象牙白，和加载页的纸色同一家族，不至于突兀。
      baseColor: '#F3F1EC',
      peaksColor: '#FFFFFF',
      fringeColor: '#E7E2D8',
      // 静止态也得是玻璃：上游 envRefraction 是 0，等于纯镜面铬块。
      envReflection: 0.94,
      envRefraction: 0.30,
      reflectionIridescence: 0.18,
      refractionIridescence: 0.14,
      iorStart: 1.30,
      iorDelta: 0.45,
      fringeCurve: 4.2,
      fringeMix: 0.92,
      colorBoost: 1.45,
      colorCurve: 1.28,
      maxColorValue: 34,
    },
    hover: {
      envReflection: (v) => r2(toward(v, 1, 0.34)),
      envRefraction: (v) => r2(toward(v, 1, 0.22)),
      reflectionIridescence: (v) => r2(toward(v, 1, 0.4)),
      refractionIridescence: (v) => r2(toward(v, 1, 0.28)),
      fringeCurve: (v) => r2(toward(v, 5, 0.24)),
      fringeMix: (v) => r2(v * 0.94),
      colorCurve: (v) => r2(toward(v, 1, 0.6)),
      colorCurveR: (v) => r2(toward(v, 1, 0.6)),
      colorCurveG: (v) => r2(toward(v, 1, 0.6)),
      colorCurveB: (v) => r2(toward(v, 1, 0.6)),
      colorBoost: (v) => r2(Math.min(1.7, v * 1.5 + 0.16)),
      maxColorValue: (v) => Math.min(150, Math.round(v * 1.3)),
      // 折射率排成一条梯子（1.24 → 1.60，覆盖水玻璃到铅玻璃），
      // 7 颗读起来是 7 种材质而不是同一块玻璃染了 7 个色。
      // 上游第 5 颗写的是 1.98，比钻石（2.42）还离谱，这里拉回现实区间。
      iorStart: (v, i) => r2(1.24 + i * 0.06),
      // 色散：上游是两极分化的（.33 / .33 / 3 / 5 / 4 / 5 / .5），
      // 只把偏低的几颗抬上来，本来就高的保持不变。
      iorDelta: (v, i) => r2(Math.max(v, 1.2 + i * 0.35)),
    },
  },

  // 极光虹彩 —— 静止态 7 颗共用一个冷调白。想要「安静一点、悬停才炸」
  // 就用它。色相弧和 jewel 共用。
  aurora: {
    label: '极光虹彩',
    hues: [45, 222, 138, 312, 265, 186, 96],
    sat: 0.82,
    light: [0.72, 0.76, 0.76, 0.80, 0.78, 0.70, 0.74],
    rest: {
      baseColor: '#EEF4FF',
      peaksColor: '#FFFFFF',
      fringeColor: '#DCE7FF',
      envReflection: 0.92,
      envRefraction: 0.22,
      reflectionIridescence: 0.12,
      refractionIridescence: 0.1,
      iorStart: 1.28,
      iorDelta: 0.42,
      colorCurve: 1.3,
      maxColorValue: 34,
    },
    hover: {
      envReflection: (v) => r2(toward(v, 1, 0.32)),
      envRefraction: (v) => r2(toward(v, 1, 0.18)),
      reflectionIridescence: (v) => r2(toward(v, 1, 0.38)),
      refractionIridescence: (v) => r2(toward(v, 1, 0.25)),
      fringeCurve: (v) => r2(toward(v, 5, 0.22)),
      fringeMix: (v) => r2(v * 0.94),
      colorCurve: (v) => r2(toward(v, 1, 0.6)),
      colorCurveR: (v) => r2(toward(v, 1, 0.6)),
      colorCurveG: (v) => r2(toward(v, 1, 0.6)),
      colorCurveB: (v) => r2(toward(v, 1, 0.6)),
      colorBoost: (v) => r2(Math.min(1.6, v * 1.5 + 0.12)),
      maxColorValue: (v) => Math.min(150, Math.round(v * 1.3)),
      iorStart: (v, i) => r2(1.24 + i * 0.06),
      iorDelta: (v, i) => r2(Math.max(v, 1.2 + i * 0.35)),
    },
  },

  // 统一冰蓝 —— 最贴品牌。7 颗都在 184°–218° 的窄带里，靠明度区分，
  // 虹彩压低、反射拉高，读起来是同一块冰的 7 个切面。
  // 这个预设**故意**不给 restSat/restLight：整体感是它的卖点。
  ice: {
    label: '冰蓝',
    hues: [206, 214, 190, 218, 198, 184, 210],
    sat: 0.5,
    light: [0.86, 0.78, 0.82, 0.72, 0.88, 0.68, 0.8],
    rest: {
      baseColor: '#EAF6FF',
      peaksColor: '#FFFFFF',
      fringeColor: '#CFE6FF',
      envReflection: 0.96,
      envRefraction: 0.18,
      reflectionIridescence: 0.08,
      refractionIridescence: 0.06,
      iorStart: 1.31,
      iorDelta: 0.35,
      colorCurve: 1.35,
      maxColorValue: 30,
    },
    hover: {
      envReflection: (v) => r2(toward(v, 1, 0.42)),
      envRefraction: (v) => r2(toward(v, 1, 0.28)),
      reflectionIridescence: (v) => r2(v * 0.55),
      refractionIridescence: (v) => r2(v * 0.55),
      fringeCurve: (v) => r2(toward(v, 5, 0.35)),
      fringeMix: (v) => r2(v * 0.9),
      colorCurve: (v) => r2(toward(v, 1, 0.75)),
      colorCurveR: (v) => r2(toward(v, 1, 0.75)),
      colorCurveG: (v) => r2(toward(v, 1, 0.75)),
      colorCurveB: (v) => r2(toward(v, 1, 0.75)),
      colorBoost: (v) => r2(Math.min(1.2, v * 1.2 + 0.1)),
      maxColorValue: (v) => Math.round(v * 1.15),
      iorStart: (v, i) => r2(1.3 + i * 0.03),
      iorDelta: (v) => r2(Math.min(v, 2)),   // 低色散 = 干净的冰
    },
  },

  // 深色宝石 —— 和 aurora 同一条色相弧，但压到 L≈0.48、S≈0.88。
  // 主体是深色，靠棱峰和边缘光把切面打亮，反差最大。
  jewel: {
    label: '宝石',
    hues: [45, 222, 138, 312, 265, 186, 96],
    sat: 0.88,
    light: [0.5, 0.52, 0.46, 0.54, 0.5, 0.48, 0.46],
    restSat: [0.42, 0.44, 0.40, 0.46, 0.42, 0.44, 0.40],
    restLight: [0.62, 0.64, 0.60, 0.66, 0.62, 0.64, 0.60],
    rest: {
      baseColor: '#F2EFFF',
      peaksColor: '#FFFFFF',
      fringeColor: '#E4DAFF',
      envReflection: 0.88,
      envRefraction: 0.28,
      reflectionIridescence: 0.18,
      refractionIridescence: 0.14,
      iorStart: 1.45,
      iorDelta: 0.6,
      colorCurve: 1.2,
      // 深色本体在多通道折射里容易发闷，静止态就得把 boost 抬起来。
      colorBoost: 1.8,
      maxColorValue: 44,
    },
    hover: {
      envReflection: (v) => r2(toward(v, 1, 0.2)),
      envRefraction: (v) => r2(toward(v, 1, 0.4)),
      reflectionIridescence: (v) => r2(toward(v, 1, 0.3)),
      refractionIridescence: (v) => r2(toward(v, 1, 0.4)),
      fringeCurve: (v) => r2(toward(v, 5, 0.15)),
      fringeMix: (v) => r2(Math.min(1, v * 1.1)),
      colorCurve: (v) => r2(toward(v, 1, 0.45)),
      colorCurveR: (v) => r2(toward(v, 1, 0.45)),
      colorCurveG: (v) => r2(toward(v, 1, 0.45)),
      colorCurveB: (v) => r2(toward(v, 1, 0.45)),
      colorBoost: (v) => r2(Math.min(2.4, v * 2 + 0.3)),
      maxColorValue: (v) => Math.min(200, Math.round(v * 1.6)),
      iorStart: (v, i) => r2(1.45 + i * 0.05),
      iorDelta: (v, i) => r2(Math.max(v, 2 + i * 0.3)),
    },
  },
};

const PALETTE_NAMES = [...Object.keys(PALETTES), 'legacy', 'custom'];

const CRYSTAL_DEFAULTS = { palette: 'prism', base: {}, items: [] };

/**
 * 展开某个预设 → `{ base, rests, hovers }`（均为 hex + 数字，尚未序列化）。
 * `rests` 为 null 表示这个预设不逐颗给静止色，7 颗共用 `base`。
 */
function expand(name) {
  const p = PALETTES[name];
  const base = Object.assign({}, UPSTREAM_BASE, p.rest);
  const at = (v, i) => (Array.isArray(v) ? v[i] : v);

  const perRest = p.restSat !== undefined && p.restLight !== undefined;
  const rests = !perRest ? null : p.hues.map((h, i) => {
    const baseColor = tint(h, at(p.restSat, i), at(p.restLight, i));
    // 静止态给满 25 个键：引擎按 hoverSettings 的键集合建弹簧，读的是
    // 静止对象里的同名值，缺一个就会读到 undefined。
    return Object.assign({}, base, { baseColor }, derive(baseColor, REST_TINT));
  });

  const hovers = UPSTREAM_HOVERS.map((up, i) => {
    const out = {};
    const baseColor = tint(at(p.hues, i), at(p.sat, i), at(p.light, i));
    const d = derive(baseColor, HOVER_TINT);
    // 逐条保留上游的键集合与键顺序 —— 键集合决定这颗给哪些参数建弹簧。
    for (const k of Object.keys(up)) {
      if (k === 'baseColor') out[k] = baseColor;
      else if (k === 'peaksColor') out[k] = d.peaksColor;
      else if (k === 'fringeColor') out[k] = d.fringeColor;
      else if (p.hover[k]) out[k] = p.hover[k](up[k], i);
      else out[k] = up[k];
    }
    return out;
  });
  return { base, rests, hovers };
}

// ------------------------------------------------------------------ 校验

/**
 * 校验一层覆盖对象，把合法项写进 target。
 * @param {object} patch  用户写的覆盖
 * @param {object} target 就地修改
 * @param {string} where  报错时显示的路径
 * @param {string[]} errors
 */
function applyPatch(patch, target, where, errors) {
  if (patch === undefined || patch === null) return;
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    errors.push(`${where}: 需要一个对象，实际拿到 ${JSON.stringify(patch)}`);
    return;
  }
  for (const k of Object.keys(patch)) {
    if (!KEY_SET.has(k)) {
      const tip = suggest(k, ALL_KEYS);
      errors.push(`${where}.${k}: 未知参数${tip.length ? `，是不是想写 ${tip.join(' / ')}？` : ''}`);
      continue;
    }
    const v = patch[k];
    if (IS_COLOR.has(k)) {
      if (!isHex6(v)) {
        errors.push(`${where}.${k}: ${JSON.stringify(v)} 不是 #RRGGBB 写法`);
        continue;
      }
      target[k] = v.trim().toUpperCase();
    } else {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push(`${where}.${k}: 需要一个数字，实际拿到 ${JSON.stringify(v)}`);
        continue;
      }
      target[k] = v;
    }
  }
}

/**
 * items[i] 支持两种写法：
 *   { iorStart: 1.4 }                    —— 老写法，整条当悬停态补丁
 *   { rest: {…}, hover: {…} }            —— 分开写静止态和悬停态
 * 两个键名都不是合法参数名，所以不会有歧义。
 */
function splitItem(patch, where, errors) {
  if (patch === undefined || patch === null) return { rest: null, hover: null };
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    errors.push(`${where}: 需要一个对象，实际拿到 ${JSON.stringify(patch)}`);
    return { rest: null, hover: null };
  }
  const keys = Object.keys(patch);
  if (!keys.includes('rest') && !keys.includes('hover')) {
    return { rest: null, hover: patch };
  }
  for (const k of keys) {
    if (k !== 'rest' && k !== 'hover') {
      errors.push(`${where}.${k}: 一旦用了 rest / hover 分组写法，`
        + '其余参数就得放进这两个组里，不能和它们平级');
    }
  }
  return { rest: patch.rest || null, hover: patch.hover || null };
}

/** 预设的中文名，只给构建摘要看。legacy / custom 不在 PALETTES 里，单独兜底。 */
function labelOf(name) {
  if (PALETTES[name]) return PALETTES[name].label;
  if (name === 'legacy') return '上游原样';
  if (name === 'custom') return '自定义';
  return String(name);
}

/**
 * @param {object} scene  原始 config/scene.js
 * @returns {{anchors:object[], errors:string[], warnings:string[],
 *            palette:string, label:string, colors:string[],
 *            restColors:string[]}}
 */
function buildCrystals(scene) {
  const errors = [];
  const warnings = [];
  const raw = (scene && scene.crystals) || {};
  const bail = (p) => ({
    anchors: [], errors, warnings, palette: p, label: labelOf(p), colors: [], restColors: [],
  });

  for (const k of Object.keys(raw)) {
    if (!['palette', 'base', 'items'].includes(k)) {
      errors.push(`scene.crystals: 未知字段 "${k}"（只能是 palette / base / items）`);
    }
  }

  const palette = raw.palette === undefined ? CRYSTAL_DEFAULTS.palette : raw.palette;
  if (!PALETTE_NAMES.includes(palette)) {
    errors.push(`scene.crystals.palette: 未知取值 ${JSON.stringify(palette)}`
      + `（可选: ${PALETTE_NAMES.join(', ')}）`);
    return bail(palette);
  }

  const items = raw.items === undefined ? [] : raw.items;
  if (!Array.isArray(items)) {
    errors.push(`scene.crystals.items: 需要一个数组，实际拿到 ${JSON.stringify(items)}`);
    return bail(palette);
  }
  // 引擎用 crystalHovers.length 决定案例热区数量（`for (let e=0; e<
  // X.settings.crystalHovers.length; e++)`），多一条少一条都会和 7 个案例错位。
  if (items.length !== 0 && items.length !== COUNT) {
    errors.push(`scene.crystals.items: 要么留空，要么恰好 ${COUNT} 条`
      + `（引擎用它的长度决定案例热区数量），实际 ${items.length} 条`);
    return bail(palette);
  }
  if (palette === 'custom' && items.length !== COUNT) {
    errors.push(`scene.crystals.palette 设成 'custom' 时，items 必须给满 ${COUNT} 条`);
    return bail(palette);
  }

  // legacy / custom 都从上游原值起步；custom 靠 items 逐条改，
  // legacy 不叠加任何东西 —— 于是它连补丁都不下，产物逐字节等于上游。
  const start = (palette === 'legacy' || palette === 'custom')
    ? {
      base: Object.assign({}, UPSTREAM_BASE),
      rests: null,
      hovers: UPSTREAM_HOVERS.map((o) => Object.assign({}, o)),
    }
    : expand(palette);

  // 先把共用静止态定下来（预设 + 用户的 base 覆盖），逐颗静止态从它派生 ——
  // 这样 scene.crystals.base 里写的光学参数会同时作用到 7 颗身上，
  // 只有颜色是逐颗的。
  applyPatch(raw.base, start.base, 'scene.crystals.base', errors);
  if (start.rests) {
    start.rests = start.rests.map((r) => Object.assign({}, start.base, {
      baseColor: r.baseColor, peaksColor: r.peaksColor, fringeColor: r.fringeColor,
    }));
  }

  const split = items.map((patch, i) => splitItem(patch, `scene.crystals.items[${i}]`, errors));

  // 用户给了逐颗静止色，但预设本身不逐颗 —— 现场把 7 份补出来。
  if (!start.rests && split.some((s) => s.rest)) {
    start.rests = IDS.map(() => Object.assign({}, start.base));
  }

  split.forEach((s, i) => {
    if (s.rest && start.rests) {
      applyPatch(s.rest, start.rests[i], `scene.crystals.items[${i}].rest`, errors);
    }
    if (!s.hover) return;
    if (typeof s.hover === 'object' && !Array.isArray(s.hover)) {
      for (const k of Object.keys(s.hover)) {
        if (KEY_SET.has(k) && !(k in start.hovers[i])) {
          warnings.push(`scene.crystals.items[${i}].${k}: 上游第 ${i + 1} 颗本来没有这个键，`
            + '加上它会多给这个参数建一根弹簧（静止值取静止态里的同名值）。'
            + '确认这是你要的效果再留着。');
        }
      }
    }
    applyPatch(s.hover, start.hovers[i], `scene.crystals.items[${i}]`, errors);
  });

  const colors = start.hovers.map((h) => h.baseColor);
  const restColors = start.rests ? start.rests.map((r) => r.baseColor) : [];
  if (errors.length) {
    return { anchors: [], errors, warnings, palette, label: labelOf(palette), colors, restColors };
  }

  const nextBase = `crystal:${serializeObj(start.base)}`
    + (start.rests ? `,crystalRests:${serializeRests(start.rests)}` : '');
  const nextHovers = `crystalHovers:${serializeHovers(start.hovers)}`;

  // 和上游一模一样就不下补丁 —— 否则构建摘要会虚报改动数。
  const anchors = [];
  if (nextBase !== FIND_BASE) {
    anchors.push({
      key: 'crystals.base', file: 'engine', find: FIND_BASE, replace: nextBase, expect: 1,
    });
  }
  if (nextHovers !== FIND_HOVERS) {
    anchors.push({
      key: 'crystals.hovers', file: 'engine', find: FIND_HOVERS, replace: nextHovers, expect: 1,
    });
  }
  // 只有真的写了 crystalRests 才去改引擎的读取路径。两处一起改，
  // 少改一处会导致「悬停回来之后颜色跳成共用色」。
  if (start.rests) {
    anchors.push({
      key: 'crystals.restLookup.init', file: 'engine',
      find: FIND_READ_INIT, replace: NEXT_READ_INIT, expect: 1,
    });
    anchors.push({
      key: 'crystals.restLookup.reset', file: 'engine',
      find: FIND_READ_RESET, replace: NEXT_READ_RESET, expect: 1,
    });
  }

  return { anchors, errors, warnings, palette, label: labelOf(palette), colors, restColors };
}

module.exports = {
  buildCrystals,
  expand,
  serializeObj,
  serializeHovers,
  serializeRests,
  derive,
  num,
  CRYSTAL_DEFAULTS,
  PALETTES,
  PALETTE_NAMES,
  UPSTREAM_BASE,
  UPSTREAM_HOVERS,
  FIND_BASE,
  FIND_HOVERS,
  FIND_READ_INIT,
  NEXT_READ_INIT,
  FIND_READ_RESET,
  NEXT_READ_RESET,
  REST_LOOKUP,
  HOVER_TINT,
  REST_TINT,
  ALL_KEYS,
  IDS,
  COUNT,
};
