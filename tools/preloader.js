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

/**
 * 上游编译产物里 Preloader 的 scoped 属性。
 * 它同时出现在补丁锚点的 find 串里，所以上游哪天换了构建、这个 id 变了，
 * 构建会在锚点校验那一步直接报错 —— 这正是我们要的行为。
 */
const SCOPE = 'data-v-724e2fc4';

const STYLES = new Set(['editorial', 'progress', 'legacy']);

const PRELOADER_DEFAULTS = {
  style: 'editorial',
  // editorial 用这两个：纸色和墨色。
  paper: '#f2ede3',
  ink: '#14120f',
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
 * @param {{mark:?{out:string,alt:string}, showPercent:boolean, tip:string}} o
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
  out.push({ tag: 'div', attrs: [['class', 'ns-pre-bar']], kids: [{ tag: 'i' }] });
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
 * 3:1 是 WCAG 对大号文字和图形元素的下限 —— 淡墨只用在百分号、提示语和
 * 数字未填充的那一半上，都属于这一类。
 *
 * @param {string} ink    墨色 #RRGGBB
 * @param {string} paper  纸色 #RRGGBB
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
 * editorial：象牙纸 + 墨黑排印。
 *
 * 版面是左对齐的，不是居中的 —— 居中 + 巨大数字是加载页最常见的那一种长相，
 * 靠左顶格 + 底部发丝线 + 疏排小字才是印刷品的读法。
 *
 * 注意单位：站内 html{font-size:10px}，1rem = 10px，Tailwind 的 1 单位也 = 1px。
 * 这里一律写 px，免得和那套换算搅在一起。
 */
function cssEditorial(o) {
  const { paper, ink, markInvert } = o;
  const faint = solveFaint(ink, paper); // 淡墨，对纸 ≥3:1
  const hair = rgba(ink, 0.14); // 发丝线：看得见，但不参与阅读

  // 标识原图是纯白的（logoSimple.svg 里 15 个 fill="white"），压在象牙纸上
  // 等于没有。brightness(0) 把任何颜色都压成纯黑，比 invert(1) 稳 —— invert
  // 对彩色 logo 会翻出补色，对白色才刚好是黑色。
  // 36px 不是随手写的：这个标识是 4×4 网格上的 12 个正方块（viewBox 99，
  // 每格 24.71 单位）。宽度取 4 的倍数，每格才落在整像素上，边缘不会被
  // 抗锯齿磨出深浅不一的灰边。36 → 每格 9px（2 倍屏 18px），刚好。
  const mark = ['align-self:flex-start', 'width:36px', 'height:auto',
    'margin:0 0 clamp(28px,7vh,76px)'];
  if (markInvert) mark.push('filter:brightness(0)');

  return [
    // 底：上游那条 .preloader[data-v-...] 特异度是 (0,2,0)，`.preloader.preloader`
    // 打平且排在后面，稳赢；scope id 不用硬编码进样式层。
    // 只覆盖 background 一条 —— --reveal-radius / --reveal-feather / overflow
    // 仍然由上游规则提供，揭幕遮罩原样保留。
    `.preloader.preloader{background:${paper}}`,

    `.ns-pre{display:flex;flex-direction:column;align-items:stretch;`
      + `width:min(88vw,720px);color:${ink};text-align:left;`
      + `font-family:var(--font-sans-regular),sans-serif;`
      + `will-change:opacity,transform}`,

    `.ns-pre-mark{${mark.join(';')}}`,
    '.ns-pre-mark img{display:block;width:100%;height:auto}',

    // 字号上限 460px、下限 72px，中间跟着 min(46vw,42vh) 走 —— 竖屏手机受
    // 46vw 约束（三位数 "100" 才不会顶出容器），横屏笔记本受 42vh 约束
    // （矮视口下不会把发丝线和小字挤出屏幕）。
    // line-height:.82 是把数字上下的行距留白收掉，让它真的像一块印上去的字。
    '.ns-pre-num{display:flex;align-items:baseline;margin:0;'
      + 'font-family:var(--font-serif),serif;font-style:italic;font-weight:400;'
      + 'font-size:clamp(72px,min(46vw,42vh),460px);line-height:.82;'
      + 'letter-spacing:-.02em;'
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
      + `${ink} var(--ns-pre-cut),`
      + `${faint} var(--ns-pre-cut),${faint} 100%);`
      + '-webkit-background-clip:text;background-clip:text;color:transparent}}',

    // 百分号回到无衬线、正体、11~15px：和 460px 的斜体数字拉出约 40 倍字号
    // 落差，层次全靠这个落差撑，不靠加装饰。
    `.ns-pre-pct{font-family:var(--font-sans-regular),sans-serif;font-style:normal;`
      + `font-size:clamp(11px,1.4vw,15px);letter-spacing:.22em;`
      + `margin-left:clamp(10px,1.6vw,22px);color:${faint}}`,

    // 发丝线：1px 的第二重读数。数字那层渐变不生效时，这条还在。
    `.ns-pre-bar{position:relative;width:100%;height:1px;`
      + `margin-top:clamp(22px,5vh,52px);background:${hair};overflow:hidden}`,
    // scaleX 只走合成层，不触发布局；--ns-pre-p 由运行时每帧写在 .ns-pre 上。
    `.ns-pre-bar i{position:absolute;inset:0;transform-origin:left center;`
      + `transform:scaleX(var(--ns-pre-p,0));background:${ink}}`,

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
  const p = Object.assign({}, PRELOADER_DEFAULTS, (site && site.preloader) || {});
  const style = p.style;
  const none = {
    css: '', errors, anchors: [], classes: [], style,
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

  const tree = nodes({ mark, showPercent, tip });
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
      ? cssEditorial({ paper, ink, markInvert })
      : cssProgress({
        background: bg, glow, accent, markInvert,
      }),
    errors,
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
  PAPER_INK_MIN,
  PAD,
  CUT,
  solveFaint,
  SCOPE,
  nodes,
  toHtml,
  toVnode,
};
