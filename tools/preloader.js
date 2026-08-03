'use strict';
/**
 * preloader.js — 重做首屏加载页：象牙纸 + 墨黑瑞士排印 + 真实加载百分比。
 *
 * 上游长什么样
 * -------------
 * 一片 45° 的淡紫渐变（#cebdf8 → #e2dbf8），正中间一个 50×45 的 loader.gif
 * （67×60、18 帧、5KB）。问题不是"丑"，是**空**和**没有反馈**：
 * 站内最大的资源 v20.glb 有 4.3MB，慢网下要等很久，而屏幕上没有任何东西
 * 告诉用户"还要多久"。
 *
 * 改成什么样（style: 'editorial'，默认）
 * --------------------------------------
 * 一张象牙色的纸（#f2ede3），左上角一枚墨黑标识，中间一个**巨大的衬线斜体
 * 数字**（TheSeasons italic，最大 460px），下面一条发丝线和一行疏排小字。
 * 版面靠左对齐、不居中，靠字号落差（460px : 11px ≈ 42 倍）撑起层次。
 *
 * 这里有个一石二鸟的地方：**数字本身就是进度条**。`.ns-pre-val` 用
 * background-clip:text 把一条 90° 渐变裁进字形里，渐变的分界点绑在
 * --ns-pre-p 上 —— 加载到 47% 时，"47"这两个字左边 47% 是墨黑、右边是淡墨。
 * 底下那条发丝线是同一个变量驱动的第二重读数，给渐变不生效的浏览器兜底。
 *
 * 为什么不接着用深蓝渐变（style: 'progress'，保留为备选）
 * -------------------------------------------------------
 * 上一版加载页和移动端菜单用了**完全相同**的三个蓝 + 相同的光斑色 + 相同的
 * 手法（线性渐变打底 + 径向光斑 + 噪点）。同一个站里两处大面积色块长得一模
 * 一样，既没有记忆点，也是典型的"默认审美"。现在两边刻意分家：加载页走浅色
 * 纸张排印，菜单走墨玻璃（tools/menu.js 的 ink 预设）。深蓝那套降级成
 * style:'progress'，想要仍然可以配回去。
 *
 * 揭幕动画沿用上游那个圆形遮罩（--reveal-radius 从 0vmax 推到 200vmax）。
 *
 * 三处必须严格同步
 * -----------------
 *   1. src/index.html 里的 SSR 首帧标记 —— 浏览器最先画出来的就是它
 *   2. 引擎 chunk 里 Preloader 的渲染函数（静态 vnode 数组）
 *   3. 两者的 DOM 结构、标签顺序、文本内容必须逐字一致
 *
 * 对不上会怎样：Vue hydration 走到不一致的节点会走 mismatch 分支，轻则首帧
 * 闪一下旧样式，重则把我们的节点整棵换掉。所以这里的做法是 **同一棵节点树
 * 描述（NODES），两个渲染器（toHtml / toVnode）**，从源头上不给它们跑偏的
 * 机会，再由 preloader.test.js 逐字断言两边结构一致。
 *
 * 为什么用静态 vnode + 命令式写 DOM
 * -----------------------------------
 * 上游的渲染函数把 .wrapper 的子树缓存成了静态 vnode（patch flag -1，存在
 * 渲染缓存 u[0] 里），Vue 之后不会再 patch。要让数字动起来有两条路：
 *   (a) 改成动态节点 —— 得同时改渲染函数、SSR 标记、响应式依赖，风险最大；
 *   (b) 保持静态，进度由订阅回调直接写 textContent / CSS 变量。
 * 选 (b)。每帧两次 DOM 写入，代价可以忽略，而且完全绕开了 hydration 的坑。
 */
const fs = require('fs');
const path = require('path');
const {
  isHex6, rgba, fade, over, contrast,
} = require('./color');
const { grainRule, grainLift } = require('./grain');

/**
 * 上游编译产物里 Preloader 的 scoped 属性。
 * 它同时出现在补丁锚点的 find 串里，所以上游哪天换了构建、这个 id 变了，
 * 构建会在锚点校验那一步直接报错 —— 这正是我们要的行为。
 */
const SCOPE = 'data-v-724e2fc4';

const STYLES = new Set(['editorial', 'progress', 'legacy']);

/**
 * 进度数字用哪套字。
 *
 *   sans     无衬线（TTNeoris，站内正文字体）。默认。
 *   display  衬线斜体（TheSeasons）。⚠ 见下方 DEMO_GLYPHS 的说明。
 */
const NUMERALS = new Set(['sans', 'display']);

/**
 * 为什么默认不是那套好看的衬线斜体。
 *
 * 仓库里捆的 fonnts.com-theseasons-it.otf 是**试用版**，name[1] 写着
 * "FSP DEMO - The Seasons"。试用版的惯常做法是把若干字形换成水印，这一份
 * 换的就是数字 4：拆开 OTF 数一遍轮廓，0~9 里其余九个数字都是 1~3 条轮廓、
 * 12~22 个点，只有 `4` 是 **9 条轮廓 79 个点**，而且 bounds 的 y 从 73 起
 * （其它数字全部落在基线 0 上）—— 那不是一个 4，是一朵花瓣加一行 DEMO。
 *
 * 后果：进度只要走到含 4 的值（4、14、24、34、40~49、54、64、74、84、94，
 * 一共 19 个），整屏最大的那个字就变成水印。这不是审美问题，是加载页每次
 * 都会当着用户的面翻的车。
 *
 * 试过但不成立的绕法：
 *   · unicode-range 把 `4` 单独踢给下一个 family —— 会出现"衬线斜体 1 +
 *     无衬线 4"的混排，比水印更难看。
 *   · local() 换系统衬线 —— 装没装、装的哪一版都不可控。
 *   · 构建期改字体二进制 —— 改的是别人的试用版，授权状况反而更糟。
 *
 * 所以默认换成无衬线。想要衬线斜体就显式写 numerals:'display'，构建会给一
 * 条告警提醒你先换成正版授权的字体文件。
 */
const DEMO_GLYPHS = 'fonnts.com-theseasons-it';

const PRELOADER_DEFAULTS = {
  style: 'editorial',
  // editorial 用这两个：纸色和墨色。
  paper: '#f2ede3',
  ink: '#14120f',
  // editorial 独有：进度数字用哪套字。见 NUMERALS / DEMO_GLYPHS。
  numerals: 'sans',
  // progress 用这三个。
  background: ['#00276e', '#143a8a', '#062969'],
  accent: '#88aeff',
  glow: ['#4edbef', '#6248a4'],
  // 三种样式共用。
  mark: 'src/images/svg/logoSimple.svg',
  markInvert: 'auto',
  showPercent: true,
  tip: '正在加载沉浸式体验',
  revealDuration: 2,
};

