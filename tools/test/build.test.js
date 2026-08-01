'use strict';
/**
 * build.test.js — 对整条构建管线的验收测试（纯 Node，不需要浏览器）。
 *
 * 覆盖三件「用别的办法验不了」的事：
 *   1. 补丁表和产物对不上时，构建必须炸，而且要说清是哪一条 —— 静默跳过
 *      正是原版 config.js 看起来生效实则没生效的根因。
 *   2. 构建是幂等的：连跑两次产物逐字节一致；没被补丁碰过的文件和 src/ 一样。
 *   3. 改配置能穿透到产物：品牌、邮箱、故事块、项目外链、场景节奏各改一处，
 *      都要在 dist/ 里找得到。
 *
 * 浏览器侧（注水之后中文还在不在）由 tools/test/e2e.py 负责。
 */
const fs = require('fs');
const path = require('path');
const {
  test, eq, ok, throws, setFile,
} = require('./harness');

const { ROOT, SRC_DIR, DIST_DIR, REL } = require('../paths');
const { build, BuildError, applyAnchors } = require('../build');

setFile('build.test.js');

const silent = { log: null };

/** 递归收集目录下所有文件的相对路径。 */
function listFiles(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

/** 临时改写一个文件，跑 fn，然后一定还原。 */
function withFile(rel, mutate, fn) {
  const file = path.join(ROOT, rel);
  const original = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, mutate(original));
    return fn();
  } finally {
    fs.writeFileSync(file, original);
  }
}

// ---------------------------------------------------------------- 基线构建
build(silent);
const baseline = listFiles(DIST_DIR)
  .map((f) => [f, fs.readFileSync(path.join(DIST_DIR, f))]);

test('build: 产出 index.html / 404.html / 打过补丁的三个 chunk / story.data.js', () => {
  for (const f of ['index.html', '404.html', REL.page, REL.engine, REL.storyData]) {
    ok(fs.existsSync(path.join(DIST_DIR, f)), `缺少 dist/${f}`);
  }
});

// ------------------------------------------------- 验收 3：补丁对不上要报错
test('build: 补丁表对不上时中止，并点名是哪一条', () => {
  const sources = { html: '<p>hello</p>', page: '', engine: '' };
  throws(
    () => applyAnchors(sources, [
      { key: 'meta.title', file: 'html', find: '<title>Nope</title>', replace: 'x', expect: 1 },
    ]),
    /meta\.title.*预期出现 1 次，实际 0 次/s,
    '缺失的锚点应当报出 key');
});

test('build: 命中次数多于预期同样中止（避免误伤同名字符串）', () => {
  const sources = { html: 'aXaXa', page: '', engine: '' };
  throws(
    () => applyAnchors(sources, [
      { key: 'dup', file: 'html', find: 'X', replace: 'Y', expect: 1 },
    ]),
    /dup.*实际 2 次/s);
});

test('build: 未知目标文件要报错，不能静默跳过', () => {
  throws(
    () => applyAnchors({ html: '' }, [
      { key: 'weird', file: 'nope', find: 'a', replace: 'b', expect: 1 },
    ]),
    /weird.*未知目标文件/s);
});

test('build: src/ 里的锚点被改坏时，整个 build() 失败并给出修复指引', () => {
  withFile('src/index.html', (s) => s.replace('<title>', '<title >'), () => {
    throws(() => build(silent), /补丁表和 src\/ 里的产物对不上/, '应当整体失败');
    let msg = '';
    try { build(silent); } catch (e) { msg = e.message; }
    ok(/meta\.title/.test(msg), `错误信息里应当出现 meta.title：\n${msg}`);
    ok(/tools\/anchors\.js/.test(msg), '错误信息里应当告诉用户去改 tools/anchors.js');
  });
  build(silent); // 还原产物
});

// ----------------------------------------------------- 验收 4：构建是幂等的
test('build: 连跑两次，dist/ 逐字节一致', () => {
  build(silent);
  const again = listFiles(DIST_DIR)
    .map((f) => [f, fs.readFileSync(path.join(DIST_DIR, f))]);
  eq(again.map((x) => x[0]), baseline.map((x) => x[0]), '文件清单不一致');
  const diff = again.filter(([f, buf], i) => !buf.equals(baseline[i][1])).map(([f]) => f);
  eq(diff, [], `这些文件两次构建结果不同：${diff.join(', ')}`);
});

test('build: 没被补丁碰过的文件和 src/ 完全一致', () => {
  const touched = new Set([REL.html, REL.page, REL.engine, REL.storyData, '404.html']);
  const differing = [];
  for (const f of listFiles(SRC_DIR)) {
    if (touched.has(f)) continue;
    const a = fs.readFileSync(path.join(SRC_DIR, f));
    const b = fs.readFileSync(path.join(DIST_DIR, f));
    if (!a.equals(b)) differing.push(f);
  }
  eq(differing, [], `不该被改动却变了：${differing.join(', ')}`);
});

test('build: dist/ 里只多出构建生成的文件', () => {
  const extra = listFiles(DIST_DIR).filter((f) => !fs.existsSync(path.join(SRC_DIR, f)));
  eq(extra.sort(), ['404.html', REL.storyData].sort());
});

