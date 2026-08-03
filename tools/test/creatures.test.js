'use strict';
/**
 * creatures.test.js — 七只程序化磨砂小动物。
 *
 * 这一层要挡住三类事故：
 *   1. 配置写错却静默生效（物种名拼错、detail 档位不存在、scale 离谱）
 *   2. 引擎快照换了一份，注入代码里那几个压缩单字母名对不上 —— 表现是白屏，
 *      所以必须在构建期炸掉
 *   3. 运行时装配出一个引擎不认的 mesh。Jh 的构造函数无条件往
 *      frontMaterial / backMaterial 的 uniforms 上写，少一个当场抛错；
 *      多一个 render 方法则会被图层循环当成自定义渲染路径
 *
 * 运行时那几条用一个假的 NSCreature 造型器跑，为的是把「装配逻辑」和
 * 「SDF 现算」分开测：前者要确定性和速度，后者只需一条冒烟测试。
 */
const fs = require('fs');
const path = require('path');
const { test, eq, ok, setFile } = require('./harness');
const { SRC } = require('../paths');
const {
  buildCreatures, grade, towardWhite, NAMES, DETAIL, LIGHT,
  ENGINE_GUARDS, FIND_INSTALL, FIND_MESH, COUNT,
} = require('../creatures');

setFile('creatures');

const ENGINE = fs.readFileSync(SRC.engine, 'utf8');
const CRYSTALS = {
  restColors: ['#f6e2c1', '#f6d0c6', '#f6d0e3', '#edd1f5', '#c7d3f5', '#c2eef5', '#ccf5e2'],
  baseColor: '#F3F1EC',
};
const SPECIES = globalThis.NSCreature.SPECIES;

const run = (creatures, engine = ENGINE) =>
  buildCreatures({ creatures }, CRYSTALS, engine);

const countOf = (hay, needle) => hay.split(needle).length - 1;

// ------------------------------------------------------------------ 配置校验

test('默认配置产出两条补丁', () => {
  const r = run({});
  eq(r.errors, [], '默认配置不该有错');
  eq(r.enabled, true);
  eq(r.anchors.map((a) => a.key), ['creatures.install', 'creatures.mesh']);
  eq(r.names, ['猫', '兔', '熊', '狐狸', '小鸡', '鲸鱼', '青蛙']);
});

test('enabled: false 不下任何补丁', () => {
  const r = run({ enabled: false });
  eq(r.errors, []);
  eq(r.enabled, false);
  eq(r.anchors.length, 0);
});

test('未知字段会被指出来，并给出拼写建议', () => {
  const r = run({ detial: 'high' });
  eq(r.anchors.length, 0);
  ok(r.errors.some((e) => e.includes('未知字段 "detial"')), r.errors.join(' | '));
  ok(r.errors.some((e) => e.includes('detail')), '应该建议 detail');
});

test('detail 只认三个档位', () => {
  ok(run({ detail: 'ultra' }).errors.some((e) => e.includes('scene.creatures.detail')));
  for (const d of Object.keys(DETAIL)) eq(run({ detail: d }).errors, [], d);
});

test('tint 只认 species / palette', () => {
  ok(run({ tint: 'rainbow' }).errors.some((e) => e.includes('scene.creatures.tint')));
  eq(run({ tint: 'palette' }).errors, []);
});

test('scale 限制在 0.5–1.5', () => {
  for (const v of [0.2, 2, '1', NaN]) {
    ok(run({ scale: v }).errors.some((e) => e.includes('scene.creatures.scale')), String(v));
  }
  eq(run({ scale: 1.2 }).errors, []);
});

test('四个开关必须是布尔值', () => {
  for (const k of ['enabled', 'follow', 'eyes', 'debug']) {
    const r = run({ [k]: 'yes' });
    ok(r.errors.some((e) => e.includes(`scene.creatures.${k}`)), k);
  }
});