/**
 * 纸色和墨色之间至少要有的对比度。7:1 = WCAG AAA 正文线。
 * 加载页整屏就这么点字，配一组看不清的纸墨没有任何理由，所以卡在 AAA
 * 而不是 AA，而且**不达标直接报错**，不降级、不告警。
 */
const PAPER_INK_MIN = 7;

/**
 * 小字（百分号、提示语）对纸的对比度下限。
 *
 * 提示语是 11px —— WCAG 里这属于「正文」，不是「大号文字」，AA 线就是 4.5:1。
 * 上一版这里是 3:1，那是**大号文字**的线，套在 11px 疏排的中文小字上是错的：
 * 实测解出来的淡墨 #8c8881 对象牙纸只有 3.02:1，弱视用户基本读不到。
 */
const FAINT_TEXT_MIN = 4.5;

/**
 * 数字未填充那一半对纸的对比度下限。
 *
 * 这一半的字号下限是 72px，实际常在 200~420px，稳稳落在 WCAG 的「大号文字」
 * 里，线是 3:1。故意和小字分开解：填充/未填充两半的明度差就是进度读数，
 * 把未填充那半也拉到 4.5:1 会让两半几乎一样黑，进度就看不出来了。
 */
const FAINT_NUM_MIN = 3;

/**
 * editorial 数字四周补的 padding，单位 em，跟着字号缩放。
 *
 * 用途不是留白，是给 background-clip:text 的底图留出斜体字形挑到盒子外面
 * 的那几截 —— 详见 cssEditorial() 里那段注释。
 *
 * 数值是量出来的，不是拍的：真实页面上把数字改成纯墨实心字（不裁），
 * 1600×900（字号 378px，dsf 2）与 390×844（字号 179px，dsf 3）两档逐列
 * 数墨迹，再和内容盒四边相减，单位 em ——
 *
 *     右挑  7 .174 ┃ 5 .111 ┃ 1 .099 ┃ 9 .081 ┃ 0 .074 ┃ 8 .073 ┃ 3 .057
 *     左挑  5 .079 ┃ 2 .066 ┃ 3 .053 ┃ 其余 ≤ .006（4/6/7/9 是负的）
 *     上挑  .016（所有数字一样）；下边不挑，最高的 4 也还差 .216em 到底
 *
 * 各留一点余量取整。x 是左右两边之和，换算渐变分界点时要用。
 */
const PAD = { top: '.02em', right: '.18em', left: '.08em', x: '.26em' };

/**
 * 渐变分界点：把 0~1 的进度映射到"字形左缘 ~ 字形右缘"。
 *
 *   盒宽 100% = 左padding + 字宽 + 右padding，所以
 *   字宽 = 100% − PAD.x，分界点 = 左padding + 进度 × 字宽 —— 这是主项，
 *   保证 50% 时墨色正好吃掉半个字，不快也不慢。
 *
 * 两头各加一段 4% 的补偿，专门伺候挑出盒外的那点笔画：
 *   · 开头 min(1, p×25)：p=0 时分界点必须是 0，否则左挑那截（"5" 的
 *     .079em）会在整字还是淡墨时先黑一块。
 *   · 收尾 clamp(0, (p−.96)×25, 1)：p=1 时分界点必须落到盒子右缘之外，
 *     否则末位 7 的那条尾巴到 100% 还是淡的。
 * 两段都单调递增，中间 4%~96% 是严格线性，肉眼只会看到均匀推进。
 */
const CUT = `calc(min(1,var(--ns-pre-p,0)*25)*${PAD.left}`
  + ` + var(--ns-pre-p,0)*(100% - ${PAD.x})`
  + ` + clamp(0,(var(--ns-pre-p,0) - .96)*25,1)*${PAD.right})`;

/**
 * 分界点两侧各羽化多少（em，跟着字号缩放）。
 *
 * 上一版是硬边：一条笔直的竖线从曲线笔画中间切过去，读起来不像"填到这里
 * 了"，像渲染坏了。羽化一段就变成墨在往前洇。
 *
 * 为什么用 em 不用 %：% 是相对渐变盒宽的，而盒宽跟着位数变（"7" / "37" /
 * "100" 差一倍多），同一个百分数在个位数时的实际宽度只有三位数时的三分之
 * 一，羽化会忽宽忽窄。em 跟字号走，位数再变羽化宽度不变。
 *
 * 取值必须**小于 PAD.left 和 PAD.right**，这是个硬约束（测试守着）：
 *   · p=0 时分界点在 0，羽化带整个落在左 padding（.08em）里；
 *   · p=1 时分界点在 100%，羽化带整个落在右 padding（.18em）里。
 * 两处 padding 里都没有字形，所以两端的羽化带在屏幕上不显形 —— 0% 是整字
 * 淡墨、100% 是整字实墨，一点都不脏。.035em 对两边都留了一倍以上余量。
 */
const FEATHER = '.035em';

/**
 * 纸面的两极色偏（不是"装饰"，是给空场定调子）。
 *
 * 上一版整屏是一块死平的单色，内容又只占左半边，右半屏读起来是"没画完"。
 * 加一道从左上偏亮、到右下偏暗的极缓渐变，纸就有了厚薄，空场也就成了留白。
 *
 * 两个值都从 paper / ink 现算，不写死颜色 —— 换一张纸（哪怕换成冷灰）色偏
 * 自动跟着走，不会突然冒出一块和主色不搭的橙。
 *   亮极 = 纸往白里推 50%，只会抬对比度，不用验；
 *   暗极 = 纸里掺 5.5% 墨，是唯一会吃对比度的一项，worstPaper() 把它算进去。
 */
const WASH_LIGHT = 0.5;
const WASH_DARK = 0.055;

/** 这个模块会往 HTML 里写的类名，交给 build.js 加进"已知类名"集合。 */
const PRELOADER_CLASSES = [
  'ns-pre', 'ns-pre-mark', 'ns-pre-num', 'ns-pre-val', 'ns-pre-pct',
  'ns-pre-bar', 'ns-pre-tip',
];

// ---------------------------------------------------------------- 锚点原文
// 这五段是上游产物里的原文，逐字复制。任何一段对不上都会让构建停下来。

const A_ASSET = 'const VH=Vr("./images/loader.gif")';

