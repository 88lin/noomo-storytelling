/* eslint-disable */
/**
 * creature-runtime.js — 把程序化磨砂小动物接到引擎的项目层上。
 *
 * 这个文件不是模块，是一段**代码片段**：构建时被原样拼进引擎产物里，
 * 位置在 `class Jh`（项目水晶那个类）之前（见 tools/creatures.js 的锚点表）。
 * 所以有几条硬约束：
 *   · 不要写 'use strict' / import / export / module.exports
 *   · 顶层只能是函数声明，拼进去之后前后都还是合法的模块体
 *   · 变量名统一带 __ns 前缀，避开压缩产物里那些单字母名
 *   · 依赖 tools/runtime/creature-sculpt.js 先一步拼进去，
 *     它挂出 globalThis.NSCreature
 *
 * 为什么不沿用上游那套「磨砂立方体」管线
 * --------------------------------------
 * 上游 `oie(cube, icon, normalAsset)` 造出来的 mesh 带 `render(ctx,cam,rt)`，
 * 自己开双通道：先把背面渲到 backRT，再拿 backRT 当厚度图渲正面。那是给
 * **凸多面体水晶**准备的 —— 折射、色散、峰线全靠法线贴图和厚度。小动物是
 * 一个连续的有机曲面，没有峰线可折射，套上去只会糊成一团半透明的塑料。
 *
 * 引擎的图层循环是这么写的（LayerController）：
 *
 *     s.render ? s.render(this, e, t)
 *              : (this.renderer.setRenderTarget(t), this.renderer.render(s, e))
 *
 * 也就是说**它只看 mesh 上有没有 render 方法**。我们造的 mesh 不提供 render，
 * 于是自动走标准单通道路径 —— 这就是「彻底换掉玻璃管线」的全部机制，
 * 不需要改引擎一行渲染代码。同理不设 `isGlassDispersion`，玻璃层的排序和
 * 视锥剔除分支也就不会把它当玻璃处理。
 *
 * 但有两处**必须**兼容，否则 Jh 的构造函数当场抛错：
 *
 *   addSpringProvider = (e, t) => { ...
 *     this.mesh.frontMaterial.uniforms[e] = $e(s);
 *     this.mesh.backMaterial.uniforms[e]  = $e(s); }
 *
 * 它无条件往 `frontMaterial` 和 `backMaterial` 的 uniforms 上写。所以替换后的
 * mesh 得同时提供这两个对象，且都带 uniforms。这里让 backMaterial 是个只带
 * uniforms 引用的空壳，和 frontMaterial 共用同一份 uniforms —— 反正没有
 * render 方法，谁都不会真的拿它去渲染。
 *
 * 顺带白拿一个好处：`baseColor` 在引擎里是一根**颜色弹簧**（静止值取
 * crystalRests，悬停值取 crystalHovers）。只要小动物的着色器声明
 * `uniform vec3 baseColor`，config/scene.js 里那套 crystals 配色和悬停动画
 * 就直接接管了小动物，一行联动代码都不用写。
 */
