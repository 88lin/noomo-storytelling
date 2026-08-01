'use strict';
/**
 * crystals.test.js — 7 颗水晶的配色 / 材质补丁。
 *
 * 这里守的是三件很容易悄悄错掉的事：
 *
 *   1. **补丁必须能贴上**。`crystal:{…}` 和 `crystalHovers:[…]` 是从 1.6 MB
 *      的编译产物里按字面量整体替换的，序列化器只要有一个数字格式不对
 *      （比如把 .33 写成 0.33），find 就对不上，构建会炸。所以先证明
 *      「序列化上游原值 == 产物里的原文」，逐字节。
 *   2. **数量与键集合不能变**。引擎用 `crystalHovers.length` 决定案例热区
 *      数量；每条 hover 的键集合决定给哪些参数建弹簧。第 3 颗上游本来就
 *      没有 resetDistances，不能好心补上。
 *   3. **legacy 必须真的等于上游**，一个字节都不差 —— 这是回退路径。
 */
const fs = require('fs');
const { test, eq, ok, setFile } = require('./harness');
const { SRC } = require('../paths');
const {
  buildCrystals, expand, serializeObj, serializeHovers, num, derive,
  PALETTES, PALETTE_NAMES, UPSTREAM_BASE, UPSTREAM_HOVERS,
  FIND_BASE, FIND_HOVERS, ALL_KEYS, COUNT,
} = require('../crystals');
const { isHex6 } = require('../color');

setFile('crystals');

const engine = fs.readFileSync(SRC.engine, 'utf8');

function countOf(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

/** 从生成的字面量里把 `new Re(12345)` 还原成 #RRGGBB，用来反向校验。 */
function colorsIn(src) {
  return [...src.matchAll(/new Re\((\d+)\)/g)]
    .map((m) => `#${Number(m[1]).toString(16).padStart(6, '0')}`);
}

// ------------------------------------------------------------ 1. 锚点贴得上
test('crystals: 序列化上游原值后，在引擎里恰好出现 1 次', () => {
  eq(countOf(engine, FIND_BASE), 1, 'crystal:{…} 对不上');
  eq(countOf(engine, FIND_HOVERS), 1, 'crystalHovers:[…] 对不上');
});

test('crystals: 数字格式化去掉 0. 前导零（引擎产物就是这么写的）', () => {
  eq(num(0.33), '.33');
  eq(num(-0.5), '-.5');
  eq(num(1.2), '1.2');
  eq(num(20), '20');
  eq(num(0), '0');
});

test('crystals: 颜色序列化成 new Re(十进制)', () => {
  ok(serializeObj({ baseColor: '#FFFFFF' }).includes('new Re(16777215)'));
  ok(serializeObj({ baseColor: '#000000' }).includes('new Re(0)'));
});

// -------------------------------------------------- 2. 数量与键集合不能变
test('crystals: 上游就是 7 颗，第 3 颗（下标 2）本来没有 resetDistances', () => {
  eq(COUNT, 7);
  eq(UPSTREAM_HOVERS.length, 7);
  eq(UPSTREAM_HOVERS.map((h) => Object.keys(h).length), [25, 25, 24, 25, 25, 25, 25]);
  ok(!('resetDistances' in UPSTREAM_HOVERS[2]), '第 3 颗不该有 resetDistances');
});

for (const name of Object.keys(PALETTES)) {
  test(`crystals: 预设 ${name} 逐条保留上游的键集合与键顺序`, () => {
    const { base, hovers } = expand(name);
    eq(Object.keys(base), Object.keys(UPSTREAM_BASE), 'base 键序变了');
    eq(hovers.length, COUNT);
    hovers.forEach((h, i) => {
      eq(Object.keys(h), Object.keys(UPSTREAM_HOVERS[i]), `hovers[${i}] 键序变了`);
    });
  });

  test(`crystals: 预设 ${name} 的 7 个颜色都是合法 #RRGGBB 且互不相同`, () => {
    const { hovers } = expand(name);
    const cols = hovers.map((h) => h.baseColor.toUpperCase());
    for (const c of cols) ok(isHex6(c), `${c} 不是 #RRGGBB`);
    eq(new Set(cols).size, COUNT, `7 颗里有重色：${cols.join(' ')}`);
  });

  test(`crystals: 预设 ${name} 不碰烘焙类参数（它们乘在 .glb 的顶点属性上）`, () => {
    const baked = ['distancesFactor', 'resetDistances', 'uvShiftFactor', 'peaksFactor',
      'convexityFactor', 'concavityFactor', 'colorFactor', 'decayFactor'];
    const { base, hovers } = expand(name);
    for (const k of baked) {
      eq(base[k], UPSTREAM_BASE[k], `base.${k} 被改了`);
      hovers.forEach((h, i) => {
        if (k in h) eq(h[k], UPSTREAM_HOVERS[i][k], `hovers[${i}].${k} 被改了`);
      });
    }
  });

  test(`crystals: 预设 ${name} 的所有数值都是有限数字`, () => {
    const { base, hovers } = expand(name);
    const bad = [];
    const scan = (o, where) => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string') { if (!isHex6(v)) bad.push(`${where}.${k}=${v}`); continue; }
        if (!Number.isFinite(v)) bad.push(`${where}.${k}=${v}`);
      }
    };
    scan(base, 'base');
    hovers.forEach((h, i) => scan(h, `hovers[${i}]`));
    eq(bad, []);
  });
}

