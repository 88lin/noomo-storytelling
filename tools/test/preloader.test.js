'use strict';
/**
 * preloader.test.js — 首屏加载页。
 *
 * 这个改动最怕的是 hydration 不匹配：SSR 首帧标记（写在 index.html 里）和
 * 客户端渲染函数（写在引擎 chunk 里）是两份不同语法的东西，必须描述同一棵
 * 树。生产版 Vue 在 hydration 时既不会重新套 class 也不会补 scope id，一旦
 * 两边不一致，首帧会闪一下旧样式，而且不报错 —— 只能靠测试守。
 *
 * 所以这里的重点是：**同一棵节点树，两个渲染器，逐字对得上**。
 */
const fs = require('fs');
const { test, eq, ok, setFile } = require('./harness');
const { SRC } = require('../paths');
const {
  buildPreloader, nodes, toHtml, toVnode, solveFaint, worstPaper,
  PRELOADER_DEFAULTS, PRELOADER_CLASSES, STYLES, SCOPE, PAPER_INK_MIN, PAD, CUT,
  FAINT_TEXT_MIN, FAINT_NUM_MIN, FEATHER, WASH_DARK,
} = require('../preloader');
const { contrast, over } = require('../color');
const { normalizeSite } = require('../assets');

setFile('preloader');

const html = fs.readFileSync(SRC.html, 'utf8');
const engine = fs.readFileSync(SRC.engine, 'utf8');
const files = { html, engine, page: fs.readFileSync(SRC.page, 'utf8') };

function countOf(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

/** 造一个已归一化的 site，只改 preloader 段。 */
function site(preloader) {
  const raw = JSON.parse(JSON.stringify(require('../../config/site')));
  raw.preloader = Object.assign({}, raw.preloader, preloader || {});
  return normalizeSite(raw);
}

const base = buildPreloader(site());

// ------------------------------------------------------------ 1. 锚点贴得上
test('preloader: 默认配置下 8 条锚点，每条都在 src/ 里恰好命中 1 次', () => {
  eq(base.errors, []);
  eq(base.anchors.length, 8, base.anchors.map((a) => a.key).join(', '));
  for (const a of base.anchors) {
    eq(a.expect, 1, `${a.key} 的 expect 应当是 1`);
    eq(countOf(files[a.file], a.find), 1,
      `${a.key} 在 ${a.file} 里没命中：${JSON.stringify(a.find.slice(0, 80))}`);
  }
});

test('preloader: 锚点 key 不重复', () => {
  const keys = base.anchors.map((a) => a.key);
  eq(new Set(keys).size, keys.length, keys.join(', '));
});

test('preloader: 揭幕时长用默认值时不下那条补丁（避免虚报改动数）', () => {
  ok(!base.anchors.some((a) => a.key === 'preloader.revealDuration'));
  const changed = buildPreloader(site({ revealDuration: 1.2 }));
  eq(changed.errors, []);
  const a = changed.anchors.find((x) => x.key === 'preloader.revealDuration');
  ok(a, '改了时长却没下补丁');
  ok(a.replace.includes('1.2'), a.replace);
});

// ------------------------------------------- 2. SSR 与客户端描述同一棵树
/** 把 vnode 表达式压成 `tag.class` 序列，好和 HTML 对比。 */
function shapeOfVnodes(expr) {
  return [...expr.matchAll(/We\("([a-z]+)",(\{[^{}]*\}|null)/g)]
    .map((m) => {
      const c = /class:"([^"]*)"/.exec(m[2]);
      return c ? `${m[1]}.${c[1]}` : m[1];
    });
}