const A_RENDER = '[We("div",{ref_key:"wrapperRef",ref:i,class:"wrapper"},'
  + '[...u[0]||(u[0]=[We("img",{alt:"loader",class:"w-50",src:VH},null,-1)])],512)]';

const A_SETUP = 'let o=null;const a=()=>{';

const A_REVEAL = 's.value=!0;const c=t.value';

// setup() 的 return 语句。跑到这里 a / l 都已经初始化完毕，可以安全地把
// 揭幕函数交给运行时。
const A_ARM = 'return e.sceneLoaded&&a(),Uo(';

const A_CLEANUP = 'Uo(()=>{o?.kill(),l()})';

/**
 * 克隆仓库自己加在 </body> 前的那段脚本，逐字复制。
 *
 * 为什么它存在：这份静态克隆里 Pinia 的 `setSceneLoaded` 一次都不会被
 * dispatch，上游那套「场景就绪 → 圆形遮罩揭幕」根本不会启动。把这段脚本
 * 删掉实测的结果是加载页永远停在屏幕上（挂了 120s，`.preloader` 始终在
 * DOM 里，`preloader--revealing` 这个类从未出现）。所以它不是多余的。
 *
 * 为什么还是要换掉它：它的判据是「页面上出现了一块占满 80% 视口的 canvas」，
 * 而 canvas 在资源远没下完时就已经够大了 —— 于是它经常提前收场，而且是
 * 直接 remove 节点，上游那圈遮罩动画和解锁滚动的调用都被跳过。
 * 换成由引擎里的运行时判断就绪、再调用组件自己的揭幕函数，这里只留兜底。
 */
const A_WATCHDOG = `<script>
(() => {
  const hideReadyPreloader = () => {
    const preloader = document.querySelector(".preloader");
    const canvas = document.querySelector("canvas");
    if (!preloader || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < window.innerWidth * 0.8 || rect.height < window.innerHeight * 0.8) return false;
    preloader.style.opacity = "0";
    preloader.style.pointerEvents = "none";
    preloader.style.transition = "opacity 600ms ease";
    setTimeout(() => preloader.remove(), 700);
    return true;
  };

  window.addEventListener("load", () => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (hideReadyPreloader() || Date.now() - started > 120000) {
        clearInterval(timer);
      }
    }, 500);
  }, { once: true });
})();
<\/script>`;

/**
 * 换上去的兜底脚本。正常路径完全用不到它 —— 只有当引擎侧的补丁没生效
 * （上游换了构建、或者 JS 报错）时才收场，绝不抢在正常揭幕前面动手。
 *
 * 两个触发条件：
 *   · 进度条已经满了却迟迟没揭幕，等 2.5s 后自己淡出；
 *   · load 之后 60s 还挂在加载页上（说明运行时压根没跑）。
 */
const FAILSAFE = `<script>
(() => {
  // ---- 1/2 引导：首帧就让数字动起来 ----------------------------------
  // 驱动进度的代码在 1.6MB 的引擎产物里，慢网下光下载就要十几秒。
  // 这段内联脚本跟着 SSR 标记一起到达，先按时间把数字往上推；引擎起来后
  // 由 __nsPre 接管（读走 get() 再 stop()），真实进度从这个位置往上接。
  // 上限压在 50% —— 引擎都还没跑起来，绝不能显示「快好了」。
  (() => {
    var root = document.querySelector(".ns-pre");
    if (!root) return;
    var val = root.querySelector(".ns-pre-val");
    var t0 = Date.now();
    var shown = 0;
    var live = true;
    var step = function () {
      if (!live) return;
      var v = 0.5 * (1 - Math.exp(-(Date.now() - t0) / 5200));
      if (v > shown) shown = v;
      root.style.setProperty("--ns-pre-p", shown.toFixed(4));
      if (val) val.textContent = String(Math.floor(shown * 100));
      requestAnimationFrame(step);
    };
    window.__nsPreBoot = {
      get: function () { return shown; },
      stop: function () { live = false; },
    };
    requestAnimationFrame(step);
  })();

  // ---- 2/2 兜底：无论如何不把人永远关在加载页里 ------------------------
  // 正常路径根本走不到这里 —— 引擎侧的 __nsPre 会调用组件自己的揭幕函数，
  // 收尾由 Vue 做。这段只处理「引擎侧压根没起来」和「起来了却卡死」。
  //
  // 两条硬规矩：
  //   1. 引擎侧一旦开始揭幕（__nsPreState === "revealing"）就彻底撒手。
  //      否则两边同时收场：这里把节点摘了，Vue 还以为自己拥有它，下一次
  //      更新就往 null 父节点里插东西，控制台报
  //      "Cannot read properties of null (reading 'insertBefore')"。
  //   2. 只隐藏，不 remove。同上 —— 这个节点是 Vue 渲染的，不归这里处置。
  var hide = function (p) {
    p.style.transition = "opacity 600ms ease";
    p.style.opacity = "0";
    p.style.pointerEvents = "none";
    setTimeout(function () {
      p.style.visibility = "hidden";
      p.style.display = "none";
    }, 700);
  };
  var covered = function () {
    var c = document.querySelector("canvas");
    if (!c) return false;
    var r = c.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.8;
  };
  var bail = function (t0) {
    var p = document.querySelector(".preloader");
    if (!p) return true;                       // Vue 已经收走了，最理想的结局
    var st = window.__nsPreState;
    if (st === "revealing") return true;       // 揭幕在播，交给 Vue
    var waited = Date.now() - t0;
    if (st === "live" && waited < 90000) return false;  // 引擎侧在驱动，等它
    if (waited < 8000) return false;           // 引擎侧没握手，再多给几秒
    // 画布还没铺满就把加载页撤了，用户只会看到一片空白 —— 那还不如让他
    // 继续看加载页。所以除非等到了绝望的 60s，否则要求画面确实起来了。
    if (!covered() && waited < 60000) return false;
    hide(p);
    return true;
  };
  window.addEventListener("load", function () {
    var t0 = Date.now();
    var timer = setInterval(function () { if (bail(t0)) clearInterval(timer); }, 500);
  }, { once: true });
})();
<\/script>`;

const A_TIMELINE = 'ba.set(c,{"--reveal-radius":"0vmax"}),'
  + 'o=ba.timeline({onComplete:()=>{r.value=!1,o=null}}),'
  + 'u&&o.to(u,{autoAlpha:0,scale:.92,duration:2,ease:"power1.out"},0),'
  + 'setTimeout(()=>{e.getScroll?.paused(!1)},1200),'
  + 'o.to(c,{"--reveal-radius":"200vmax",duration:2,ease:"power3.inOut"},0)';