test('crystals: 每个预设都有中文名，构建摘要要用', () => {
  for (const name of Object.keys(PALETTES)) {
    ok(typeof PALETTES[name].label === 'string' && PALETTES[name].label,
      `${name} 没有 label`);
  }
});

test('crystals: 上游 4 颗挤在绿-青区间的问题，aurora 把色相拉开了', () => {
  // 上游 baseColor 的色相：49 / 221 / 128 / 304 / 167 / 187 / 154
  //  —— 128 / 154 / 167 / 187 四颗全在绿到青之间，两颗饱和度只有 21% 和 56%。
  const gap = (list) => {
    const s = [...list].sort((a, b) => a - b);
    let m = 360 - s[s.length - 1] + s[0];
    for (let i = 1; i < s.length; i += 1) m = Math.min(m, s[i] - s[i - 1]);
    return m;
  };
  const hues = PALETTES.aurora.hues;
  eq(hues.length, COUNT);
  ok(gap(hues) >= 30, `aurora 最近两个色相只差 ${gap(hues)}°，还是会糊`);
  ok(PALETTES.aurora.sat >= 0.7, 'aurora 饱和度不够，多通道折射里会发灰');
});

test('crystals: 棱峰色 / 边缘色是从主色派生的，保证一颗水晶是一套色', () => {
  const d = derive('#4EDBEF');
  ok(isHex6(d.peaksColor) && isHex6(d.fringeColor));
  ok(d.peaksColor !== d.fringeColor);
});

// -------------------------------------------------------- 3. legacy 回退路径
test('crystals: palette=legacy 时不下任何补丁（产物逐字节等于上游）', () => {
  const r = buildCrystals({ crystals: { palette: 'legacy' } });
  eq(r.errors, []);
  eq(r.anchors, []);
  eq(r.palette, 'legacy');
});

test('crystals: 不写 crystals 段时走默认预设 aurora，并下 2 条补丁', () => {
  const r = buildCrystals({});
  eq(r.errors, []);
  eq(r.palette, 'aurora');
  eq(r.anchors.map((a) => a.key), ['crystals.base', 'crystals.hovers']);
  for (const a of r.anchors) {
    eq(a.file, 'engine');
    eq(a.expect, 1);
    eq(countOf(engine, a.find), 1, `${a.key} 的 find 对不上`);
  }
});

test('crystals: 生成的 hovers 字面量里恰好 7 组、21 个颜色', () => {
  const r = buildCrystals({});
  const hov = r.anchors.find((a) => a.key === 'crystals.hovers').replace;
  eq(countOf(hov, 'baseColor:'), COUNT);
  eq(colorsIn(hov).length, COUNT * 3);
});