test('species 必须正好七个已知物种', () => {
  ok(run({ species: ['cat'] }).errors.some((e) => e.includes('正好 7 个')));
  const bad = run({ species: ['cat', 'rabbit', 'bear', 'fox', 'chick', 'whale', 'dragon'] });
  ok(bad.errors.some((e) => e.includes('"dragon" 不是可用物种')), bad.errors.join(' | '));
  eq(bad.anchors.length, 0);
});

test('species 重排会改变 order，重复只给告警', () => {
  const order = ['whale', 'cat', 'cat', 'frog', 'fox', 'bear', 'chick'];
  const r = run({ species: order });
  eq(r.errors, []);
  eq(r.config.order, order.map((n) => NAMES.indexOf(n)));
  eq(r.names[0], '鲸鱼');
  ok(r.warnings.some((w) => w.includes('不止一次')), r.warnings.join(' | '));
});

// ------------------------------------------------------------------ 快照守卫

test('引擎快照缺任何一处特征串就在构建期报错', () => {
  for (const [what, needle] of ENGINE_GUARDS) {
    const broken = ENGINE.split(needle).join('/*gone*/');
    const r = run({}, broken);
    eq(r.anchors.length, 0, what);
    ok(r.errors.some((e) => e.includes(what)), `${what}: ${r.errors.join(' | ')}`);
  }
});

test('两条补丁的 find 在上游引擎里各出现一次', () => {
  eq(countOf(ENGINE, FIND_INSTALL), 1, 'install 锚点');
  eq(countOf(ENGINE, FIND_MESH), 1, 'mesh 锚点');
});

test('替换后的 mesh 赋值是短路写法，出岔子回退到 oie', () => {
  const a = run({}).anchors.find((x) => x.key === 'creatures.mesh');
  ok(a.replace.includes('||oie(c,u,r)'), a.replace);
  ok(a.replace.includes('globalThis.__nsCreature&&'), a.replace);
});

test('注入片段本身是合法 JS，且带上两段运行时', () => {
  const a = run({}).anchors.find((x) => x.key === 'creatures.install');
  ok(a.replace.includes('root.NSCreature ='), '缺造型模块');
  ok(a.replace.includes('function __nsCreatureFactory('), '缺装配模块');
  ok(a.replace.endsWith(FIND_INSTALL), '必须把原来的 class Jh 接回去');
  // 拼进模块体之后前后都还得是合法语法：这里把它包一层同名的局部绑定来验
  const shim = 'const Gt=null,Lt=null,yn=null,Re=null,H=null;';
  // eslint-disable-next-line no-new-func
  new Function(`${shim}${a.replace.slice(0, -FIND_INSTALL.length)}`);
});

// -------------------------------------------------------------------- 配色

test('tint: species 用物种自带的 pale/deep，rim 是 pale 朝白插值', () => {
  const sp = run({ tint: 'species' }).config.species;
  eq(sp[0].pale, SPECIES[0].pale);
  eq(sp[0].deep, SPECIES[0].deep);
  eq(sp[0].rim, towardWhite(SPECIES[0].pale, 0.4));
  eq(sp[0].hueRef, CRYSTALS.restColors[0], 'follow 开着时基准色取水晶静止色');
});

test('tint: palette 从水晶静止色现推 pale/deep', () => {
  const sp = run({ tint: 'palette' }).config.species;
  eq(sp[3].pale, grade(CRYSTALS.restColors[3], 0.42, 0.62));
  eq(sp[3].deep, grade(CRYSTALS.restColors[3], 1.3, -0.19));
});

test('follow: false 关掉色相弹簧，基准色退回物种本色', () => {
  const r = run({ follow: false });
  eq(r.config.baseMix, 0);
  eq(r.config.species[2].hueRef, SPECIES[2].hue);
  ok(run({}).config.baseMix === 1, 'follow 默认开');
});

test('没有 crystalRests 时基准色退回共用 baseColor', () => {
  const r = buildCreatures({ creatures: {} }, { restColors: [], baseColor: '#F3F1EC' }, ENGINE);
  eq(r.config.species[0].hueRef, '#f3f1ec');
});

