'use strict';
/**
 * blocks.test.js — config/story.js → 运行时数据的编译层。
 *
 * 这一层的职责是「把配置里能犯的错全部挡在构建期」：块数不对、字段拼错、
 * 位置描述符越界、链接写成站内死链、类名 CSS 里根本没有。挡不住的话，
 * 表现是页面某一段文字悄无声息地不出现或不动 —— 最难查的那种 bug。
 */
const { test, eq, ok, setFile } = require('./harness');
const { compileStory, caseHtml, EXPECTED_KINDS } = require('../blocks');

setFile('blocks.test.js');

const SECTIONS = 20;
const POS = { at: { s: 0 }, to: { s: 0, half: 100 }, out: { s: 1 }, gone: { s: 1, half: 150 } };

/** 造一份「刚好合法」的最小 story，方便在其上做单点破坏。 */
function baseStory(over = {}) {
  const text = (t) => ({ text: t, className: 'top-1/2 left-1/2', ...POS });
  const story = {
    smallLight: Array.from({ length: 3 }, (_, i) => text(`浅色 ${i}`)),
    smallDark: Array.from({ length: 4 }, (_, i) => text(`深色 ${i}`)),
    big: Array.from({ length: 4 }, (_, i) => text(`大字 ${i}`)),
    lines: Array.from({ length: 6 }, (_, i) => text(`行 ${i}`)),
    cases: Array.from({ length: 7 }, (_, i) => ({
      title: `项目 ${i}`, subtitle: '副标题', url: `https://example.cn/${i}`,
    })),
  };
  return { ...story, ...over };
}

const compile = (story, known) => compileStory(story, SECTIONS, known);

// --------------------------------------------------------------- 正常路径
test('blocks: 合法配置零报错，并产出 5 个数组', () => {
  const { data, errors, stats } = compile(baseStory());
  eq(errors, []);
  eq(stats, { smallLight: 3, smallDark: 4, big: 4, lines: 6, cases: 7 });
  eq(Object.keys(data).sort(), ['big', 'cases', 'lines', 'smallDark', 'smallLight']);
});

test('blocks: 位置描述符原样透传给运行时', () => {
  const { data } = compile(baseStory());
  eq(data.big[0].at, { s: 0 });
  eq(data.big[0].gone, { s: 1, half: 150 });
});

test('blocks: lines 默认 toTop=120，其他类型不带这个字段', () => {
  const { data } = compile(baseStory());
  eq(data.lines[0].toTop, 120);
  ok(!('toTop' in data.big[0]), 'big 不该有 toTop');
  const story = baseStory();
  story.lines[0].toTop = 0;
  eq(compile(story).data.lines[0].toTop, 0, 'toTop=0 不能被默认值吃掉');
});

test('blocks: 文案编译成 HTML，中文原样保留', () => {
  const story = baseStory();
  story.big[0].text = '叙事，远不止于{br}文字本身。';
  const { data, errors } = compile(story);
  eq(errors, []);
  ok(data.big[0].html.includes('叙事，远不止于'), data.big[0].html);
  ok(data.big[0].html.includes('<br>'), data.big[0].html);
});

test('blocks: html 字段作为逃生口，跳过简写编译', () => {
  const story = baseStory();
  story.big[0] = { html: '<p class="text-white">原样输出</p>', className: '', ...POS };
  const { data, errors } = compile(story);
  eq(errors, []);
  eq(data.big[0].html, '<p class="text-white">原样输出</p>');
});

test('blocks: 强调的明暗基调按块类型自动选，可用 tone 覆盖', () => {
  const story = baseStory();
  story.smallLight[0].text = '有[[强调]]的浅色块';
  story.smallDark[0].text = '有[[强调]]的深色块';
  story.big[0].text = '有[[强调]]但强制浅色';
  story.big[0].tone = 'light';
  const { data } = compile(story);
  const light = data.smallLight[0].html;
  const dark = data.smallDark[0].html;
  ok(light.includes('ns-em'), light);
  ok(dark.includes('ns-em'), dark);
  ok(light !== dark, '浅色块和深色块的强调标记应当不同');
  ok(data.big[0].html.includes(light.match(/class="([^"]*ns-em[^"]*)"/)[1]),
    '显式 tone:light 应当和 smallLight 用同一套');
});

