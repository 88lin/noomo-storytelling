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
  buildPreloader, nodes, toHtml, toVnode,
  PRELOADER_DEFAULTS, PRELOADER_CLASSES, STYLES, SCOPE,
} = require('../preloader');
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
test('preloader: 三个背景色 + 强调色 + 两个光斑色都进了 CSS', () => {
  const r = buildPreloader(site({
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
  ok(base.css.includes('.preloader.preloader{background:'), base.css.slice(0, 200));
  ok(!base.css.includes(SCOPE), '主题层不该把 scope id 硬编码进去');
});

test('preloader: 配色格式写错会报错，而且一次报全', () => {
  const r = buildPreloader(site({ background: ['#101010'], accent: 'red', glow: [] }));
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