function shapeOfHtml(s) {
  return [...s.matchAll(/<([a-z]+)((?:\s+[a-z-]+="[^"]*")*)/g)]
    .map((m) => {
      const c = /class="([^"]*)"/.exec(m[2]);
      return c ? `${m[1]}.${c[1]}` : m[1];
    });
}

test('preloader: SSR 标记与渲染函数是同一棵树（标签与 class 序列逐项相同）', () => {
  const tree = nodes({ mark: { out: 'images/svg/logoSimple.svg', alt: 'noomo' }, showPercent: true, tip: '正在加载' });
  eq(shapeOfHtml(tree.map(toHtml).join('')),
    shapeOfVnodes(tree.map((n) => toVnode(n, true)).join(',')));
});

test('preloader: SSR 标记里每个元素都带 scope id，标签之间没有空白', () => {
  const ssr = base.anchors.find((a) => a.key === 'preloader.ssr').replace;
  const tags = ssr.match(/<[a-z]+[^>]*>/g) || [];
  ok(tags.length >= 5, `只找到 ${tags.length} 个元素`);
  for (const t of tags) ok(t.includes(SCOPE), `缺 scope id：${t}`);
  ok(!/>\s+</.test(ssr), `标签之间混进了空白，hydration 会对不上：${ssr}`);
});

test('preloader: 只有最外层 vnode 带 -1 缓存标记，子节点不带', () => {
  const expr = nodes({ showPercent: true, tip: 'x' }).map((n) => toVnode(n, true)).join(',');
  // 顶层 3 个（数字 / 进度条 / 提示语），所以恰好 3 个 -1
  eq((expr.match(/,-1\)/g) || []).length, 3, expr);
});

test('preloader: 标识图片走引擎自己的 publicAssetsURL（和上游 gif 一个待遇）', () => {
  const expr = nodes({ mark: { out: 'images/svg/logoSimple.svg', alt: 'a' } })
    .map((n) => toVnode(n, true)).join(',');
  ok(expr.includes('src:VH'), expr);
  const a = base.anchors.find((x) => x.key === 'preloader.mark');
  ok(a && a.replace.includes('images/svg/logoSimple.svg'), '没改 VH 指向');
});

// ------------------------------------------------------------ 3. 各个分支
test('preloader: showPercent:false 时不渲染数字，其余照常', () => {
  const r = buildPreloader(site({ showPercent: false }));
  eq(r.errors, []);
  const ssr = r.anchors.find((a) => a.key === 'preloader.ssr').replace;
  ok(!ssr.includes('ns-pre-num'), ssr);
  ok(!ssr.includes('ns-pre-val'), ssr);
  ok(ssr.includes('ns-pre-bar'), '进度条不该跟着消失');
  // classes 故意声明成全集：它只喂给「未知类名」检查，报多了无害，
  // 报少了会让构建对着自己写出去的类名报错。
  eq(r.classes, PRELOADER_CLASSES);
});

test("preloader: tip:'' 时不渲染提示语", () => {
  const r = buildPreloader(site({ tip: '' }));
  eq(r.errors, []);
  ok(!r.anchors.find((a) => a.key === 'preloader.ssr').replace.includes('ns-pre-tip'));
});

test("preloader: mark:'' 时不渲染标识，也不下 VH 补丁", () => {
  const r = buildPreloader(site({ mark: '' }));
  eq(r.errors, []);
  ok(!r.anchors.some((a) => a.key === 'preloader.mark'));
  ok(!r.anchors.find((a) => a.key === 'preloader.ssr').replace.includes('ns-pre-mark'));
});

test('preloader: 三样全关会得到一片空白，必须报错', () => {
  const r = buildPreloader(site({ mark: '', showPercent: false, tip: '' }));
  ok(/一片空白/.test(r.errors.join('\n')), r.errors.join('\n'));
});

test('preloader: style=legacy 时什么都不做（一键回退到上游 gif）', () => {
  const r = buildPreloader(site({ style: 'legacy' }));
  eq(r.errors, []);
  eq(r.anchors, []);
  eq(r.css, '');
  eq(r.classes, []);
});

test('preloader: 未知 style 报错并列出可选值', () => {
  const r = buildPreloader(site({ style: '炫酷' }));
  ok(/未知取值/.test(r.errors[0]), r.errors[0]);
  for (const s of STYLES) ok(r.errors[0].includes(s), `没列出 ${s}`);
});