test('crystals: base 覆盖能落到静止态字面量里', () => {
  const r = buildCrystals({ crystals: { palette: 'legacy', base: { envRefraction: 0.42 } } });
  eq(r.errors, []);
  const base = r.anchors.find((a) => a.key === 'crystals.base');
  ok(base, 'base 改了却没下补丁');
  ok(base.replace.includes('envRefraction:.42'), base.replace);
  ok(!r.anchors.some((a) => a.key === 'crystals.hovers'), 'hovers 没改却下了补丁');
});

test('crystals: items 覆盖只影响指定那一颗', () => {
  const items = [{ baseColor: '#FFD166' }, {}, {}, {}, {}, {}, {}];
  const r = buildCrystals({ crystals: { palette: 'legacy', items } });
  eq(r.errors, []);
  const hov = r.anchors.find((a) => a.key === 'crystals.hovers').replace;
  eq(colorsIn(hov)[0], '#ffd166');
  eq(r.colors[0], '#FFD166');
});

// ---------------------------------------------------------------- 4. 校验
test('crystals: items 不是 0 条或 7 条就报错，并说清为什么', () => {
  const r = buildCrystals({ crystals: { items: [{}, {}] } });
  ok(/恰好 7 条/.test(r.errors.join('\n')), r.errors.join('\n'));
  ok(/热区/.test(r.errors.join('\n')), '要解释清楚为什么必须是 7 条');
  eq(r.anchors, []);
});

test('crystals: palette=custom 时 items 必须给满', () => {
  const r = buildCrystals({ crystals: { palette: 'custom' } });
  ok(/custom/.test(r.errors.join('\n')), r.errors.join('\n'));
});

test('crystals: 未知预设名报错并列出可选值', () => {
  const r = buildCrystals({ crystals: { palette: '极光' } });
  ok(/未知取值/.test(r.errors[0]), r.errors[0]);
  for (const n of PALETTE_NAMES) ok(r.errors[0].includes(n), `没列出 ${n}`);
});

test('crystals: 未知参数报错并给出编辑距离建议', () => {
  const r = buildCrystals({ crystals: { base: { envReflexion: 1 } } });
  const msg = r.errors.join('\n');
  ok(/envReflexion/.test(msg), msg);
  ok(/envReflection/.test(msg), `没建议 envReflection：${msg}`);
});

test('crystals: 顶层写错字段名也要拦下来', () => {
  const r = buildCrystals({ crystals: { pallete: 'ice' } });
  ok(/未知字段/.test(r.errors.join('\n')), r.errors.join('\n'));
});

test('crystals: 颜色写错格式报错', () => {
  const r = buildCrystals({ crystals: { base: { baseColor: 'rgb(1,2,3)' } } });
  ok(/#RRGGBB/.test(r.errors.join('\n')), r.errors.join('\n'));
});

test('crystals: 数值位置塞了非数字报错', () => {
  const r = buildCrystals({ crystals: { base: { iorStart: '1.4' } } });
  ok(/需要一个数字/.test(r.errors.join('\n')), r.errors.join('\n'));
});

test('crystals: 给第 3 颗补 resetDistances 只告警不报错（会多一根弹簧）', () => {
  const items = [{}, {}, { resetDistances: 1 }, {}, {}, {}, {}];
  const r = buildCrystals({ crystals: { palette: 'legacy', items } });
  eq(r.errors, []);
  ok(/items\[2\]\.resetDistances/.test(r.warnings.join('\n')), r.warnings.join('\n'));
  ok(/弹簧/.test(r.warnings.join('\n')), '要解释清楚后果');
});

test('crystals: 所有 25 个键都能被覆盖，没有漏网的', () => {
  const patch = {};
  for (const k of ALL_KEYS) {
    patch[k] = ['baseColor', 'peaksColor', 'fringeColor'].includes(k) ? '#123456' : 1;
  }
  const r = buildCrystals({ crystals: { palette: 'legacy', base: patch } });
  eq(r.errors, []);
});

test('crystals: 序列化 → 反序列化，上游原值往返不变', () => {
  eq(serializeObj(UPSTREAM_BASE), FIND_BASE.slice('crystal:'.length));
  eq(serializeHovers(UPSTREAM_HOVERS), FIND_HOVERS.slice('crystalHovers:'.length));
});