function __nsCreatureFactory(T, CFG) {
  if (!CFG || CFG.enabled === false) return null;

  var NS = globalThis.NSCreature;
  if (!NS || typeof NS.buildCreatureData !== 'function') return null;

  // ------------------------------------------------------------- 着色器
  //
  // 四项加起来就是「磨砂树脂」的读感，没有一项是高光：
  //   (1) 竖直半透明渐变 —— 光从顶上进去往下散，冠部接近白，底部是饱和的本色
  //   (2) wrap 漫反射    —— 宽终止线，近似次表面传输
  //   (3) 菲涅尔边缘     —— 薄边出射的光
  //   (4) core 项        —— 正对相机处树脂最厚，散射回相机的光**更多**，所以更亮
  // 刻意不用 MeshPhysicalMaterial.transmission：它会强制多跑一遍整场渲染，
  // 和引擎自定义的图层 / RT 循环打架。
  var VERT = [
    'varying vec3 vN;',
    'varying vec3 vV;',
    'varying float vY;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vV = -mv.xyz;',
    '  vY = position.y;',
    '  gl_Position = projectionMatrix * mv;',
    '}'].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'varying float vY;',
    'uniform vec3  uTintPale;',
    'uniform vec3  uTintDeep;',
    'uniform vec3  uRimColor;',
    'uniform vec3  uKeyDir;',
    'uniform vec3  uFillDir;',
    'uniform vec3  uCatchDir;',
    // baseColor 是引擎的颜色弹簧（静止 = crystalRests，悬停 = crystalHovers）。
    // uHueRef 是它的静止值，两者相除得到「相对静止态的色相偏移」，所以不悬停时
    // 比值恒为 1，本体色分毫不动；悬停时整只动物朝那颗水晶的悬停色偏。
    'uniform vec3  baseColor;',
    'uniform vec3  uHueRef;',
    'uniform float uBaseMix;',
    'uniform float uWrap;',
    'uniform float uRimStrength;',
    'uniform float uRimPower;',
    'uniform float uCoreGain;',
    'uniform float uAmbient;',
    'uniform float uKeyGain;',
    'uniform float uFillGain;',
    'uniform float uGradLo;',
    'uniform float uGradHi;',
    'uniform float uCatch;',
    'uniform float uExposure;',
    'float wrapped(vec3 n, vec3 l, float w) {',
    '  return clamp((dot(n, l) + w) / (1.0 + w), 0.0, 1.0);',
    '}',
    // 软肩代替 tone mapping：ACESFilmic 会把这套淡彩的中间调压暖，
    // 桃色的猫会变成焦糖色。这里只需要边缘不过曝。
    'vec3 shoulder(vec3 c) {',
    '  float s = 0.90;',
    '  vec3 over = max(c - s, vec3(0.0));',
    '  return min(c, vec3(s)) + (1.0 - s) * (1.0 - exp(-over / (1.0 - s)));',
    '}',
    'void main() {',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(vV);',
    '  if (!gl_FrontFacing) N = -N;',
    '  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);',
    '  float g = clamp((vY - uGradLo) / max(1e-4, uGradHi - uGradLo), 0.0, 1.0);',
    '  g = g * g * (3.0 - 2.0 * g);',
    '  vec3 tint = mix(uTintDeep, uTintPale, g);',
    '  if (uBaseMix > 0.0) {',
    '    vec3 LW = vec3(0.2126, 0.7152, 0.0722);',
    '    vec3 a = baseColor / max(dot(baseColor, LW), 1e-4);',
    '    vec3 b = uHueRef   / max(dot(uHueRef,   LW), 1e-4);',
    '    vec3 sh = clamp(a / max(b, vec3(0.05)), vec3(0.35), vec3(2.60));',
    '    tint *= mix(vec3(1.0), sh, uBaseMix);',
    '  }',
    '  float key  = wrapped(N, normalize(uKeyDir),  uWrap);',
    '  float fill = wrapped(N, normalize(uFillDir), uWrap);',
    '  float lum  = uAmbient + uKeyGain * key + uFillGain * fill;',
    '  float core = clamp(pow(ndv, 1.5) * uCoreGain, 0.0, 1.0);',
    '  vec3 base = tint * mix(0.93, 1.05, core);',
    '  float rim = pow(1.0 - ndv, uRimPower) * uRimStrength;',
    '  vec3 col = base * lum + uRimColor * rim;',
    '  if (uCatch > 0.0) {',
    '    float c = smoothstep(0.955, 0.995, dot(N, normalize(uCatchDir)));',
    '    col = mix(col, vec3(0.92, 0.91, 0.95), c * uCatch);',
    '  }',
    '  gl_FragColor = vec4(shoulder(col * uExposure), 1.0);',
    '}'].join('\n');

  var L = CFG.light;

  function vec3(a) { return T.Vector3 ? new T.Vector3(a[0], a[1], a[2]) : a.slice(); }

  /**
   * 一份磨砂材质。pale / deep / rim / hueRef 全是构建期算好的 sRGB 十六进制，
   * 运行时只做 new Color(hex) —— 色彩空间的换算交给引擎自己那套 ColorManagement，
   * 免得这里猜错它用的是哪个 three 版本。
   */
  function frosted(sp, o) {
    o = o || {};
    var u = {
      uTintPale: { value: new T.Color(o.pale || sp.pale) },
      uTintDeep: { value: new T.Color(o.deep || sp.deep) },
      uRimColor: { value: new T.Color(o.rim || sp.rim) },
      uKeyDir: { value: vec3(L.keyDir) },
      uFillDir: { value: vec3(L.fillDir) },
      uCatchDir: { value: vec3(L.catchDir) },
      // 引擎若给这颗水晶建了 baseColor 弹簧，下面这个默认值会被整个替换掉；
      // 没建（例如 palette: 'legacy'）时它就是静止值，比值恒为 1。
      baseColor: { value: new T.Color(sp.hueRef) },
      uHueRef: { value: new T.Color(sp.hueRef) },
      uBaseMix: { value: o.baseMix === undefined ? CFG.baseMix : o.baseMix },
      uWrap: { value: L.wrap },
      uRimStrength: { value: L.rimStrength * (o.rimScale === undefined ? 1 : o.rimScale) },
      uRimPower: { value: L.rimPower },
      uCoreGain: { value: L.coreGain * (o.coreScale === undefined ? 1 : o.coreScale) },
      uAmbient: { value: o.ambient === undefined ? L.ambient : o.ambient },
      uKeyGain: { value: L.keyGain },
      uFillGain: { value: L.fillGain },
      uGradLo: { value: 0 },
      uGradHi: { value: 1 },
      uCatch: { value: o.catch === undefined ? 0 : o.catch },
      uExposure: { value: L.exposure },
    };
    var m = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u });
    m.side = 0;          // THREE.FrontSide
    m.name = o.name || 'ns-frosted';
    return m;
  }

  // ------------------------------------------------------- 眼睛的椭球网格
  //
  // 眼球和鼻头是**单独的材质**（深色、无渐变、带一点高光点），但不值得为它们
  // 单开一个 mesh：整只动物合成一个 geometry、两个 group，就是 2 个 draw call。
  // 这里手写一个 UV 椭球，省得去猜引擎里 SphereGeometry 被压成了什么名字。
  var EYE_SEG = 20, EYE_RING = 14;

  function pushEllipsoid(P, N, I, e) {
    var a = e.r * (e.sx === undefined ? 1 : e.sx);
    var b = e.r * (e.sy === undefined ? 1 : e.sy);
    var c = e.r * (e.sz === undefined ? 0.62 : e.sz);
    var base = P.length / 3;
    for (var j = 0; j <= EYE_RING; j++) {
      var v = j / EYE_RING, phi = v * Math.PI;
      var sp = Math.sin(phi), cp = Math.cos(phi);
      for (var i = 0; i <= EYE_SEG; i++) {
        var uu = i / EYE_SEG, th = uu * Math.PI * 2;
        var x = sp * Math.cos(th), y = cp, z = sp * Math.sin(th);
        P.push(e.x + a * x, e.y + b * y, e.z + c * z);
        // 椭球的法线是 (x/a², y/b², z/c²) 归一化，不是位置本身
        var nx = a ? x / (a * a) : 0, ny = b ? y / (b * b) : 0, nz = c ? z / (c * c) : 0;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        N.push(nx / len, ny / len, nz / len);
      }
    }
    var row = EYE_SEG + 1;
    for (var jj = 0; jj < EYE_RING; jj++) {
      for (var ii = 0; ii < EYE_SEG; ii++) {
        var p0 = base + jj * row + ii, p1 = p0 + 1;
        var p2 = p0 + row, p3 = p2 + 1;
        if (jj !== 0) I.push(p0, p2, p1);
        if (jj !== EYE_RING - 1) I.push(p1, p2, p3);
      }
    }
  }

  // ---------------------------------------------------- 雕刻结果的惰性缓存
  //
  // 一只 SDF 动物在 node 上要 150–250ms。七只一次性做完是 1 秒多的主线程冻结，
  // 正好砸在揭幕动画上。所以：安装时就开始排队，一帧做一只，做完的立刻回填到
  // 已经在场上的那个空 mesh 里 —— 加载页还在的时候这活儿基本就干完了。
  var cache = {};
  var waiting = {};      // 物种下标 → 等这份数据的回调
  var queued = [];
  var pumping = false;
  var served = 0;

  function sculpt(idx) {
    if (cache[idx]) return cache[idx];
    var d = NS.buildCreatureData(idx, { cell: CFG.cell });
    var P = [], N = [], I = [];
    var eyes = CFG.eyes === false ? [] : d.eyes;
    for (var i = 0; i < eyes.length; i++) pushEllipsoid(P, N, I, eyes[i]);
    var rec = {
      body: { p: d.positions, n: d.normals, i: d.indices },
      eye: { p: new Float32Array(P), n: new Float32Array(N), i: new Uint32Array(I) },
      species: d.species,
    };
    cache[idx] = rec;
    return rec;
  }

  function pump() {
    pumping = false;
    var idx = queued.shift();
    if (idx === undefined) return;
    var rec = null;
    try { rec = sculpt(idx); } catch (err) {
      if (CFG.debug) console.warn('[ns-creature] 雕刻失败 species=' + idx, err);
    }
    var list = waiting[idx] || [];
    waiting[idx] = [];
    for (var i = 0; i < list.length; i++) {
      try { if (rec) list[i](rec); } catch (err2) {
        if (CFG.debug) console.warn('[ns-creature] 回填失败', err2);
      }
      served++;
    }
    // 全部回填完就把雕刻缓存丢掉，七只加起来两三兆的类型化数组没必要留着
    if (!queued.length && served >= CFG.count) cache = {};
    schedule();
  }

  function schedule() {
    if (pumping || !queued.length) return;
    pumping = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { setTimeout(pump, 0); });
    else setTimeout(pump, 0);
  }

  function want(idx, cb) {
    if (cache[idx]) { served++; cb(cache[idx]); return; }
    (waiting[idx] || (waiting[idx] = [])).push(cb);
    if (queued.indexOf(idx) < 0) queued.push(idx);
    schedule();
  }

  // 安装时就把七只排上队，不等第一个 Jh 构造出来
  for (var w = 0; w < CFG.order.length; w++) {
    if (queued.indexOf(CFG.order[w]) < 0) queued.push(CFG.order[w]);
  }
  schedule();

  // ------------------------------------------------------------- 装配 mesh

  /** 上游水晶的包围盒 —— 相机运镜是编译死的，小动物必须占同一块地方。 */
  function cubeBox(cube) {
    var g = cube && cube.geometry;
    if (!g) return null;
    if (!g.boundingBox) g.computeBoundingBox();
    var b = g.boundingBox;
    if (!b) return null;
    return {
      lo: [b.min.x, b.min.y, b.min.z],
      hi: [b.max.x, b.max.y, b.max.z],
    };
  }

  function bounds(arrs) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var a = 0; a < arrs.length; a++) {
      var p = arrs[a];
      for (var i = 0; i < p.length; i += 3) {
        for (var k = 0; k < 3; k++) {
          var v = p[i + k];
          if (v < lo[k]) lo[k] = v;
          if (v > hi[k]) hi[k] = v;
        }
      }
    }
    return { lo: lo, hi: hi };
  }

  /**
   * 把雕刻数据装进一个 geometry。
   *
   * 缩放**烘进顶点**，不走 mesh.scale —— 时间轴上 `Et(this.mesh,"scale",…)`
   * 正在驱动 mesh.scale，占了。等比缩放不影响法线，所以法线原样拷。
   */
  function assemble(geom, rec, box) {
    var bp = rec.body.p, ep = rec.eye.p;
    var b = bounds([bp, ep]);
    var s = 1, tx = 0, ty = 0, tz = 0;
    if (box) {
      var cw = box.hi[0] - box.lo[0], ch = box.hi[1] - box.lo[1], cd = box.hi[2] - box.lo[2];
      var aw = b.hi[0] - b.lo[0], ah = b.hi[1] - b.lo[1], ad = b.hi[2] - b.lo[2];
      s = Math.min(aw > 0 ? cw / aw : 1, ah > 0 ? ch / ah : 1, ad > 0 ? cd / ad : 1) * CFG.scale;
      tx = 0.5 * (box.lo[0] + box.hi[0]) - 0.5 * (b.lo[0] + b.hi[0]) * s;
      ty = 0.5 * (box.lo[1] + box.hi[1]) - 0.5 * (b.lo[1] + b.hi[1]) * s;
      tz = 0.5 * (box.lo[2] + box.hi[2]) - 0.5 * (b.lo[2] + b.hi[2]) * s;
    }

    var nb = bp.length / 3, ne = ep.length / 3;
    var pos = new Float32Array(bp.length + ep.length);
    var nor = new Float32Array(bp.length + ep.length);
    var q = 0, i;
    for (i = 0; i < bp.length; i += 3) {
      pos[q] = bp[i] * s + tx; pos[q + 1] = bp[i + 1] * s + ty; pos[q + 2] = bp[i + 2] * s + tz;
      q += 3;
    }
    for (i = 0; i < ep.length; i += 3) {
      pos[q] = ep[i] * s + tx; pos[q + 1] = ep[i + 1] * s + ty; pos[q + 2] = ep[i + 2] * s + tz;
      q += 3;
    }
    nor.set(rec.body.n, 0);
    nor.set(rec.eye.n, bp.length);

    var idx = new Uint32Array(rec.body.i.length + rec.eye.i.length);
    idx.set(rec.body.i, 0);
    for (i = 0; i < rec.eye.i.length; i++) idx[rec.body.i.length + i] = rec.eye.i[i] + nb;

    geom.setAttribute('position', new T.BufferAttribute(pos, 3));
    geom.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geom.setIndex(new T.BufferAttribute(idx, 1));
    geom.clearGroups();
    geom.addGroup(0, rec.body.i.length, 0);
    if (rec.eye.i.length) geom.addGroup(rec.body.i.length, rec.eye.i.length, 1);
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    // 渐变的 uGradLo/uGradHi 是在「作者坐标」里定的（每只动物都是 y∈[0,1]），
    // 顶点被缩放平移之后得跟着换算，否则渐变会整体跑到身体外面去。
    return {
      gradLo: L.gradLo * s + ty,
      gradHi: L.gradHi * s + ty,
      verts: nb + ne,
      tris: idx.length / 3,
    };
  }

  // --------------------------------------------------------------- 对外接口
  var BY_ID = {};
  for (var o = 0; o < CFG.order.length; o++) BY_ID['crystal' + o] = CFG.order[o];

  /**
   * @param {string} id            "crystal0" … "crystal6"
   * @param {object} cube          glb 里那块 Cube 网格（拿它的包围盒和构造器）
   * @param {object} icon          Icon 网格，这条路径用不到
   * @param {string} normalAsset   法线贴图 id，这条路径用不到
   * @param {Function} fallback    上游的 oie()，出任何岔子都回退到它
   * @returns {object|null}
   */
  return function nsCreature(id, cube, icon, normalAsset, fallback) {
    try {
      var idx = BY_ID[id];
      if (idx === undefined) return null;
      if (!cube || !cube.geometry) return null;

      var geom = new (cube.geometry.constructor)();
      var sp = CFG.species[idx];
      var body = frosted(sp, { name: 'ns-' + sp.id });
      var eye = frosted(sp, {
        name: 'ns-' + sp.id + '-eye',
        pale: CFG.eyeColor.pale, deep: CFG.eyeColor.deep, rim: CFG.eyeColor.rim,
        rimScale: 0.55, coreScale: 0.5, ambient: 0.86, catch: 0.85, baseMix: 0,
      });

      var mesh = new T.Mesh(geom, [body, eye]);
      mesh.name = 'ns-creature-' + sp.id;
      mesh.frustumCulled = false;   // 回填之前包围球是空的，别让它被剔没了
      mesh.userData = { nsCreature: sp.id, crystal: id };

      // Jh 的 addSpringProvider / addColorSpring 无条件往这两个上写 uniforms。
      // backMaterial 共用同一份 uniforms：没有 render 方法，它永远不会被渲染，
      // 但少了它构造函数就抛错。
      mesh.frontMaterial = body;
      mesh.backMaterial = { uniforms: body.uniforms, isNsStub: true };
      mesh.insideMesh = null;

      var box = cubeBox(cube);
      want(idx, function (rec) {
        var info = assemble(geom, rec, box);
        body.uniforms.uGradLo.value = info.gradLo;
        body.uniforms.uGradHi.value = info.gradHi;
        eye.uniforms.uGradLo.value = info.gradLo;
        eye.uniforms.uGradHi.value = info.gradHi;
        mesh.frustumCulled = true;
        if (CFG.debug) {
          console.log('[ns-creature] ' + id + ' → ' + sp.id
            + '  verts=' + info.verts + ' tris=' + info.tris);
        }
      });

      return mesh;
    } catch (err) {
      if (CFG.debug) console.warn('[ns-creature] 装配失败，回退到上游水晶', err);
      return null;
    }
  };
}