const A_SSR = `<div class="wrapper" ${SCOPE}>`
  + `<img alt="loader" class="w-50" src="./images/loader.gif" ${SCOPE}>`
  + '</div>';

// ------------------------------------------------------------- 节点树描述
// 一棵树，两个渲染器。attrs 的每一项是 [属性名, HTML 里的值, vnode 里的 JS
// 表达式]；第三项省略时按 JSON.stringify(值) 处理。

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * @param {{mark:?{out:string,alt:string}, showPercent:boolean, tip:string,
 *          fill:boolean}} o
 *   fill —— 发丝线里要不要那根会伸长的 <i>。
 *   editorial 不要：进度已经由数字的墨色填充表达了，再让线也从左往右长，
 *   两条分界永远对不齐（线是版心宽 680px，数字是内容宽 ~408px，86% 处差
 *   244px），看起来像两个各说各话的进度条 —— 实拍对比见 shots/pre6-d 与
 *   pre6-e。editorial 的线因此降级成纯版心地平线：上面是标识和数字，下面是
 *   提示，右端接住百分号。progress 预设没有大数字，那条填充是唯一读数，留着。
 * @returns {object[]} 节点树（.wrapper 的直接子节点）
 */
function nodes(o) {
  const out = [];
  if (o.mark) {
    out.push({
      tag: 'div',
      attrs: [['class', 'ns-pre-mark']],
      kids: [{
        tag: 'img',
        // src 走 Vr()（引擎自己的 publicAssetsURL），和上游 loader.gif 一个待遇，
        // 免得将来换 baseURL / cdnURL 时这一张图落单。
        attrs: [['alt', o.mark.alt], ['src', `./${o.mark.out}`, 'VH']],
        void: true,
      }],
    });
  }
  if (o.showPercent) {
    out.push({
      tag: 'div',
      attrs: [['class', 'ns-pre-num']],
      kids: [
        { tag: 'span', attrs: [['class', 'ns-pre-val']], text: '0' },
        { tag: 'span', attrs: [['class', 'ns-pre-pct']], text: '%' },
      ],
    });
  }
  out.push({
    tag: 'div',
    attrs: [['class', 'ns-pre-bar']],
    kids: o.fill ? [{ tag: 'i' }] : [],
  });
  if (o.tip) out.push({ tag: 'p', attrs: [['class', 'ns-pre-tip']], text: o.tip });
  return out;
}

/** 渲染器 A：SSR 首帧标记。标签之间不能有空白 —— 多一个文本节点就对不上了。 */
function toHtml(n) {
  const attrs = (n.attrs || []).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const open = `<${n.tag}${attrs} ${SCOPE}>`;
  if (n.void) return open;
  const inner = n.text !== undefined ? esc(n.text) : (n.kids || []).map(toHtml).join('');
  return `${open}${inner}</${n.tag}>`;
}

/**
 * 渲染器 B：渲染函数里的 vnode 表达式。
 * `We` 就是 createElementVNode(type, props, children, patchFlag)。
 * 顶层节点带 -1（HOISTED，Vue 认定它永不变化、直接跳过 patch），内层跟随
 * 上游编译器的习惯不带 flag —— 这两点都照抄上游 Preloader / AudioComponent
 * 的写法，不自创。
 */
function toVnode(n, top) {
  const props = (n.attrs || []).length
    ? `{${n.attrs.map(([k, v, js]) => `${k}:${js || JSON.stringify(v)}`).join(',')}}`
    : 'null';
  let children = 'null';
  if (n.text !== undefined) children = JSON.stringify(n.text);
  else if (n.kids && n.kids.length) children = `[${n.kids.map((k) => toVnode(k, false)).join(',')}]`;
  return `We("${n.tag}",${props},${children}${top ? ',-1' : ''})`;
}

// ------------------------------------------------------------------- 样式

function checkColor(v, where, errors, fallback) {
  if (!isHex6(v)) {
    errors.push(`site.preloader.${where}: ${JSON.stringify(v)} 不是 #RRGGBB 写法`);
    return fallback;
  }
  return v.trim().toLowerCase();
}

/**
 * 解一个"淡墨"：把墨色按某个不透明度压在纸上，取第一个对比度够 target 的。
 *
 * 为什么要解不能写死：纸色是可配的。写死一个 #8c8881 在象牙纸上刚好够
 * 3:1，换成一张更白的纸（比如 #ffffff）就掉到 2.6:1，换成米黄偏深的纸又
 * 会浪费掉本可以更淡的余地。从 0.2 起每次加一个百分点往下试，第一个够的
 * 就是"在够看得清的前提下最淡的那一档"。
 *
 * target 由调用方给：小字走 FAINT_TEXT_MIN（4.5，WCAG 正文 AA），数字未填充
 * 的那一半走 FAINT_NUM_MIN（3，WCAG 大号文字）。两处不能共用一个值，理由见
 * 那两个常量的注释。
 *
 * 注意传进来的 paper 应该是**最暗那一档纸**（worstPaper），不是名义纸色 ——
 * 纸上叠了色偏和颗粒，字压在最暗的那一点上才是最坏情况。
 *
 * @param {string} ink    墨色 #RRGGBB
 * @param {string} paper  纸色 #RRGGBB（用最坏的那一档）
 * @param {number} target 目标对比度
 * @returns {string} #RRGGBB
 */
function solveFaint(ink, paper, target = 3) {
  // 整数步进，别让 0.2+0.01*n 的浮点误差决定色值。
  for (let i = 20; i <= 96; i += 1) {
    const c = over(ink, paper, i / 100);
    if (contrast(c, paper) >= target) return c;
  }
  return ink;
}

/**
 * 纸面上最暗的那一点：暗极色偏压到底 + 颗粒往暗侧 2σ。
 *
 * 深色字压在浅底上，吃亏的是纸变暗的那一侧 —— 和菜单那边（白字压深底、怕
 * 底变亮）正好相反，所以 grainLift 传的是**负** k。
 * 2σ 覆盖 97.7% 的颗粒；剩下 2.3% 是单个像素级别的噪点，落不到整个字上。
 *
 * @param {string} paper 名义纸色
 * @param {string} ink   墨色
 * @returns {string} #RRGGBB
 */
function worstPaper(paper, ink) {
  return grainLift(over(ink, paper, WASH_DARK), 'light', -2);
}