test('detail 决定体素边长', () => {
  eq(run({ detail: 'low' }).config.cell, DETAIL.low);
  eq(run({}).config.cell, DETAIL.high);
});

// ------------------------------------------------------------------ 运行时
//
// 造一份最小的 three 替身。只实现装配用到的那几个接口 —— 多实现一点就等于
// 在测「我以为 three 是怎么工作的」，而不是测这段代码。

function makeThree() {
  class Attr { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } }
  class Geom {
    constructor() { this.attributes = {}; this.index = null; this.groups = []; }
    setAttribute(n, a) { this.attributes[n] = a; }
    setIndex(a) { this.index = a; }
    clearGroups() { this.groups = []; }
    addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
    computeBoundingBox() {
      const p = this.attributes.position.array;
      const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (p[i + k] < lo[k]) lo[k] = p[i + k];
          if (p[i + k] > hi[k]) hi[k] = p[i + k];
        }
      }
      this.boundingBox = { min: { x: lo[0], y: lo[1], z: lo[2] }, max: { x: hi[0], y: hi[1], z: hi[2] } };
    }
    computeBoundingSphere() { this.boundingSphere = { radius: 1 }; }
  }
  class Color {
    constructor(hex) { this.hex = String(hex).toLowerCase(); }
  }
  class Vector3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
  class ShaderMaterial {
    constructor(p) { Object.assign(this, p); }
  }
  class Mesh {
    constructor(g, m) { this.geometry = g; this.material = m; this.isMesh = true; }
  }
  return { Mesh, ShaderMaterial, BufferAttribute: Attr, Color, Vector3, Geom };
}

/** 假造型器：一个 2×2×2 的方块 + 两只眼睛，够验装配、缩放和分组了。 */
function fakeSculpt() {
  const positions = new Float32Array([
    -1, 0, -1, 1, 0, -1, 1, 2, -1, -1, 2, -1,
    -1, 0, 1, 1, 0, 1, 1, 2, 1, -1, 2, 1,
  ]);
  const normals = new Float32Array(positions.length).fill(0.577);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return {
    SPECIES,
    buildCreatureData() {
      return {
        positions,
        normals,
        indices,
        labels: ['body', 'body', 'body', 'body'],
        eyes: [
          { id: 'eyeL', x: -0.4, y: 1.5, z: 1, r: 0.2, sx: 1, sy: 1, sz: 0.62 },
          { id: 'eyeR', x: 0.4, y: 1.5, z: 1, r: 0.2, sx: 1, sy: 1, sz: 0.62 },
        ],
        species: SPECIES[0],
      };
    },
  };
}

const RUNTIME_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'runtime', 'creature-runtime.js'), 'utf8');
// eslint-disable-next-line no-new-func
const loadFactory = new Function(`${RUNTIME_SRC}\nreturn __nsCreatureFactory;`);

/**
 * 同步跑完整个排队泵。泵用 requestAnimationFrame + setTimeout 把七只摊到
 * 七帧上做，测试里把这两个都换成「立刻执行」，省得引入异步测试机制。
 */
function withSyncPump(fn) {
  const rafSaved = globalThis.requestAnimationFrame;
  const stSaved = globalThis.setTimeout;
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
  globalThis.setTimeout = (cb) => { cb(); return 0; };
  try { return fn(); } finally {
    globalThis.requestAnimationFrame = rafSaved;
    globalThis.setTimeout = stSaved;
  }
}

function mount(cfgOverride, sculpt) {
  const T = makeThree();
  const saved = globalThis.NSCreature;
  if (sculpt) globalThis.NSCreature = sculpt;
  try {
    const cfg = { ...run(cfgOverride || {}).config, ...(cfgOverride || {}).cfg };
    const factory = loadFactory();
    return withSyncPump(() => {
      const nsCreature = factory(T, cfg);
      const cube = new T.Mesh(new T.Geom(), null);
      cube.geometry.boundingBox = {
        min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 },
      };
      const fallback = () => ({ fallback: true });
      return { T, nsCreature, cube, fallback, cfg };
    });
  } finally { globalThis.NSCreature = saved; }
}