// ------------------------------------------------------------ 4. 配色注入
test('preloader: progress 的三个背景色 + 强调色 + 两个光斑色都进了 CSS', () => {
  const r = buildPreloader(site({
    style: 'progress',
    background: ['#101010', '#202020', '#303030'],
    accent: '#ABCDEF',
    glow: ['#112233', '#445566'],
  }));
  eq(r.errors, []);
  // 颜色统一转小写再写进 CSS，免得同一个色出现两种写法
  for (const c of ['#101010', '#202020', '#303030', '#abcdef']) {
    ok(r.css.includes(c), `CSS 里没有 ${c}：${r.css.slice(0, 300)}`);
  }
  ok(!r.css.includes('#ABCDEF'), '颜色应当已经归一化成小写');
  // 光斑是带透明度的，会被转成 rgba(17,34,51,…)
  ok(/rgba\(17,\s*34,\s*51/.test(r.css), `没找到 glow[0] 的 rgba：${r.css.slice(0, 400)}`);
});

test('preloader: 覆盖上游浅紫底用 .preloader.preloader，特异度打平靠顺序取胜', () => {
  // 上游是 `.preloader[data-v-724e2fc4]{background:linear-gradient(45deg,#cebdf8,#e2dbf8)}`，
  // (0,1,1)+属性 = (0,2,1)。重复类名把我们抬到 (0,2,1) 打平，再靠 CSS 出现顺序
  // 取胜。注意这里必须写 background-color + background-image 两条，不能写
  // 简写 background —— 简写会把上游 gradient 一并清成 none 我们也不吃亏，
  // 但拆开写才能让纸色和色偏分层，颗粒层再叠上去时不会互相覆盖。
  ok(base.css.includes('.preloader.preloader{background-color:'), base.css.slice(0, 240));
  ok(!base.css.includes(SCOPE), '主题层不该把 scope id 硬编码进去');
});

// ---------------------------------------------------- 4b. editorial 专属
test('preloader: 默认走 editorial，纸色铺底、墨色排字，深蓝那套一个都不进 CSS', () => {
  eq(base.style, 'editorial');
  // 纸色铺底 + 两条 radial 色偏（左上偏亮、右下偏暗），模拟纸张在光下的两极。
  // 纯平涂的一块 #f2ede3 在大屏上会显得是「一块塑料」，两极差 ~5% 就够了。
  ok(base.css.includes('.preloader.preloader{background-color:#f2ede3'), base.css.slice(0, 240));
  eq((base.css.match(/radial-gradient\(\d+% \d+% at /g) || []).length, 2);
  // 颗粒层用 z-index:-1 垫在文字下面，父级必须 isolation:isolate 起层叠上下文，
  // 否则 -1 会穿到 .preloader 的祖先后面去，整块纸都看不见。
  ok(/\.preloader\.preloader\{[^}]*isolation:isolate/.test(base.css), '纸面没起层叠上下文');
  // progress 的三个蓝和两团光斑不该出现在 editorial 的产物里 —— 两套样式
  // 共用一份配置对象，最容易犯的错就是把不属于当前样式的色也写进去。
  for (const c of ['#00276e', '#143a8a', '#062969', '#88aeff', '#4edbef', '#6248a4']) {
    ok(!base.css.includes(c), `editorial 的 CSS 里不该出现 progress 的 ${c}`);
  }
  ok(!base.css.includes('ns-pre-pulse'), 'editorial 不要那个循环脉冲动画');
});

test('preloader: editorial 的数字用衬线斜体，百分号退回无衬线正体', () => {
  ok(/\.ns-pre-num\{[^}]*font-family:var\(--font-serif\)/.test(base.css), 'ns-pre-num 没用衬线');
  ok(/\.ns-pre-num\{[^}]*font-style:italic/.test(base.css), 'ns-pre-num 没用斜体');
  ok(/\.ns-pre-pct\{[^}]*font-family:var\(--font-sans-regular\)/.test(base.css), 'ns-pre-pct 没退回无衬线');
  ok(/\.ns-pre-pct\{[^}]*font-style:normal/.test(base.css), 'ns-pre-pct 没退回正体');
});

test('preloader: editorial 里 --ns-pre-p 只驱动字形分界点这一处', () => {
  // 分界点算式收在 --ns-pre-cut 里，渐变的两个断点都读它。
  eq(countOf(base.css, '--ns-pre-cut:'), 1, base.css);
  eq(countOf(base.css, 'var(--ns-pre-cut)'), 2, base.css);
  // 发丝线不再是第二个进度条：它是版心宽（680px），数字是内容宽（两位数约
  // 408px），同一个 p 画出来的两条分界在 86% 处差 244px，读起来像两个各说
  // 各话的读数。线降级成静态地平线之后，--ns-pre-p 在 editorial 的 CSS 里
  // 只剩 --ns-pre-cut 那一处引用。
  eq(countOf(base.css, 'var(--ns-pre-p'), countOf(base.css.slice(
    base.css.indexOf('--ns-pre-cut:'),
    base.css.indexOf(';', base.css.indexOf('--ns-pre-cut:')),
  ), 'var(--ns-pre-p'), 'editorial 里除了分界点算式，别处不该再读 --ns-pre-p');
  ok(!/\.ns-pre-bar\s+i\{/.test(base.css), 'editorial 不该再有发丝线填充条');
  const ssr = base.anchors.find((a) => a.key === 'preloader.ssr').replace;
  ok(!ssr.includes('<i '), `editorial 的 SSR 标记里不该有空 <i>：${ssr}`);
  // progress 预设没有大数字，那条填充是唯一读数，必须留着
  const prog = buildPreloader(site({ style: 'progress' }));
  ok(/\.ns-pre-bar i\{[^}]*scaleX\(var\(--ns-pre-p/.test(prog.css), 'progress 的填充条丢了');
  ok(prog.anchors.find((a) => a.key === 'preloader.ssr').replace.includes('<i '),
    'progress 的 SSR 标记里应当有 <i>');
  // 字形渐变必须包在 @supports 里：color:transparent 一旦在不支持
  // background-clip:text 的浏览器上生效，整个数字会直接消失。
  const i = base.css.indexOf('color:transparent');
  ok(i !== -1, 'editorial 应当把数字设成 transparent 再用渐变裁进字形');
  const block = base.css.slice(base.css.lastIndexOf('@supports', i), i);
  ok(block.includes('background-clip:text'), `color:transparent 没被 @supports 包住：${block}`);
});

test('preloader: 斜体数字四周留了地方，background-clip 不会把笔画削平', () => {
  // 回归测试。原来这条规则没有 padding，截图里数字右缘是一条笔直的竖切线：
  // background-clip:text 的底图只铺到行盒，斜体挑到盒外的那截拿不到颜色。
  // 真实页面上量出来的最坏值：右 .174em（末位 7）、左 .079em（"5"）、
  // 上 .016em（所有数字）。低于这三个数，bug 就会悄悄回来。
  const em = (v) => Number(v.replace('em', ''));
  ok(em(PAD.right) > 0.174, `PAD.right=${PAD.right}，兜不住末位 7 的 .174em 挑出`);
  ok(em(PAD.left) > 0.079, `PAD.left=${PAD.left}，兜不住 "5" 的 .079em 左挑`);
  ok(em(PAD.top) > 0.016, `PAD.top=${PAD.top}，兜不住 .016em 顶挑`);
  eq(em(PAD.x), em(PAD.left) + em(PAD.right), 'PAD.x 必须等于左右之和');
  const rule = base.css.match(/\.ns-pre-val\{[^}]*\}/);
  ok(rule, 'editorial 应当有 .ns-pre-val 规则');
  ok(rule[0].includes(`padding:${PAD.top} ${PAD.right} 0 ${PAD.left}`), rule[0]);
  // 补出去的必须用等量负 margin 收回来，否则字形右移、百分号被推远、
  // 左侧栏那条对齐线也断了。
  ok(rule[0].includes(`margin:-${PAD.top} -${PAD.right} 0 -${PAD.left}`), rule[0]);
  // 补的这点必须待在 @supports 里 —— 不裁字形的浏览器没有这个问题。
  const i = base.css.indexOf('padding:');
  ok(base.css.slice(base.css.lastIndexOf('@supports', i), i).includes('background-clip'),
    'padding 没被 @supports 包住');
  // progress 不裁字形，不该有这些
  ok(!buildPreloader(site({ style: 'progress' })).css.includes(PAD.right),
    'progress 不用补挑出');
});

test('preloader: 分界点把 padding 从映射里减了回去，进度不会跑快', () => {
  // 只补 padding 不改算式的话，渐变的 100% 会按「字宽 + PAD」算。
  // 两位数字宽约 .9em，PAD 合计 .26em，到 85% 整个字就填满了。
  ok(CUT.includes(`100% - ${PAD.x}`), `分界点没把 PAD 减掉：${CUT}`);
  // 两头各留一段补偿：p=0 要能收到 0（左挑那截不能先黑），
  // p=1 要能顶出盒外（右挑那截不能还是淡的）。
  ok(CUT.includes('min(1,var(--ns-pre-p,0)*25)'), CUT);
  ok(CUT.includes('clamp(0,(var(--ns-pre-p,0) - .96)*25,1)'), CUT);
  // 三段合起来在 p=0/.5/1 三个点上必须分别落在 0 / 左pad+半字宽 / 满盒。
  const em = (v) => Number(v.replace('em', ''));
  const cut = (p, w) => Math.min(1, p * 25) * em(PAD.left)
    + p * (w - em(PAD.x)) + Math.min(Math.max(0, (p - 0.96) * 25), 1) * em(PAD.right);
  const box = 0.9 + em(PAD.x); // 两位数：字宽 .9em
  eq(cut(0, box), 0, 'p=0 时分界点必须是 0');
  eq(Number(cut(1, box).toFixed(6)), Number(box.toFixed(6)), 'p=1 时分界点必须到盒子右缘');
  eq(Number(((cut(0.5, box) - em(PAD.left)) / 0.9).toFixed(6)), 0.5, 'p=.5 时必须正好吃掉半个字');
  // 单调递增，中间不能有回头
  let prev = -1;
  for (let i = 0; i <= 100; i += 1) {
    const v = cut(i / 100, box);
    ok(v > prev, `分界点在 p=${i / 100} 处回头了`);
    prev = v;
  }
});

test('preloader: 用了 min()/clamp() 的分界点必须连 clamp 一起做特性检测', () => {
  // 老 WebKit 认 -webkit-background-clip:text 却不认 clamp()：渐变会在计算期
  // 整条作废回落成 none，配上 color:transparent 就是一片白。
  const i = base.css.indexOf('--ns-pre-cut:');
  const cond = base.css.slice(base.css.lastIndexOf('@supports', i), i);
  ok(cond.includes('clamp('), `@supports 条件里没检测 clamp()：${cond}`);
});

test('preloader: 白色标识在象牙纸上会被压成纯黑，深底下不动它', () => {
  ok(/\.ns-pre-mark\{[^}]*filter:brightness\(0\)/.test(base.css), 'editorial 没给标识上滤镜');
  const dark = buildPreloader(site({ style: 'progress' }));
  ok(!dark.css.includes('brightness(0)'), 'progress 是深底，压黑标识等于让它消失');
  // 写死也要认
  const forced = buildPreloader(site({ style: 'progress', markInvert: true }));
  ok(forced.css.includes('filter:brightness(0)'), 'markInvert:true 应当强制生效');
  eq(buildPreloader(site({ markInvert: 'sometimes' })).errors.length, 1);
});

test('preloader: 淡墨是解出来的，纸色变了它跟着变，且刚好卡在目标线上', () => {
  for (const paper of ['#f2ede3', '#ffffff', '#e6e0d2', '#d8d4cc']) {
    for (const target of [FAINT_NUM_MIN, FAINT_TEXT_MIN]) {
      const f = solveFaint('#14120f', paper, target);
      const got = contrast(f, paper);
      ok(got >= target, `${paper} 上按 ${target} 解出的 ${f} 只有 ${got.toFixed(2)}:1`);
      // 「够看得清的前提下最淡的那一档」：往回退一个百分点必须掉到目标线以下，
      // 否则说明解得偏保守、白白把字压深了。
      for (let a = 0.2; a <= 0.96; a += 0.01) {
        if (over('#14120f', paper, a) === f) {
          if (a > 0.2001) {
            const prev = over('#14120f', paper, a - 0.01);
            ok(contrast(prev, paper) < target, `${paper} 上按 ${target} 还能更淡：${prev}`);
          }
          break;
        }
      }
    }
    // 两档不能解成同一个色，否则双阈值就白设了
    ok(solveFaint('#14120f', paper, FAINT_TEXT_MIN) !== solveFaint('#14120f', paper, FAINT_NUM_MIN),
      `${paper} 上 4.5 档和 3 档解出了同一个色`);
  }
  // 纸越白，淡墨要越深才够对比
  ok(solveFaint('#14120f', '#ffffff') !== solveFaint('#14120f', '#d8d4cc'),
    '不同纸色应当解出不同的淡墨');
});

test('preloader: 对比度按「最暗那一档纸」算，不是按名义纸色', () => {
  const paper = '#f2ede3';
  const ink = '#14120f';
  const worst = worstPaper(paper, ink);
  // worstPaper = 暗极色偏（掺 WASH_DARK 的墨）再被颗粒往下拉 2σ。两步都是往
  // 暗走，所以结果一定比名义纸暗；对同一个淡墨，它给出的对比度也一定更低。
  ok(contrast(worst, '#000000') < contrast(paper, '#000000'), `${worst} 没比 ${paper} 暗`);
  const probe = '#7a7a7a';
  ok(contrast(probe, worst) < contrast(probe, paper), '最坏纸给出的对比度反而更高，方向搞反了');

  const faint = solveFaint(ink, worst, FAINT_TEXT_MIN);
  const ghost = solveFaint(ink, worst, FAINT_NUM_MIN);
  // 真正要守的是这两条：小字 4.5（WCAG 正文 AA），数字未填充那半 3（大号文字）。
  ok(contrast(faint, worst) >= FAINT_TEXT_MIN,
    `小字对最坏纸只有 ${contrast(faint, worst).toFixed(2)}:1`);
  ok(contrast(ghost, worst) >= FAINT_NUM_MIN,
    `数字空心那半对最坏纸只有 ${contrast(ghost, worst).toFixed(2)}:1`);
  // 解出来的两个色都得真进 CSS，否则上面白算
  ok(base.css.includes(faint), `CSS 里没有小字色 ${faint}`);
  ok(base.css.includes(ghost), `CSS 里没有数字空心色 ${ghost}`);
  // 数字两半必须自己也拉开，不然看不出填充到哪了
  ok(contrast(ink, ghost) >= 3, `数字实墨/空心两半只差 ${contrast(ink, ghost).toFixed(2)}:1`);
});

test('preloader: 接缝羽化必须窄于左右留白，否则会啃掉笔画', () => {
  // 数字的填充分界是一条 linear-gradient 硬边，直接切会有锯齿，所以在分界点
  // 两侧各留 FEATHER 做过渡。但这个过渡区一旦比 PAD 宽，进度到 0% / 100% 时
  // 羽化就会溢出到字形外的留白之外，把第一/最后一笔削掉一角。
  const em = (s) => parseFloat(String(s).replace('em', ''));
  ok(em(FEATHER) > 0, 'FEATHER 得是正数');
  ok(em(FEATHER) < em(PAD.left), `羽化 ${FEATHER} 比左留白 ${PAD.left} 还宽`);
  ok(em(FEATHER) < em(PAD.right), `羽化 ${FEATHER} 比右留白 ${PAD.right} 还宽`);
  // 渐变里两侧各出现一次，一次减一次加
  ok(base.css.includes(`- ${FEATHER})`), '渐变里没有向左的羽化');
  ok(base.css.includes(`+ ${FEATHER})`), '渐变里没有向右的羽化');
});

test('preloader: 纸面颗粒挂三类名，压得过上游 .preloader--revealing:after', () => {
  // 上游 `.preloader--revealing[data-v-724e2fc4]:after{opacity:1}` 是 (0,2,1)。
  // 颗粒层也画在 ::after 上，两类名 (0,2,1) 只能打平 —— 揭幕那一刻上游把
  // opacity 抢回 1，颗粒会突然变浓。三类名 (0,3,1) 才稳赢。
  ok(base.css.includes('.preloader.preloader.preloader::after'),
    '颗粒层选择器不是三类名');
  const i = base.css.indexOf('.preloader.preloader.preloader::after');
  const rule = base.css.slice(i, base.css.indexOf('}', i));
  ok(rule.includes('z-index:-1'), '颗粒层没垫到文字下面');
  ok(/url\("data:image\/svg\+xml,/.test(rule), '颗粒层没挂 feTurbulence 数据 URI');
});

test('preloader: 纸墨对比度不够 7:1 直接报错，不降级', () => {
  const r = buildPreloader(site({ paper: '#f2ede3', ink: '#8a8a8a' }));
  eq(r.errors.length, 1, JSON.stringify(r.errors));
  ok(r.errors[0].includes(`${PAPER_INK_MIN}:1`), r.errors[0]);
  // 同一组纸墨在 progress 下不该拦着构建 —— 那套样式根本不用纸墨
  eq(buildPreloader(site({ style: 'progress', ink: '#8a8a8a' })).errors, []);
});

test('preloader: 配色格式写错会报错，而且一次报全', () => {
  const r = buildPreloader(site({
    style: 'progress', background: ['#101010'], accent: 'red', glow: [],
  }));
  const msg = r.errors.join('\n');
  ok(/background/.test(msg), msg);
  ok(/accent/.test(msg), msg);
  ok(/glow/.test(msg), msg);
});

test('preloader: revealDuration 超出 0–10 秒报错', () => {
  ok(/revealDuration/.test(buildPreloader(site({ revealDuration: 0 })).errors.join('\n')));
  ok(/revealDuration/.test(buildPreloader(site({ revealDuration: 99 })).errors.join('\n')));
});

// ------------------------------------------------- 5. 类名与运行时的自洽
test('preloader: 声明的类名和实际写进 HTML 的完全对得上', () => {
  const ssr = base.anchors.find((a) => a.key === 'preloader.ssr').replace;
  const used = new Set([...ssr.matchAll(/class="([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('ns-')));
  for (const c of used) ok(PRELOADER_CLASSES.includes(c), `${c} 没在 PRELOADER_CLASSES 里声明`);
  for (const c of PRELOADER_CLASSES) ok(base.css.includes(`.${c}`), `${c} 没有对应样式`);
});

test('preloader: 运行时片段被完整嵌进 setup，并且三个入口都接上了', () => {
  const prog = base.anchors.find((a) => a.key === 'preloader.progress').replace;
  ok(prog.includes('const __nsPre'), '运行时没嵌进去');
  ok(prog.includes('__nsPreState'), '缺状态旗标，兜底脚本会误摘节点');
  ok(base.anchors.find((a) => a.key === 'preloader.arm').replace.includes('__nsPre.arm(a)'));
  ok(base.anchors.find((a) => a.key === 'preloader.reveal').replace.includes('__nsPre.done()'));
  ok(base.anchors.find((a) => a.key === 'preloader.cleanup').replace.includes('__nsPre.stop()'));
});

test('preloader: 兜底脚本只隐藏、绝不 remove（remove 会让 Vue 往 null 父节点插）', () => {
  const wd = base.anchors.find((a) => a.key === 'preloader.watchdog').replace;
  ok(!/\.remove\(\)/.test(wd), `兜底脚本里还有 remove()：\n${wd}`);
  ok(wd.includes('visibility'), '应当用 visibility/display 隐藏');
  ok(wd.includes('__nsPreState'), '兜底脚本要认运行时的状态旗标');
  ok(wd.includes('__nsPreBoot'), '缺引导脚本，引擎包下载期间数字会卡在 0');
});

test('preloader: 上游那段 hideReadyPreloader 轮询脚本被整段换掉了', () => {
  const wd = base.anchors.find((a) => a.key === 'preloader.watchdog');
  ok(wd.find.includes('hideReadyPreloader'), '锚点没对准克隆作者手写的那段脚本');
  ok(!wd.replace.includes('hideReadyPreloader'), '替换后不该还留着旧函数');
});

test('preloader: 默认值自洽（style 合法、颜色齐全）', () => {
  ok(STYLES.has(PRELOADER_DEFAULTS.style));
  eq(PRELOADER_DEFAULTS.background.length, 3);
  eq(PRELOADER_DEFAULTS.glow.length, 2);
});