/**
 * editorial：象牙纸 + 墨黑排印。
 *
 * 版面是左对齐的，不是居中的 —— 居中 + 巨大数字是加载页最常见的那一种长相，
 * 靠左顶格 + 底部发丝线 + 疏排小字才是印刷品的读法。
 *
 * 注意单位：站内 html{font-size:10px}，1rem = 10px，Tailwind 的 1 单位也 = 1px。
 * 这里一律写 px，免得和那套换算搅在一起。
 */
function cssEditorial(o) {
  const {
    paper, ink, markInvert, numerals,
  } = o;
  // 字面：sans 走站内正文字体，display 走衬线斜体（试用版，见 DEMO_GLYPHS）。
  //
  // 换字要连着调字距，不能只换 font-family：衬线斜体本来就往右倾，-.02em
  // 就够；TTNeoris 是直立的等宽数字（tabular-nums 打开后每位同宽），大字号
  // 下每位右边都带一段用来对齐的余量，不多收一点，三位数读起来像三个各自
  // 站着的字而不是一个数。-.045em 是照 420px 上限量出来的。
  //
  // line-height 保持 .82 不动：它和下面那条 margin-bottom:-.18em 是一对
  // （负值专门用来收掉 .82 行盒底多出来的 .216em），单独动一个会把数字和
  // 发丝线之间的间距重新撑开。
  const display = numerals === 'display';
  const numFont = display
    ? 'font-family:var(--font-serif),serif;font-style:italic'
    : 'font-family:var(--font-sans-regular),sans-serif;font-style:normal';
  const numTrack = display ? '-.02em' : '-.045em';
  // 三档墨，都对着**最暗那一档纸**解，不对名义纸色解 —— 纸上叠了色偏和颗粒。
  const worst = worstPaper(paper, ink);
  const faint = solveFaint(ink, worst, FAINT_TEXT_MIN); // 小字，≥4.5:1
  const ghost = solveFaint(ink, worst, FAINT_NUM_MIN); // 数字未填充那半，≥3:1
  const hair = rgba(ink, 0.14); // 发丝线：看得见，但不参与阅读
  const washA = over('#ffffff', paper, WASH_LIGHT); // 纸的亮极
  const washB = over(ink, paper, WASH_DARK); // 纸的暗极

  // 标识原图是纯白的（logoSimple.svg 里 15 个 fill="white"），压在象牙纸上
  // 等于没有。brightness(0) 把任何颜色都压成纯黑，比 invert(1) 稳 —— invert
  // 对彩色 logo 会翻出补色，对白色才刚好是黑色。
  // 48px 不是随手写的：这个标识是 4×4 网格上的 12 个正方块（viewBox 99，
  // 每格 24.71 单位）。宽度取 4 的倍数，每格才落在整像素上，边缘不会被
  // 抗锯齿磨出深浅不一的灰边。48 → 每格 12px（2 倍屏 24px），刚好。
  // 上一版 36px 在 360px 高的数字旁边小得像个错放的图标，比例压不住。
  // 标识留在版心左上，跟着左轴走。
  //
  // 这里绕过两条弯路，都记下来免得再走一遍：
  //
  //   · 挪到版心右上（align-self:flex-end）：版心又窄又垂直居中，标识就吊在
  //     右侧半空中，既不贴角也不挨着任何东西，比原样更糟。
  //   · 出流钉到整屏左上角（position:absolute + top/left）：**定位错元素**。
  //     上游给 .wrapper 挂了 will-change:opacity,transform，而 will-change
  //     里带 transform 的元素会成为绝对定位后代的包含块 —— 于是 top/left
  //     不是从屏幕角算，是从版心左上角算，标识直接压在数字上。要绕开就得去
  //     覆盖上游的 will-change，为了摆一个 36px 的图去动人家的合成层提示，
  //     不划算。
  //
  // 留在流里其实没问题：上一版看着"三条左边线不齐"，主因是数字和发丝线之间
  // 空着一个 130px 的洞，整块散着。洞收掉之后，标识、发丝线、数字那根细尾巴
  // 三者的左缘差不到 20px，读起来就是一条轴 —— 斜体数字的细尾巴挑出去一点
  // 正是正经的视觉对齐（optical margin alignment）。
  const mark = ['align-self:flex-start', 'width:48px', 'height:auto',
    'margin:0 0 clamp(20px,4.6vh,48px)'];
  if (markInvert) mark.push('filter:brightness(0)');

  return [
    // 底：上游那条 .preloader[data-v-...] 特异度是 (0,2,0)，`.preloader.preloader`
    // 打平且排在后面，稳赢；scope id 不用硬编码进样式层。
    // 只覆盖 background / isolation —— --reveal-radius / --reveal-feather /
    // overflow 仍然由上游规则提供，揭幕遮罩原样保留。
    //
    // isolation:isolate 是给颗粒层用的：颗粒是一条 z-index:-1 的 ::after，
    // 父元素不自己建层叠上下文的话它会掉到父背景**底下**，什么都看不见。
    `.preloader.preloader{background-color:${paper};background-image:`
      + `radial-gradient(76% 60% at 6% 0%,${washA},${fade(washA)} 62%),`
      + `radial-gradient(98% 86% at 98% 100%,${washB},${fade(washB)} 66%);`
      + 'isolation:isolate}',

    // 颗粒。三个类名叠着写是为了压过上游的
    // `.preloader--revealing[data-v-724e2fc4]:after{opacity:1}`（特异度 0,2,1）——
    // 那条会在揭幕时把颗粒层的 opacity 顶成 1，整屏突然爬满噪点。
    // 三类 (0,3,1) 稳过。
    grainRule('.preloader.preloader.preloader', { surface: 'light' }),

    // 版心 680px 是量出来的，不是拍的：字号上限受 40vh 约束，1600×900 下
    // 解出 360px；TheSeasons italic 三位数 "100" 在这个字号下宽 612px，加上
    // 间距和百分号约 647px。680 刚好兜住最宽的一帧，于是从 0 到 100 全程
    // 版心不跳，发丝线的长度是稳的。
    //
    // 上一版试过 1120px，是错的：两位数只有 408px，百分号被 space-between
    // 甩到 690px 开外，中间那片空既不是留白也不是内容 —— 读起来是散架不是
    // 张力。排印里的空隙要跟内容同一个数量级才成立。
    //
    // 86vw 而不是 92vw：390px 竖屏下左边距 27px，减掉斜体 3/5 往左挑的
    // .079em（约 13px），字形最左还剩 14px 不贴边。92vw 只剩 3px。
    `.ns-pre{display:flex;flex-direction:column;align-items:stretch;`
      + `width:min(86vw,680px);color:${ink};text-align:left;`
      + `font-family:var(--font-sans-regular),sans-serif;`
      + `will-change:opacity,transform}`,

    `.ns-pre-mark{${mark.join(';')}}`,
    '.ns-pre-mark img{display:block;width:100%;height:auto}',

    // 48px 是照桌面定的（那边数字有 360~420px）。390px 竖屏下数字只剩
    // 163.8px，48px 的标识占到数字高的 29%，压过了页面上唯一的读数。收到
    // 32px —— 同样是 4 的倍数，12 个方块每格 8px 仍落整像素，上面那条
    // "边缘不会被抗锯齿磨出灰边"的论证照样成立。
    '@media(max-width:640px){.ns-pre-mark{width:32px}}',

    // 字号上限 460px、下限 72px，中间跟着 min(46vw,42vh) 走 —— 竖屏手机受
    // 46vw 约束（三位数 "100" 才不会顶出容器），横屏笔记本受 42vh 约束
    // （矮视口下不会把发丝线和小字挤出屏幕）。
    // line-height:.82 是把数字上下的行距留白收掉，让它真的像一块印上去的字。
    //
    // justify-content 从 space-between 改回 flex-start。
    //
    // space-between 那一版的理由是"两头各钉一个东西，发丝线才有两个端点可以
    // 呼应"。桌面下勉强说得通，移动端直接散架：390px 竖屏里 .ns-pre-pct 的
    // clamp(13px,2vw,26px) 触底成 13px，数字右缘在 199px、百分号钉在 352px，
    // 中间 150px 的空既不是留白也不是内容 —— 实拍出来读成布局出了 bug（见
    // shots/01_加载页_移动.png）。百分号是数字的单位，不是版心的另一端，它
    // 就该贴着数字站。发丝线的右端点由它自己的 width:100% 负责，不需要谁去
    // "呼应"。
    //
    // margin-bottom 的负值是修一个看不见的洞：line-height:.82 之后行盒底比
    // 最深的字形还低 .216em（量出来的，所有数字都够不到底），叠上发丝线自己
    // 的 margin-top，数字和线之间会空出一段快 130px 的死区，整块版面被撑散。
    // 收回 .18em，剩 .036em 余量，谁也不会被切到。
    '.ns-pre-num{display:flex;align-items:baseline;'
      + 'justify-content:flex-start;gap:clamp(6px,1.2vw,14px);'
      + 'margin:0 0 -.18em;'
      + `${numFont};font-weight:400;`
      + 'font-size:clamp(72px,min(42vw,40vh),420px);line-height:.82;'
      + `letter-spacing:${numTrack};`
      + 'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}',

    // 数字本身就是进度条：一条 90° 硬边渐变裁进字形，分界点绑 --ns-pre-p。
    //
    // 三件事都得在这一条规则里办妥：
    //
    // ① 整块放进 @supports。color:transparent 一旦在不支持 background-clip
    //    的浏览器上生效，整个数字会直接消失；不支持就退回纯墨色，照样读得出。
    //    条件里额外要一句 clamp()，因为分界点用了 min()/clamp()：万一遇上
    //    支持 -webkit-background-clip 却不认 clamp() 的老 WebKit，渐变会在
    //    计算期整条作废（回落成 none），配上 color:transparent 又是白屏。
    //
    // ② padding 不是排版留白，是修 bug 的。background-clip:text 的绘制区域
    //    仍被盒子框着，斜体字形挑到盒外的那截拿不到底图，就被整整齐齐削掉一
    //    条竖线 —— 末位 7 的尾巴、"5" 的左肩、所有数字的顶尖都中招。补完
    //    padding 再用等量负 margin 抵掉，字形位置、百分号位置、左侧栏对齐线
    //    一个都不动，纯粹给底图扩地方。
    //
    // ③ 分界点改用 --ns-pre-cut（见上面 CUT 的注释），把 padding 从映射里
    //    减回去。不这么做的话渐变的 100% 会按"字宽 + PAD"算，两位数时
    //    PAD/字宽 ≈ 29%，走到 85% 整个字就填满了，剩下 15% 干看着。
    '@supports ((-webkit-background-clip:text) or (background-clip:text))'
      + ' and (width:clamp(1px,2px,3px)){'
      + `.ns-pre-val{margin:-${PAD.top} -${PAD.right} 0 -${PAD.left};`
      + `padding:${PAD.top} ${PAD.right} 0 ${PAD.left};`
      + `--ns-pre-cut:${CUT};`
      + `background-image:linear-gradient(90deg,${ink} 0,`
      + `${ink} calc(var(--ns-pre-cut) - ${FEATHER}),`
      + `${ghost} calc(var(--ns-pre-cut) + ${FEATHER}),${ghost} 100%);`
      + '-webkit-background-clip:text;background-clip:text;color:transparent}}',

    // 百分号：贴着数字，尺寸按"单位"给。
    //
    // 上一版把它疏排 .24em 顶到版心右端，是为了给发丝线凑一个右端点；那条
    // 理由已经在 .ns-pre-num 那里推翻了。回到数字旁边之后，疏排就成了纯粹
    // 的害处（单个字符的 letter-spacing 只会在它右边多留一道空），归零。
    //
    // 字号从 clamp(13px,2vw,26px) 提到 clamp(22px,4.6vw,44px)：移动端
    // 2vw 在 390px 屏上触底成 13px，和 163.8px 的数字是 12.6 倍落差，小到
    // 像个脚注；4.6vw 给出 17.9px，配上 22px 的下限落在 22px，落差 7.4 倍
    // —— 仍然明确分主次，但读得出它是同一个读数的一部分。
    `.ns-pre-pct{font-family:var(--font-sans-regular),sans-serif;font-style:normal;`
      + `font-size:clamp(22px,4.6vw,44px);letter-spacing:0;`
      + `margin:0;color:${ink}}`,

    // 发丝线：版心的地平线，静态。上面是标识和数字，下面是提示，右端接住
    // 百分号 —— 它的职责是给这块排印一条底边，不是第二个进度条。
    //
    // 这里砍掉了一版会伸长的填充条。砍的理由是实拍出来的：线是版心宽
    // （680px），数字是内容宽（两位数约 408px），同一个 --ns-pre-p 画出来的
    // 两条分界在 86% 处差 244px，肉眼直接读成"线跑得比数字快"。对比图
    // shots/pre6-d-desktop-86.png（带填充）与 pre6-e-desktop-86.png（静态）。
    // 想让两条对齐就得把数字的排版宽度传给兄弟元素，CSS 做不到；与其塞一个
    // 会说谎的指示器，不如让唯一的读数干净。
    `.ns-pre-bar{width:100%;height:1px;`
      + `margin-top:clamp(18px,3.4vh,38px);background:${hair}}`,

    // 疏排 .26em 是中文小字当标签用的排法；右边补回 -.26em，免得最后一个字
    // 后面那道空隙把整行推得不齐。
    `.ns-pre-tip{margin:14px -.26em 0 0;font-size:11px;line-height:1.6;`
      + `letter-spacing:.26em;color:${faint}}`,
  ].join('\n');
}