test('装配出的 mesh 满足 Jh 构造函数的全部前提', () => {
  const { nsCreature, cube, fallback } = mount(null, fakeSculpt());
  const mesh = withSyncPump(() => nsCreature('crystal0', cube, null, 'n', fallback));
  ok(mesh && mesh.isMesh, '得是一个 Mesh');
  ok(mesh.frontMaterial && mesh.frontMaterial.uniforms, '缺 frontMaterial.uniforms');
  ok(mesh.backMaterial && mesh.backMaterial.uniforms, '缺 backMaterial.uniforms');
  eq(mesh.frontMaterial.uniforms === mesh.backMaterial.uniforms, true, '两者共用同一份 uniforms');
  eq(mesh.render, undefined, '不能提供 render —— 提供了就会走玻璃双通道路径');
  eq(mesh.isGlassDispersion, undefined, '不能声明成玻璃层');
  ok('baseColor' in mesh.frontMaterial.uniforms, '着色器必须留出 baseColor 给颜色弹簧');
  ok('insideMesh' in mesh, 'Jh 之外的代码会读 insideMesh');
});

test('几何被缩放到上游水晶的包围盒里，眼睛单独一个 group', () => {
  const { nsCreature, cube, fallback } = mount(null, fakeSculpt());
  const mesh = withSyncPump(() => nsCreature('crystal0', cube, null, 'n', fallback));
  const g = mesh.geometry;
  const pos = g.attributes.position.array;
  const idx = g.index.array;
  eq(g.groups.length, 2, '身体 + 眼睛');
  eq(g.groups[0].materialIndex, 0);
  eq(g.groups[1].materialIndex, 1);
  eq(g.groups[0].count + g.groups[1].count, idx.length, '两个 group 要覆盖全部索引');
  eq(mesh.material.length, 2, '两份材质');
  let maxI = 0;
  for (let i = 0; i < idx.length; i++) maxI = Math.max(maxI, idx[i]);
  ok(maxI < pos.length / 3, `索引越界 ${maxI} >= ${pos.length / 3}`);
  for (let i = 0; i < pos.length; i++) ok(Number.isFinite(pos[i]), `第 ${i} 个顶点是 NaN`);
  const bb = g.boundingBox;
  ok(bb.min.x >= -0.501 && bb.max.x <= 0.501, `x 出界 ${bb.min.x}..${bb.max.x}`);
  ok(bb.min.y >= -0.501 && bb.max.y <= 0.501, `y 出界 ${bb.min.y}..${bb.max.y}`);
  ok(bb.min.z >= -0.501 && bb.max.z <= 0.501, `z 出界 ${bb.min.z}..${bb.max.z}`);
  // 等比缩放取三轴里最紧的一档，所以最长的那一轴应该正好贴住 1×1×1 的占位盒
  const dx = bb.max.x - bb.min.x;
  const dy = bb.max.y - bb.min.y;
  const dz = bb.max.z - bb.min.z;
  ok(Math.abs(Math.max(dx, dy, dz) - 1) < 0.01, `最长轴没贴满：${dx} / ${dy} / ${dz}`);
  // 眼睛凸出会让 z 变成最长轴，身体本身（2 高）因此略小于占位盒
  ok(dy > 0.9 && dy < 1.001, `高度不合理：${dy}`);
});

test('渐变的上下界跟着缩放换算，不会跑到身体外面', () => {
  const { nsCreature, cube, fallback } = mount(null, fakeSculpt());
  const mesh = withSyncPump(() => nsCreature('crystal0', cube, null, 'n', fallback));
  const u = mesh.frontMaterial.uniforms;
  const bb = mesh.geometry.boundingBox;
  ok(u.uGradLo.value > bb.min.y - 0.05 && u.uGradLo.value < bb.max.y, u.uGradLo.value);
  ok(u.uGradHi.value > u.uGradLo.value && u.uGradHi.value <= bb.max.y + 0.05, u.uGradHi.value);
  ok(u.uGradHi.value - u.uGradLo.value < LIGHT.gradHi - LIGHT.gradLo, '缩小了就该跟着缩');
});

