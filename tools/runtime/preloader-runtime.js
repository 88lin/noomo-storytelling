/* eslint-disable */
/**
 * preloader-runtime.js — 首屏加载页的进度驱动 + 揭幕调度。
 *
 * 这个文件不是模块，是一段**代码片段**：构建时被原样拼进引擎产物里
 * Preloader 组件的 setup() 函数体（见 tools/preloader.js 的锚点表）。
 * 所以有几条硬约束：
 *   · 不要写 'use strict' / import / export / module.exports
 *   · 顶层必须是一条完整语句，拼进去之后前后都还是合法的函数体
 *   · 可以直接引用同一模块作用域里的 `ae` —— 引擎自己的事件总线
 *     （`let FB=class{on,off,dispatch}` / `const ae=new FB`）
 *   · 变量名统一带 __ns 前缀，避开压缩产物里那些单字母名
 *
 * 它要解决两个问题
 * -----------------
 * 1. **没有反馈**：上游加载页只有一个 gif。站内最大的 v20.glb 有 4.3MB，
 *    慢网下要等很久，屏幕上却没有任何东西说明还剩多少。
 *
 * 2. **揭幕动画在这个克隆里从来没播过**（实测结论，不是推测）：
 *    上游的揭幕由 Pinia action `setSceneLoaded` 触发，而这份静态克隆里
 *    这个 action 一次都不会被 dispatch —— 把克隆自带的那段
 *    `hideReadyPreloader` 内联脚本删掉后，加载页会**永远**停在屏幕上
 *    （实测挂了 120s，`.preloader` 始终在 DOM 里，`preloader--revealing`
 *    这个类从未出现过）。克隆作者正是因此才加了那段脚本：只要页面上出现
 *    一块占满 80% 视口的 canvas 就把加载页淡出删掉。
 *
 *    那段脚本能用，但它做的是「拆掉」而不是「揭幕」：
 *      · 判据是「canvas 够大」，而 canvas 在资源还没下完时就已经够大了，
 *        所以它经常提前收场；
 *      · 直接 remove 节点，上游那圈 --reveal-radius 圆形遮罩动画被跳过；
 *      · 也不会走 `e.getScroll?.paused(!1)` 那条解锁滚动的路径。
 *
 *    这里换个做法：等到**加载真的结束**（引擎自己的 loading.complete）
 *    且画布已经稳定铺满，再把数字冲到 100，然后调用组件自己的揭幕函数
 *    `a()` —— 于是上游那圈圆形遮罩终于会播，收尾也交回 Vue 管。
 *
 * 为什么不走 Vue 响应式
 * ----------------------
 * Preloader 的渲染函数把内层节点缓存成了静态 vnode（patch flag -1），
 * Vue 之后根本不会再 patch 它。想让数字变化就得改成动态节点，那会牵动
 * 渲染函数、SSR 标记和 hydration 三处。直接写 textContent / CSS 变量
 * 反而是这里最稳的做法 —— 每帧两次 DOM 写入，代价可以忽略。
 *
 * 关于「真实进度」的诚实说明
 * --------------------------
 * 事件源是 THREE.LoadingManager，它按**资源条目数**回调（loaded/total），
 * 不是按字节。站内最大的 v20.glb 有 4.3MB，在计数里也只算 1 条，而且
 * total 会随着新资源入队往上涨。所以原始比值必然是阶梯状、偶尔回退的。
 * 这里做两件事：取只增不减的上包络 + 按时间缓动，让它看起来连续。
 * 数值来源是真的，节奏是平滑过的 —— 这就是进度条能做到的诚实上限。
 */