/**
 * progress：深蓝渐变 + 光斑 + 进度条。备选，不是默认。
 *
 * 注意单位：同上，一律写 px。
 */
function cssProgress(o) {
  const [c0, c1, c2] = o.background;
  const [g0, g1] = o.glow;
  return [
    // 底：上游那条 .preloader[data-v-...] 特异度是 (0,2,0)，`.preloader.preloader`
    // 打平且排在后面，稳赢；scope id 不用硬编码进样式层。
    // 只覆盖 background 一条 —— --reveal-radius / --reveal-feather / overflow
    // 仍然由上游规则提供，揭幕遮罩原样保留。
    `.preloader.preloader{background:radial-gradient(120% 86% at 50% 0%,${rgba(g0, 0.18)} 0%,${fade(g0)} 58%),`
      + `radial-gradient(96% 76% at 50% 100%,${rgba(g1, 0.32)} 0%,${fade(g1)} 62%),`
      + `linear-gradient(162deg,${c0} 0%,${c1} 52%,${c2} 100%)}`,

    '.ns-pre{display:flex;flex-direction:column;align-items:center;'
      + 'width:min(74vw,300px);color:#fff;text-align:center;'
      + 'font-family:var(--font-sans-regular),sans-serif;'
      + 'will-change:opacity,transform}',

    `.ns-pre-mark{width:40px;margin-bottom:30px;opacity:.9;`
      + `${o.markInvert ? 'filter:brightness(0);' : ''}`
      + `animation:ns-pre-pulse 2.6s ease-in-out infinite}`,
    '.ns-pre-mark img{display:block;width:100%;height:auto}',
    '@keyframes ns-pre-pulse{0%,100%{opacity:.5;transform:scale(.94)}50%{opacity:1;transform:scale(1)}}',

    // tabular-nums 让 0→100 过程中数字不左右跳；min-width 是字体没有等宽
    // 数字时的兜底（TTNeoris 是试用版，不保证带 tnum）。
    '.ns-pre-num{display:flex;align-items:baseline;justify-content:center;'
      + 'font-size:clamp(50px,13vw,70px);line-height:1;letter-spacing:-.03em;'
      + 'font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;'
      + 'margin-bottom:24px}',
    '.ns-pre-val{min-width:1.9em;text-align:right}',
    `.ns-pre-pct{font-size:.34em;letter-spacing:0;margin-left:.14em;color:${o.accent};opacity:.85}`,

    // 轨道透明度 .22：0% 时也要能一眼看出「这里是一条进度条」，
    // 但又不能亮到和填充抢视线。
    '.ns-pre-bar{position:relative;width:100%;height:3px;border-radius:3px;'
      + 'background:rgba(255,255,255,.22);overflow:hidden}',
    // scaleX 只走合成层，不触发布局；--ns-pre-p 由运行时每帧写在 .ns-pre 上。
    `.ns-pre-bar i{position:absolute;inset:0;border-radius:inherit;transform-origin:left center;`
      + `transform:scaleX(var(--ns-pre-p,0));background:linear-gradient(90deg,${o.accent} 0%,#fff 100%)}`,

    // 13px / .62 白：对三档底色的最差对比度 5.04:1，过 WCAG AA 正文线。
    // 之前的 12px / .5 白只有 3.85:1，不达标。
    '.ns-pre-tip{margin:20px 0 0;font-size:13px;letter-spacing:.16em;'
      + 'color:rgba(255,255,255,.62)}',

    '@media(prefers-reduced-motion:reduce){.ns-pre-mark{animation:none;opacity:.9}}',
  ].join('\n');
}