// ----------------------------------------------------------------- 块数量
test('blocks: 块数量由预编译的 3D 场景钉死，多一个少一个都报错', () => {
  for (const kind of Object.keys(EXPECTED_KINDS)) {
    const story = baseStory();
    story[kind] = story[kind].slice(0, -1);
    const { errors } = compile(story);
    ok(errors.some((e) => e.includes(`story.${kind}`) && e.includes('必须正好')),
      `${kind} 少一项时没报错：${errors.join(' | ')}`);
  }
});

test('blocks: 某一类写成了非数组，报错但不崩', () => {
  const { errors } = compile(baseStory({ lines: '不是数组' }));
  ok(errors.some((e) => /story\.lines: 需要一个数组/.test(e)), errors.join(' | '));
});

// ------------------------------------------------------------- 字段与位置
test('blocks: 字段拼错要报出来，而不是被静默忽略', () => {
  const story = baseStory();
  story.big[0].classname = 'top-0'; // 正确写法是 className
  const { errors } = compile(story);
  ok(errors.some((e) => /story\.big\[0\]: 未知字段 "classname"/.test(e)), errors.join(' | '));
});

test('blocks: 位置描述符缺失或越界都报错，并指明是哪一块哪一项', () => {
  const story = baseStory();
  delete story.lines[2].out;
  story.smallDark[1].at = { s: 99 };
  const { errors } = compile(story);
  ok(errors.some((e) => e.includes('story.lines[2].out')), errors.join(' | '));
  ok(errors.some((e) => e.includes('story.smallDark[1].at')), errors.join(' | '));
});

// -------------------------------------------------------------------- 案例
test('cases: 生成的标签含标题、副标题与模糊底衬', () => {
  const html = caseHtml({ title: '金州勇士 & Coinbase', subtitle: '数字藏品微站' }, 'x');
  ok(html.includes('金州勇士 &amp; Coinbase'), html);
  ok(html.includes('数字藏品微站'), html);
  ok(html.includes('blur-[80px]'), html);
});

test('cases: side=right 换到右侧定位', () => {
  ok(caseHtml({ title: 'a', side: 'right' }, 'x').includes('lg:right-80'));
  ok(caseHtml({ title: 'a' }, 'x').includes('lg:left-80'));
});

test('cases: 缺标题要报错', () => {
  const story = baseStory();
  delete story.cases[3].title;
  const { errors } = compile(story);
  ok(errors.some((e) => e.includes('story.cases[3]') && /title/.test(e)), errors.join(' | '));
});

test('cases: 站内相对路径这种死链要拦下来', () => {
  const story = baseStory();
  story.cases[0].url = 'cases/warriors'; // 原站的站内路由，导出时根本没带出来
  const { errors } = compile(story);
  ok(errors.some((e) => e.includes('story.cases[0].url')), errors.join(' | '));
});

test('cases: url 留空表示不可点击，不算错误', () => {
  const story = baseStory();
  story.cases[0].url = '';
  const { data, errors } = compile(story);
  eq(errors, []);
  eq(data.cases[0].url, '');
});

test('cases: crystal 默认按顺序绑定 crystal0..6', () => {
  const { data } = compile(baseStory());
  eq(data.cases.map((c) => c.crystal),
    ['crystal0', 'crystal1', 'crystal2', 'crystal3', 'crystal4', 'crystal5', 'crystal6']);
});

// -------------------------------------------------------------- 类名兜底
test('blocks: className 里的类名 CSS 中不存在时报错并给建议', () => {
  const known = new Set(['top-1/2', 'left-1/2', 'text-white']);
  const story = baseStory();
  story.big[0].className = 'top-1/3';
  story.big[0].text = '纯文本';
  const { errors } = compile(story, known);
  const hit = errors.find((e) => e.includes('story.big[0].className'));
  ok(hit, errors.join(' | '));
  ok(/top-1\/3/.test(hit), hit);
  ok(/是不是想写/.test(hit), hit);
});

test('blocks: 已知类名不报错', () => {
  const known = new Set(['top-1/2', 'left-1/2', 'text-sans-18', 'ns-em']);
  const story = baseStory();
  for (const k of ['smallLight', 'smallDark', 'big', 'lines']) {
    story[k] = story[k].map((b) => ({ ...b, text: '纯文本', className: 'top-1/2 left-1/2' }));
  }
  // className 留空会套用默认定位类，这里显式给一个在 known 里的，
  // 免得测的是默认值而不是校验逻辑
  story.cases = story.cases.map((c) => ({ ...c, html: '<span>纯文本</span>', className: 'left-1/2' }));
  const { errors } = compile(story, known);
  const classErrors = errors.filter((e) => /CSS 里没有类名/.test(e));
  eq(classErrors, [], classErrors.join(' | '));
});
