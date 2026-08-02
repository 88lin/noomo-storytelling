'use strict';
/**
 * Every anchor's `find` string must occur in its source file exactly `expect`
 * times. This is the test that keeps the patch table honest: the original
 * config.js in this repo "worked" only because nothing verified that its
 * replacements ever matched anything.
 */
const fs = require('fs');
const path = require('path');
const { test, eq, ok, setFile } = require('./harness');
const { SRC, SRC_DIR, FONTS } = require('../paths');
const { buildAnchors } = require('../anchors');
const { normalizeSite } = require('../assets');

setFile('anchors');

const site = normalizeSite(require('../../config/site'));

const files = {
  html: fs.readFileSync(SRC.html, 'utf8'),
  page: fs.readFileSync(SRC.page, 'utf8'),
  engine: fs.readFileSync(SRC.engine, 'utf8'),
};

function countOf(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

const anchors = buildAnchors(site);

test('anchors: table is non-trivial', () => {
  ok(anchors.length >= 40, `only ${anchors.length} anchors`);
});

for (const a of anchors) {
  test(`anchors: ${a.file}:${a.key} x${a.expect}`, () => {
    eq(countOf(files[a.file], a.find), a.expect,
      `find=${JSON.stringify(a.find.slice(0, 100))}`);
  });
}

test('anchors: no find-string is contained in another for the same file', () => {
  for (const a of anchors) {
    for (const b of anchors) {
      if (a === b || a.file !== b.file || a.find === b.find) continue;
      ok(!b.find.includes(a.find),
        `${a.key} find is contained in ${b.key} find (${a.file})`);
    }
  }
});

test('anchors: applying the table leaves no original string behind', () => {
  const out = { ...files };
  for (const a of anchors) out[a.file] = out[a.file].split(a.find).join(a.replace);
  for (const a of anchors) {
    if (a.find === a.replace) continue;
    // 插入型锚点（replace 把 find 原样包着，比如字体预载是往第一个
    // modulepreload 前面塞两条 link）本来就该留下原串。这里要守的不是
    // 「消失」而是「没被重复插入」，所以按 replace 里含几份 find 来算。
    const kept = (a.replace.split(a.find).length - 1) * a.expect;
    eq(countOf(out[a.file], a.find), kept, `${a.key} survived the patch`);
  }
});

// -------------------------------------------------------------- 外链安全
test('anchors: 打完补丁后，HTML 里没有一个裸的 target="_blank"', () => {
  // 上游头部按钮带了 rel，页脚 / 移动端菜单的社交三连没带。少了 noopener，
  // 被打开的页面能通过 window.opener 把原标签页导航走（反向标签劫持），
  // 少了 noreferrer 则会把来源地址一起送出去。现代浏览器对 _blank 默认
  // 隐含 noopener，但这是生成静态站的模板，不能替访客假设浏览器版本。
  //
  // 只认最终产物：补丁表里 rel 写在 target 前还是后都行，标签内有就算数。
  const out = { ...files };
  for (const a of anchors) out[a.file] = out[a.file].split(a.find).join(a.replace);
  const bare = (out.html.match(/<a\s[^>]*target="_blank"[^>]*>/g) || [])
    .filter((tag) => !tag.includes('noopener'));
  eq(bare.length, 0, bare.slice(0, 3).join('\n'));
});

test('anchors: 社交三连在三份产物里都补上了 rel', () => {
  const out = { ...files };
  for (const a of anchors) out[a.file] = out[a.file].split(a.find).join(a.replace);
  // 预渲染 HTML：页脚 3 条 + 移动端菜单 3 条，都是我们新加的
  eq(countOf(out.html, '<a target="_blank" rel="noopener noreferrer" href='), 6);
  // 编译后的 render 函数：菜单 3 条 + 404 页 3 条在 engine，页脚 3 条在 page
  eq(countOf(out.engine, 'rel:"noopener noreferrer"'), 6);
  eq(countOf(out.page, 'rel:"noopener noreferrer"'), 3);
  // 补之前是一个都没有的 —— 防止哪天上游换版本自带了，测试还在空转
  eq(countOf(files.html, '<a target="_blank" rel="noopener noreferrer" href='), 0);
});

// ------------------------------------------------------------- 字体预载
test('anchors: 字体预载抢在引擎包 modulepreload 前面，且带 crossorigin', () => {
  const a = anchors.find((x) => x.key === 'meta.fontPreload');
  ok(a, '默认配置下应当有字体预载锚点');
  const out = files.html.split(a.find).join(a.replace);
  const font = out.indexOf('as="font"');
  const mod = out.indexOf('rel="modulepreload"');
  ok(font !== -1 && font < mod,
    '排在 1.6 MB 引擎包后面的预载等于没预载');
  for (const f of FONTS) {
    ok(out.includes(`href="${f.href}" crossorigin>`),
      `${f.href} 少了 crossorigin —— 字体一律走 CORS，不带这个属性会白下一遍`);
    // 预载的文件必须真的在 src/ 里，否则浏览器控制台会报「预载了但没用上」
    ok(fs.existsSync(path.join(SRC_DIR, f.href.replace(/^\.\//, ''))), `${f.href} 不存在`);
  }
  // 衬线是加载页那个大数字的主角，必须排在正文无衬线前面
  ok(out.indexOf(FONTS[0].href) < out.indexOf(FONTS[1].href), '预载顺序反了');
});

test('anchors: meta.fontPreload:false 时整条锚点消失', () => {
  const off = buildAnchors(Object.assign({}, site, {
    meta: Object.assign({}, site.meta, { fontPreload: false }),
  }));
  eq(off.filter((x) => x.key === 'meta.fontPreload').length, 0);
  eq(off.length, anchors.length - 1);
});