test('scale 直接改占位大小', () => {
  const big = mount({ scale: 1 }, fakeSculpt());
  const small = mount({ scale: 0.6 }, fakeSculpt());
  const h = (m) => { const b = m.geometry.boundingBox; return b.max.y - b.min.y; };
  const a = withSyncPump(() => nsHeight(big));
  const b = withSyncPump(() => nsHeight(small));
  function nsHeight(m) {
    return h(m.nsCreature('crystal0', m.cube, null, 'n', m.fallback));
  }
  ok(Math.abs(b / a - 0.6) < 0.02, `${b} / ${a}`);
});

test('眼睛可以关掉', () => {
  const { nsCreature, cube, fallback } = mount({ eyes: false }, fakeSculpt());
  const mesh = withSyncPump(() => nsCreature('crystal0', cube, null, 'n', fallback));
  eq(mesh.geometry.groups.length, 1, '关掉之后只剩身体那一组');
});

test('七个 id 各自映射到一个物种，认不出的 id 返回 null', () => {
  const { nsCreature, cube, fallback } = mount(null, fakeSculpt());
  withSyncPump(() => {
    for (let i = 0; i < COUNT; i++) {
      const m = nsCreature(`crystal${i}`, cube, null, 'n', fallback);
      ok(m && m.userData.nsCreature === NAMES[i], `crystal${i}`);
    }
    eq(nsCreature('crystal9', cube, null, 'n', fallback), null);
  });
});

test('cube 缺几何 / 造型器抛错，都返回 null 让引擎回退', () => {
  const { nsCreature, fallback, T } = mount(null, fakeSculpt());
  withSyncPump(() => {
    eq(nsCreature('crystal0', null, null, 'n', fallback), null);
    eq(nsCreature('crystal0', { geometry: null }, null, 'n', fallback), null);
    // 造型器炸了不该让 nsCreature 抛出去 —— mesh 先返回，几何是后填的
    const boom = { SPECIES, buildCreatureData() { throw new Error('boom'); } };
    const saved = globalThis.NSCreature;
    globalThis.NSCreature = boom;
    try {
      const f2 = loadFactory()(T, run({}).config);
      const cube2 = new T.Mesh(new T.Geom(), null);
      cube2.geometry.boundingBox = {
        min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 },
      };
      const m = f2('crystal0', cube2, null, 'n', fallback);
      ok(m && m.isMesh, '仍然要给出一个 mesh');
      eq(m.geometry.index, null, '几何回填失败就保持空的');
    } finally { globalThis.NSCreature = saved; }
  });
});

test('enabled: false / 造型器没装上，工厂直接返回 null', () => {
  const T = makeThree();
  eq(loadFactory()(T, { enabled: false }), null);
  const saved = globalThis.NSCreature;
  globalThis.NSCreature = undefined;
  try { eq(loadFactory()(T, run({}).config), null); } finally { globalThis.NSCreature = saved; }
});

test('冒烟：真造型器现算一只，顶点法线都是有限数', () => {
  const T = makeThree();
  const cfg = { ...run({ detail: 'low' }).config, order: [0], count: 1 };
  const factory = loadFactory();
  const mesh = withSyncPump(() => {
    const ns = factory(T, cfg);
    const cube = new T.Mesh(new T.Geom(), null);
    cube.geometry.boundingBox = {
      min: { x: -0.6, y: -0.6, z: -0.6 }, max: { x: 0.6, y: 0.6, z: 0.6 },
    };
    return ns('crystal0', cube, null, 'n', () => null);
  });
  const g = mesh.geometry;
  ok(g.index && g.index.array.length > 3000, `三角形太少：${g.index && g.index.array.length}`);
  const p = g.attributes.position.array; const n = g.attributes.normal.array;
  eq(p.length, n.length);
  for (let i = 0; i < p.length; i += 331) ok(Number.isFinite(p[i]) && Number.isFinite(n[i]), `第 ${i} 项非有限数`);
  eq(g.groups.length, 2);
});