const __nsPre = (() => {
  const now = () => (typeof performance !== 'undefined' && performance.now
    ? performance.now() : Date.now());
  const clamp01 = (x) => (x < 0 ? 0 : (x > 1 ? 1 : x));

  const S = {
    shown: 0,        // 当前画到的进度 0..1
    target: 0,       // 想要逼近的目标
    raf: 0,
    root: null, val: null,
    fed: false,      // 收到过真实进度事件没有
    complete: false, // 收到过 loading.complete 没有
    lastEvt: 0,      // 最后一次加载事件的时刻
    canvasT: 0,      // 画布连续铺满视口的起始时刻
    end: false,      // 开始冲刺到 100
    endT: 0,
    endFrom: 0,
    reveal: null,    // 组件自己的揭幕函数，由 arm() 注入
    fired: false,    // 揭幕已触发
    dead: false,
    floor: 0,        // 引导脚本已经推到的位置，真实进度从这里往上接
    t0: now(),
  };

  // ---- 和 index.html 里那段引导脚本交接 ----------------------------------
  // 引擎产物 1.6MB，慢网下光下载就要十几秒 —— 而驱动数字的代码**就在这个包
  // 里**。所以 SSR 标记后面还内联了一小段引导脚本，从首帧就开始按时间往上
  // 推。这里把它推到的位置接管过来，并把它停掉。
  //
  // 接管之后真实进度映射到 [floor, 0.97] 而不是 [0.02, 0.97] —— 下载引擎包
  // 本来就是加载的一部分，把它算作前 floor 段，既不回退也不虚报。
  try {
    const boot = typeof window !== 'undefined' && window.__nsPreBoot;
    if (boot) {
      S.shown = clamp01(boot.get() || 0);
      S.target = S.shown;
      S.floor = S.shown;
      boot.stop();
    }
  } catch (e) { /* 没有引导脚本就按 0 起步，行为和以前一样 */ }

  // ---- 告诉 index.html 里那段兜底脚本「这边有人管了」---------------------
  // 'live'      引擎侧的驱动在跑，兜底脚本只管等
  // 'revealing' 揭幕动画已经开始，收尾归 Vue —— 兜底脚本必须彻底撒手
  // 少了这个握手，两边会同时收场：兜底脚本把 .preloader 从 DOM 里摘掉，
  // 而 Vue 还认为自己拥有这个节点，下一次更新就会往 null 父节点里插东西
  // （实测报 `Cannot read properties of null (reading 'insertBefore')`）。
  const flag = (v) => { try { window.__nsPreState = v; } catch (e) { /* noop */ } };
  flag('live');

  // 揭幕判据的几个阈值，都是实测调出来的：
  const SETTLE_MS = 500;    // loading.complete 之后再等这么久，防止后续批次又入队
  const CANVAS_MIN = 0.8;   // 画布要占到视口的多少才算「场景已经在画了」
  const CANVAS_DWELL = 6000; // 等不到 complete 时，画布稳定铺满这么久也算就绪
  const HARD_MS = 60000;    // 最后兜底：无论如何不把用户永远关在加载页里

  const onProgress = (d) => {
    if (!d || !d.total) return;
    S.fed = true;
    S.lastEvt = now();
    const lo = S.floor > 0.02 ? S.floor : 0.02;
    const t = lo + (0.97 - lo) * clamp01(d.loaded / d.total);
    if (t > S.target) S.target = t;   // 只增不减
  };
  const onComplete = () => {
    S.fed = true;
    S.complete = true;
    S.lastEvt = now();
    if (S.target < 0.97) S.target = 0.97;
  };

  // 订阅失败不该让首屏挂掉：拿不到总线就退化成时间兜底（见 tick）。
  let __nsOff = null;
  try {
    ae.on('loading.progress', onProgress);
    ae.on('loading.complete', onComplete);
    __nsOff = () => {
      try {
        ae.off('loading.progress', onProgress);
        ae.off('loading.complete', onComplete);
      } catch (e) { /* 总线已经没了，无所谓 */ }
    };
  } catch (e) { /* 见上 */ }

  // SSR 标记里已经有这几个节点了，hydration 阶段一次就能查到。
  const find = () => {
    if (S.root) return true;
    if (typeof document === 'undefined') return false;
    S.root = document.querySelector('.ns-pre');
    if (!S.root) return false;
    S.val = S.root.querySelector('.ns-pre-val');
    return true;
  };

  /** 画布是不是已经铺满视口 —— 「场景确实在渲染」的可观测代理。 */
  const canvasFull = () => {
    if (typeof document === 'undefined') return false;
    const c = document.querySelector('canvas');
    if (!c) return false;
    const r = c.getBoundingClientRect();
    return r.width >= window.innerWidth * CANVAS_MIN
      && r.height >= window.innerHeight * CANVAS_MIN;
  };

  const ready = (t) => {
    if (!canvasFull()) { S.canvasT = 0; return false; }
    if (!S.canvasT) S.canvasT = t;
    // 首选：加载队列真的清空了，而且之后没有新条目再入队。
    if (S.complete && t - S.lastEvt > SETTLE_MS) return true;
    // 备选：等不到 complete（上游换了构建 / 订阅失败），
    // 那就看画布稳定铺满够久、进度也顶到头了。
    return t - S.canvasT > CANVAS_DWELL && S.target >= 0.9;
  };

  const sprint = () => {
    if (S.end) return;
    S.end = true;
    S.endT = now();
    S.endFrom = S.shown;
  };

  /** 顺序是固定的：先到 100 → 再揭幕。倒过来看着像没加载完就跑了。 */
  const schedule = (t) => {
    if (S.fired) return;
    if (!(ready(t) || t - S.t0 > HARD_MS)) return;
    if (!S.end) { sprint(); return; }
    if (S.shown < 1) return;
    S.fired = true;
    // reveal 为空说明引擎侧的 arm 补丁没生效；此时数字停在 100，
    // 由 index.html 里那段兜底脚本收场，不会把人关在加载页里。
    if (S.reveal) { try { S.reveal(); } catch (e) { /* noop */ } }
  };

  let last = -1;
  let prev = S.t0;

  /** 把当前进度写进 DOM。抽出来是为了能在 hydration 之后立刻补一次（见文末）。 */
  const paint = () => {
    if (!find()) return;
    const pct = Math.min(100, Math.floor(S.shown * 100 + 1e-6));
    if (pct !== last) {
      last = pct;
      if (S.val) S.val.textContent = String(pct);
    }
    S.root.style.setProperty('--ns-pre-p', S.shown.toFixed(4));
  };

  const tick = () => {
    if (S.dead) return;
    S.raf = requestAnimationFrame(tick);
    const t = now();
    // 缓动必须按**时间**算，不能按帧数。首屏这段正是主线程最忙的时候
    // （4.3MB 的 v20.glb 在解析、着色器在编译），实测能连着掉到个位数帧率。
    // 早先写成「每帧补 22% 差值」的版本在软件渲染下只跑到 96 就结束了 ——
    // 慢设备上会看到同样的事。单帧最多补 400ms，避免一次长卡顿把进度掀到底。
    const dt = Math.min(400, Math.max(0, t - prev));
    prev = t;
    const el = t - S.t0;

    // 1.2s 还一个事件都没来 → 判定订阅没生效，改用时间缓动。
    // 上限压在 92%，绝不自己假装加载完 —— 真正的 100 只能由就绪判据触发。
    if (!S.fed && el > 1200 && S.floor < 0.92) {
      const x = S.floor + (0.92 - S.floor) * (1 - Math.exp(-(el - 1200) / 3300));
      if (x > S.target) S.target = x;
    }
    if (S.end) S.target = 1;

    S.shown += (S.target - S.shown) * (1 - Math.exp(-dt / (S.end ? 150 : 900)));

    // 冲刺段再加一条硬保底：sprint() 之后 500ms 必须走到 100，
    // 哪怕这 500ms 里浏览器只来得及画一帧。
    if (S.end) {
      const ramp = S.endFrom + (1 - S.endFrom) * clamp01((t - S.endT) / 500);
      if (ramp > S.shown) S.shown = ramp;
      if (S.shown > 0.9995) S.shown = 1;
    }

    paint();
    schedule(t);
    if (S.fired && S.shown >= 1) {
      S.dead = true;
      cancelAnimationFrame(S.raf);
    }
  };

  if (typeof requestAnimationFrame === 'function') S.raf = requestAnimationFrame(tick);

  // hydration 会把 .ns-pre-val 的文本按静态 vnode 复位成 "0"。setup() 是在
  // hydration 之前跑的，所以这里排一个微任务：它在整段同步 hydration 结束
  // 之后、浏览器这一帧绘制之前执行，把引导脚本推到的数字写回去。
  // 少了这一步，慢网下会看到数字从 55 掉回 0 再跳上来。
  try { Promise.resolve().then(paint); } catch (e) { /* noop */ }

  return {
    /**
     * 交出组件自己的揭幕函数。
     * setup() 的 return 语句里调用，那时 a / l 都已经初始化完毕。
     */
    arm: (fn) => { if (typeof fn === 'function') S.reveal = fn; },
    /**
     * 组件自己的揭幕函数 a() 已经开始跑了（可能是上面 schedule 触发的，
     * 也可能是上游的 setSceneLoaded）—— 补满到 100，并通知兜底脚本撒手。
     */
    done: () => { S.fired = true; flag('revealing'); sprint(); },
    /** 组件卸载 —— 退订 + 停 rAF。 */
    stop: () => {
      S.dead = true;
      try { cancelAnimationFrame(S.raf); } catch (e) { /* noop */ }
      if (__nsOff) __nsOff();
    },
  };
})();