// ------------------------------------------------------------------- 入口

/**
 * @param {object} site  规范化后的 config/site.js（preloader.mark 已解析成 {out}）
 * @returns {{css:string, errors:string[], anchors:object[], classes:string[], style:string}}
 */
function buildPreloader(site) {
  const errors = [];
  const warnings = [];
  const p = Object.assign({}, PRELOADER_DEFAULTS, (site && site.preloader) || {});
  const style = p.style;
  const none = {
    css: '', errors, warnings, anchors: [], classes: [], style,
  };

  if (!STYLES.has(style)) {
    errors.push(`site.preloader.style: 未知取值 ${JSON.stringify(style)}`
      + `（可选: ${[...STYLES].join(', ')}）`);
    return none;
  }
  // legacy = 原封不动保留上游的 loader.gif，一个字节都不改。
  if (style === 'legacy') return none;

  const paper = checkColor(p.paper, 'paper', errors, PRELOADER_DEFAULTS.paper);
  const ink = checkColor(p.ink, 'ink', errors, PRELOADER_DEFAULTS.ink);
  // 只有 editorial 会用到纸墨，别的样式配错了也不该拦着构建。
  if (style === 'editorial') {
    const c = contrast(paper, ink);
    if (c < PAPER_INK_MIN) {
      errors.push(`site.preloader: paper ${paper} 和 ink ${ink} 的对比度只有 `
        + `${c.toFixed(2)}:1，加载页要求至少 ${PAPER_INK_MIN}:1（WCAG AAA）。`
        + '把纸调浅或者把墨调深。');
    }
  }

  // 数字字面。配错了直接报错（拼错一个词就静默换套字，比报错更糟）；配成
  // display 则放行但给一条告警 —— 那套字好看，但捆进来的是试用版。
  if (!NUMERALS.has(p.numerals)) {
    errors.push(`site.preloader.numerals: 未知取值 ${JSON.stringify(p.numerals)}`
      + `（可选: ${[...NUMERALS].join(', ')}）`);
  }
  const numerals = NUMERALS.has(p.numerals) ? p.numerals : PRELOADER_DEFAULTS.numerals;
  if (style === 'editorial' && numerals === 'display') {
    warnings.push('site.preloader.numerals: display 用的是仓库里捆的 '
      + `${DEMO_GLYPHS}（试用版，字体内部名 "FSP DEMO - The Seasons"）。`
      + '它把数字 4 的字形换成了水印图案（9 条轮廓 79 个点，其余数字只有 '
      + '1~3 条），进度走到 4、14、24、34、40~49、54、64、74、84、94 这 19 '
      + '个值时，整屏最大的那个字会变成一朵花瓣加一行 DEMO。上生产前请换成 '
      + '正版授权的字体文件，或者改回 numerals:\'sans\'。');
  }

  // 'auto'：浅底（editorial）要把白标识压成黑的，深底（progress）不用动。
  if (p.markInvert !== 'auto' && typeof p.markInvert !== 'boolean') {
    errors.push(`site.preloader.markInvert: 需要 true / false / 'auto'，`
      + `实际拿到 ${JSON.stringify(p.markInvert)}`);
  }
  const markInvert = p.markInvert === 'auto'
    ? style === 'editorial'
    : p.markInvert === true;

  const bg = Array.isArray(p.background) && p.background.length === 3
    ? p.background.map((c, i) => checkColor(c, `background[${i}]`, errors,
      PRELOADER_DEFAULTS.background[i]))
    : (errors.push(`site.preloader.background: 需要 3 个 #RRGGBB 颜色，实际拿到 ${JSON.stringify(p.background)}`),
    PRELOADER_DEFAULTS.background);
  const glow = Array.isArray(p.glow) && p.glow.length === 2
    ? p.glow.map((c, i) => checkColor(c, `glow[${i}]`, errors, PRELOADER_DEFAULTS.glow[i]))
    : (errors.push(`site.preloader.glow: 需要 2 个 #RRGGBB 颜色，实际拿到 ${JSON.stringify(p.glow)}`),
    PRELOADER_DEFAULTS.glow);
  const accent = checkColor(p.accent, 'accent', errors, PRELOADER_DEFAULTS.accent);

  const dur = Number(p.revealDuration);
  if (!Number.isFinite(dur) || dur <= 0 || dur > 10) {
    errors.push(`site.preloader.revealDuration: 需要 0 到 10 之间的秒数，实际拿到 ${JSON.stringify(p.revealDuration)}`);
  }

  // mark 由 normalizeSite 解析成 {src,out}；配成空串就是"不要标识"。
  const mark = p.mark && p.mark.out
    ? { out: p.mark.out, alt: (site.brand && site.brand.logoAlt) || '' }
    : null;
  const tip = typeof p.tip === 'string' ? p.tip : '';
  const showPercent = p.showPercent !== false;

  if (!mark && !showPercent && !tip) {
    errors.push('site.preloader: mark / showPercent / tip 全关了，加载页会是一片空白。'
      + '想要空白底就把 style 设成 legacy 再自行调整。');
  }

  const tree = nodes({ mark, showPercent, tip, fill: style !== 'editorial' });
  const html = tree.map(toHtml).join('');
  const vnodes = tree.map((n) => toVnode(n, true)).join(',');

  const anchors = [
    {
      key: 'preloader.render',
      file: 'engine',
      find: A_RENDER,
      replace: '[We("div",{ref_key:"wrapperRef",ref:i,class:"wrapper ns-pre"},'
        + `[...u[0]||(u[0]=[${vnodes}])],512)]`,
      expect: 1,
    },
    {
      key: 'preloader.progress',
      file: 'engine',
      find: A_SETUP,
      replace: `let o=null;${runtime()}const a=()=>{`,
      expect: 1,
    },
    {
      key: 'preloader.arm',
      file: 'engine',
      find: A_ARM,
      replace: 'return __nsPre.arm(a),e.sceneLoaded&&a(),Uo(',
      expect: 1,
    },
    {
      key: 'preloader.reveal',
      file: 'engine',
      find: A_REVEAL,
      replace: 's.value=!0,__nsPre.done();const c=t.value',
      expect: 1,
    },
    {
      key: 'preloader.cleanup',
      file: 'engine',
      find: A_CLEANUP,
      replace: 'Uo(()=>{o?.kill(),l(),__nsPre.stop()})',
      expect: 1,
    },
    {
      key: 'preloader.ssr',
      file: 'html',
      find: A_SSR,
      replace: `<div class="wrapper ns-pre" ${SCOPE}>${html}</div>`,
      expect: 1,
    },
    {
      key: 'preloader.watchdog',
      file: 'html',
      find: A_WATCHDOG,
      replace: FAILSAFE,
      expect: 1,
    },
  ];

  if (mark) {
    anchors.push({
      key: 'preloader.mark',
      file: 'engine',
      find: A_ASSET,
      replace: `const VH=Vr("./${mark.out}")`,
      expect: 1,
    });
  }

  // 只在真的改了时长时才下这条补丁 —— 默认值下 find 和 replace 一模一样，
  // 平白多一条"补丁"会让构建摘要虚报。
  if (Number.isFinite(dur) && dur > 0 && dur !== PRELOADER_DEFAULTS.revealDuration) {
    anchors.push({
      key: 'preloader.revealDuration',
      file: 'engine',
      find: A_TIMELINE,
      replace: A_TIMELINE
        .split('duration:2').join(`duration:${dur}`)
        .split('},1200)').join(`},${Math.round(dur * 600)})`),
      expect: 1,
    });
  }

  return {
    css: style === 'editorial'
      ? cssEditorial({
        paper, ink, markInvert, numerals,
      })
      : cssProgress({
        background: bg, glow, accent, markInvert,
      }),
    errors,
    warnings,
    anchors,
    classes: PRELOADER_CLASSES,
    style,
  };
}

/** 读进度驱动片段。缓存一次，dev 监听模式下每次重建都读盘没必要。 */
let RUNTIME = null;
function runtime() {
  if (RUNTIME === null) {
    RUNTIME = fs.readFileSync(path.join(__dirname, 'runtime', 'preloader-runtime.js'), 'utf8');
    if (!RUNTIME.includes('const __nsPre')) {
      throw new Error('tools/runtime/preloader-runtime.js 里找不到 __nsPre 的定义');
    }
    // 片段要塞进一行行的压缩产物里，末尾补个分号保证前后拼接安全。
    RUNTIME = `${RUNTIME.trimEnd().replace(/;?$/, ';')}\n`;
  }
  return RUNTIME;
}

module.exports = {
  buildPreloader,
  PRELOADER_DEFAULTS,
  PRELOADER_CLASSES,
  STYLES,
  NUMERALS,
  DEMO_GLYPHS,
  PAPER_INK_MIN,
  FAINT_TEXT_MIN,
  FAINT_NUM_MIN,
  FEATHER,
  WASH_LIGHT,
  WASH_DARK,
  PAD,
  CUT,
  solveFaint,
  worstPaper,
  SCOPE,
  nodes,
  toHtml,
  toVnode,
};