// -------------------------------------------- 验收 6：改配置能穿透到产物
test('config: 改品牌与邮箱后，产物里三处都跟着变', () => {
  withFile('config/site.js', (s) => s
    .replace("email: 'hello@noomoagency.com'", "email: 'nihao@example.cn'")
    .replace("menuLabel: '菜单'", "menuLabel: '目录'"), () => {
    build(silent);
    const html = fs.readFileSync(path.join(DIST_DIR, REL.html), 'utf8');
    const page = fs.readFileSync(path.join(DIST_DIR, REL.page), 'utf8');
    const engine = fs.readFileSync(path.join(DIST_DIR, REL.engine), 'utf8');
    ok(html.includes('nihao@example.cn'), 'index.html 里没有新邮箱');
    ok(page.includes('nihao@example.cn'), 'page chunk 里没有新邮箱');
    ok(!html.includes('hello@noomoagency.com'), 'index.html 里还留着旧邮箱');
    ok(!page.includes('hello@noomoagency.com'), 'page chunk 里还留着旧邮箱');
    ok(html.includes('目录'), 'index.html 里没有新菜单名');
    ok(engine.includes('目录'), 'engine chunk 里没有新菜单名');
  });
  build(silent);
});

test('config: 改一个故事块的文案，story.data.js 跟着变', () => {
  withFile('config/story.js', (s) => s.replace('世界始终在', '世界一直在'), () => {
    build(silent);
    const data = fs.readFileSync(path.join(DIST_DIR, REL.storyData), 'utf8');
    ok(data.includes('世界一直在'), 'story.data.js 里没有新文案');
    ok(!data.includes('世界始终在'), 'story.data.js 里还留着旧文案');
  });
  build(silent);
});

test('config: 改项目外链，story.data.js 里的 url 跟着变', () => {
  withFile('config/story.js',
    (s) => s.replace(
      'https://noomoagency.com/work/microsite-golden-state-warriors-and-coinbase-collectible',
      'https://example.cn/case-1'),
    () => {
      build(silent);
      const data = fs.readFileSync(path.join(DIST_DIR, REL.storyData), 'utf8');
      ok(data.includes('https://example.cn/case-1'), 'story.data.js 里没有新链接');
    });
  build(silent);
});

test('config: 改滚动节奏，index.html 的 Nuxt 载荷与引擎里的生成器都跟着变', () => {
  withFile('config/scene.js', (s) => s.replace('{ lg: 100, xs: 50 }', '{ lg: 123, xs: 45 }'), () => {
    build(silent);
    const html = fs.readFileSync(path.join(DIST_DIR, REL.html), 'utf8');
    const engine = fs.readFileSync(path.join(DIST_DIR, REL.engine), 'utf8');
    ok(engine.includes('{id:"1",scrollLength:n?123:45}'), 'engine 里的 aH 生成器没变');
    ok(html.includes('123'), 'index.html 的载荷里没有新数值');
  });
  build(silent);
});

test('config: 配置写错时一次把所有问题报完，而不是修一个报一个', () => {
  withFile('config/site.js', (s) => s
    .replace("emphasis: 'accent'", "emphasis: '不存在的模式'")
    .replace("favicon: 'src/fav.png'", "favicon: 'src/并不存在.png'"), () => {
    let msg = '';
    try { build(silent); } catch (e) { msg = e.message; }
    ok(e2(msg, /不存在的模式/), `没报强调模式：\n${msg}`);
    ok(e2(msg, /并不存在\.png/), `没报缺失的 favicon：\n${msg}`);
    ok(/配置有 2 处问题/.test(msg), `应当一次报 2 个问题：\n${msg}`);
  });
  build(silent);
});

function e2(s, re) { return re.test(s); }

test('config: 用到 CSS 里不存在的类名时构建失败，并给出相近建议', () => {
  withFile('config/story.js',
    (s) => s.replace("className: 'lg:top-[40vh]", "className: 'lg:topp-[40vh]"), () => {
      let msg = '';
      try { build(silent); } catch (e) { msg = e.message; }
      ok(/topp-\[40vh\]/.test(msg), `没报出错误类名：\n${msg}`);
      ok(/是不是/.test(msg), `没给出相近建议：\n${msg}`);
    });
  build(silent);
});

test('config/site.js 的 basePath 必须以 / 开头结尾', () => {
  withFile('config/site.js',
    (s) => s.replace("basePath: '/noomo-storytelling/'", "basePath: 'repo'"),
    () => {
      throws(() => build(silent), /basePath 必须以 \/ 开头且以 \/ 结尾/);
    });
  build(silent);
});

// 收尾：确保测试跑完后 dist/ 回到基线状态
test('build: 测试跑完后 dist/ 与基线一致', () => {
  const now = listFiles(DIST_DIR).map((f) => [f, fs.readFileSync(path.join(DIST_DIR, f))]);
  const diff = now.filter(([f, buf], i) => !baseline[i] || !buf.equals(baseline[i][1])).map(([f]) => f);
  eq(diff, [], `残留改动：${diff.join(', ')}`);
});

module.exports = { BuildError };
