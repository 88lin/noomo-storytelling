'use strict';
/**
 * creatures.js — 把七颗水晶换成七只程序化的磨砂小动物。
 *
 * 为什么是「换掉」而不是「换个模型文件」
 * --------------------------------------
 * config/scene.js 的 assets.crystals 允许替换 .glb，但那条路只能换**形状**：
 * 引擎照样会把新模型丢进 `oie()` 那套磨砂立方体管线（双渲染目标、法线贴图
 * 折射、峰线色散）。那套管线是给凸多面体水晶写的，喂进去一只猫，出来的是
 * 一团半透明塑料。所以这里走的是另一条路：**在项目层的 mesh 注入点上整个
 * 换掉 mesh**，让它走引擎的标准单通道渲染路径。
 *
 * 注入点只有一个（引擎 `class Jh` 的构造函数）：
 *
 *     this.mesh = oie(c, u, r)
 *  →  this.mesh = (globalThis.__nsCreature && globalThis.__nsCreature(e,c,u,r,oie)) || oie(c,u,r)
 *
 * 短路写法是刻意的：`__nsCreature` 没装上、配置关掉、或者运行时抛了任何异常，
 * 都会静默回到上游水晶。一个装饰性的视觉改造不该有能力把整站打黑。
 *
 * 几何和材质本身在两段运行时片段里：
 *   · tools/runtime/creature-sculpt.js   —— SDF 造型（globalThis.NSCreature）
 *   · tools/runtime/creature-runtime.js  —— 装配 + 磨砂着色器（__nsCreatureFactory）
 * 本文件负责校验配置、算颜色、核对引擎快照，然后把它们拼成补丁。
 *
 * 颜色是白拿的
 * ------------
 * 引擎里 `baseColor` 是一根**颜色弹簧**：静止值取 crystalRests[id]，悬停值取
 * crystalHovers[id]，两者之间由弹簧插值。只要小动物的着色器声明
 * `uniform vec3 baseColor`，Jh 的 addColorSpring 就会把它挂上去 ——
 * config/scene.js 里那套 crystals 配色和悬停动画于是直接接管了小动物，
 * 这里一行联动代码都不用写。着色器拿 baseColor 除以静止值得到「相对偏移」，
 * 所以不悬停时本体色分毫不动。
 */
const fs = require('fs');
const path = require('path');
const { isHex6, hexToRgb, rgbToHex, hexToHsl, hslToHex } = require('./color');
const { suggest } = require('./cssclasses');

// 造型模块是个 IIFE，require 进来就是为了读它的物种表（顺带确认它能解析）。
require('./runtime/creature-sculpt.js');
const SCULPT = globalThis.NSCreature;
const SPECIES = SCULPT.SPECIES;
const NAMES = SPECIES.map((s) => s.id);
const COUNT = 7;                       // 引擎写死的项目数，和 crystalHovers 等长

const CREATURE_DEFAULTS = {
  enabled: true,
  detail: 'high',
  scale: 1,
  tint: 'species',
  follow: true,
  species: null,
  eyes: true,
  debug: false,
};

/**
 * 体素边长 → 三角形数与网格化耗时。实测（node 单线程，七只合计）：
 *   0.019  1481ms  140736 tris
 *   0.023   835ms   96756 tris
 *   0.027   596ms    69356 tris
 * 表面法线来自 SDF 的解析梯度，不是面平均，所以降档只损失轮廓精度，
 * 着色一样是光滑的。
 */
const DETAIL = { high: 0.019, medium: 0.023, low: 0.027 };
const DETAIL_NAMES = Object.keys(DETAIL);
const TINTS = ['species', 'palette'];

const LABEL = {
  cat: '猫', rabbit: '兔', bear: '熊', fox: '狐狸',
  chick: '小鸡', whale: '鲸鱼', frog: '青蛙',
};

/**
 * 打光与磨砂常量。和评审用的离线钻机（tools 之外）逐值一致 —— 这七只的形状
 * 是在这套光下调过的，改这里等于把评审结论作废，所以不开放到 config。
 */
const LIGHT = {
  wrap: 0.55,
  rimStrength: 0.42,
  rimPower: 2.6,
  coreGain: 1,
  ambient: 0.74,
  keyGain: 0.28,
  fillGain: 0.13,
  keyDir: [-0.45, 0.72, 0.53],
  fillDir: [0.62, -0.28, 0.44],
  catchDir: [-0.42, 0.52, 0.74],
  gradLo: 0.02,
  gradHi: 0.86,
  exposure: 1.15,
};

/** palette 模式下从基色推 pale / deep 的推法，与离线钻机同值。 */
const GRADE = { paleSat: 0.42, paleLight: 0.62, deepSat: 1.3, deepLight: -0.19 };

/** 眼球 / 鼻头：深色、无渐变、带一点高光点，不跟随水晶配色。 */
const EYE_BASE = '#3a3350';

// ---------------------------------------------------------------- 颜色工具

/** sRGB HSL 上推饱和度与明度 —— 离线钻机里的 grade()，同一套算法。 */
function grade(hex, dSat, dLight) {
  const [h, s, l] = hexToHsl(hex);
  const nl = dLight > 0 ? l + dLight * (1 - l) : l * (1 + dLight);
  return hslToHex(h, Math.min(1, Math.max(0, s * dSat)), Math.min(1, Math.max(0, nl)));
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * 朝白色插值。THREE.Color 存的是线性值，`pale.lerp(white, t)` 插的也是线性值，
 * 所以这里必须先转线性再插 —— 直接在 sRGB 上插会偏暗。
 */
function towardWhite(hex, t) {
  const lin = hexToRgb(hex).map((v) => toLinear(v / 255));
  return rgbToHex(lin.map((v) => toSrgb(v + (1 - v) * t) * 255));
}

// ------------------------------------------------------------ 引擎快照守卫

/**
 * 注入代码里直接引用了压缩产物里的四个单字母名。它们是内容寻址的构建产物，
 * 换一份快照就可能换名字，而「名字对不上」的表现是整站白屏 —— 所以这里逐个
 * 核对它们的类定义特征串，对不上就在构建期炸掉，不要留到运行时。
 */
const ENGINE_GUARDS = [
  ['Gt = THREE.Mesh',
    'class Gt extends sn{constructor(e=new Un,t=new wc){super(),this.isMesh=!0,this.type="Mesh"'],
  ['Lt = THREE.ShaderMaterial',
    'class Lt extends Fr{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial"'],
  ['yn = THREE.BufferAttribute',
    'class yn{constructor(e,t,i=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute:'],
  ['Re = THREE.Color',
    'class Re{constructor(e,t,i){return this.isColor=!0'],
  ['H = THREE.Vector3',
    'class H{constructor(e=0,t=0,i=0){H.prototype.isVector3=!0'],
  ['图层循环的标准渲染分支',
    's.render?s.render(this,e,t):(this.renderer.setRenderTarget(t),this.renderer.render(s,e))'],
  ['弹簧往 frontMaterial / backMaterial 上写 uniforms',
    'this.mesh.frontMaterial.uniforms[e]=$e(s),this.mesh.backMaterial.uniforms[e]=$e(s)'],
];

const FIND_INSTALL = 'class Jh{static hoverEvent="Project.hover";';
const FIND_MESH = 'this.mesh=oie(c,u,r),this.id=e,';
const NEXT_MESH =
  'this.mesh=(globalThis.__nsCreature&&globalThis.__nsCreature(e,c,u,r,oie))||oie(c,u,r),this.id=e,';

// ------------------------------------------------------------------ 运行时

let SNIPPETS = null;
function snippets() {
  if (SNIPPETS === null) {
    const read = (f) => {
      const src = fs.readFileSync(path.join(__dirname, 'runtime', f), 'utf8');
      return `${src.trimEnd().replace(/;?$/, ';')}\n`;
    };
    const sculpt = read('creature-sculpt.js');
    const runtime = read('creature-runtime.js');
    if (!sculpt.includes('root.NSCreature =')) {
      throw new Error('tools/runtime/creature-sculpt.js 里找不到 NSCreature 的出口');
    }
    if (!runtime.includes('function __nsCreatureFactory(')) {
      throw new Error('tools/runtime/creature-runtime.js 里找不到 __nsCreatureFactory 的定义');
    }
    SNIPPETS = { sculpt, runtime };
  }
  return SNIPPETS;
}

// ------------------------------------------------------------------ 校验

/**
 * 归一化 + 校验 scene.creatures。
 *
 * @param {object} scene        config/scene.js 的原始对象
 * @param {object} crystalInfo  buildCrystals 的返回：{ restColors, baseColor }
 * @returns {{anchors: Array, errors: string[], warnings: string[],
 *            enabled: boolean, detail: string, tint: string, names: string[]}}
 */
function buildCreatures(scene, crystalInfo, engineSrc) {
  const errors = [];
  const warnings = [];
  const raw = (scene && scene.creatures) || {};
  const off = {
    anchors: [], errors, warnings, enabled: false,
    detail: '-', tint: '-', names: [],
  };

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('scene.creatures: 需要一个对象');
    return off;
  }
  for (const k of Object.keys(raw)) {
    if (!(k in CREATURE_DEFAULTS)) {
      const s = suggest(k, Object.keys(CREATURE_DEFAULTS));
      errors.push(`scene.creatures: 未知字段 "${k}"${s.length ? `，是不是 ${s.join(' / ')}？` : ''}`);
    }
  }

  const c = { ...CREATURE_DEFAULTS, ...raw };

  for (const k of ['enabled', 'follow', 'eyes', 'debug']) {
    if (typeof c[k] !== 'boolean') errors.push(`scene.creatures.${k}: 需要 true 或 false`);
  }
  if (!DETAIL_NAMES.includes(c.detail)) {
    errors.push(`scene.creatures.detail: "${c.detail}" 不可用（只能是 ${DETAIL_NAMES.join(' / ')}）`);
  }
  if (!TINTS.includes(c.tint)) {
    errors.push(`scene.creatures.tint: "${c.tint}" 不可用（只能是 ${TINTS.join(' / ')}）`);
  }
  if (typeof c.scale !== 'number' || !Number.isFinite(c.scale) || c.scale < 0.5 || c.scale > 1.5) {
    errors.push('scene.creatures.scale: 需要 0.5 到 1.5 之间的数字'
      + '（1 = 正好内接上游水晶的包围盒；相机运镜是编译死的，别偏太多）');
  }

  let order = SPECIES.map((_, i) => i);
  if (c.species !== null) {
    if (!Array.isArray(c.species) || c.species.length !== COUNT) {
      errors.push(`scene.creatures.species: 需要正好 ${COUNT} 个物种名的数组，或者 null（用默认顺序）`);
    } else {
      order = c.species.map((name, i) => {
        const idx = NAMES.indexOf(name);
        if (idx < 0) {
          const s = suggest(String(name), NAMES);
          errors.push(`scene.creatures.species[${i}]: "${name}" 不是可用物种`
            + `（${NAMES.join(' / ')}${s.length ? `；是不是 ${s.join(' / ')}？` : ''}）`);
        }
        return idx;
      });
      const dup = order.filter((v, i) => v >= 0 && order.indexOf(v) !== i);
      if (dup.length) {
        warnings.push('scene.creatures.species: '
          + `${[...new Set(dup)].map((i) => NAMES[i]).join(' / ')} 出现了不止一次，`
          + '重复的那几颗会长得一模一样。');
      }
    }
  }

  if (errors.length) return off;
  if (!c.enabled) {
    return {
      anchors: [], errors, warnings, enabled: false,
      detail: c.detail, tint: c.tint, names: [],
    };
  }

  // ------------------------------------------------------- 引擎快照守卫
  if (typeof engineSrc === 'string') {
    for (const [what, needle] of ENGINE_GUARDS) {
      if (engineSrc.split(needle).length - 1 !== 1) {
        errors.push(`scene.creatures: 引擎快照里找不到「${what}」，`
          + '这份 src/_nuxt 不是本模板对应的那一份，小动物注入会打黑整站。'
          + '请恢复仓库内 src/ 快照，或把 scene.creatures.enabled 设为 false。');
      }
    }
    if (errors.length) return off;
  }

  // ------------------------------------------------------------- 配色
  const rests = (crystalInfo && crystalInfo.restColors) || [];
  const fallbackRest = (crystalInfo && crystalInfo.baseColor) || '#ffffff';
  const cfgSpecies = order.map((idx, slot) => {
    const sp = SPECIES[idx];
    const hueRef = c.follow
      ? ((isHex6(rests[slot]) ? rests[slot] : fallbackRest).toLowerCase())
      : sp.hue;
    const src = c.tint === 'palette' ? hueRef : null;
    const pale = src ? grade(src, GRADE.paleSat, GRADE.paleLight) : sp.pale;
    const deep = src ? grade(src, GRADE.deepSat, GRADE.deepLight) : sp.deep;
    return { id: sp.id, pale, deep, rim: towardWhite(pale, 0.4), hueRef };
  });

  if (c.tint === 'palette' && !c.follow) {
    warnings.push('scene.creatures: tint 是 "palette" 但 follow 是 false，'
      + '本体色会退回物种自带的配色 —— 这两项一般要一起开。');
  }

  const cfg = {
    enabled: true,
    count: COUNT,
    cell: DETAIL[c.detail],
    scale: c.scale,
    eyes: c.eyes,
    debug: c.debug,
    baseMix: c.follow ? 1 : 0,
    order,
    species: cfgSpecies,
    eyeColor: {
      pale: grade(EYE_BASE, 1, 0.1),
      deep: EYE_BASE,
      rim: towardWhite(grade(EYE_BASE, 1, 0.1), 0.4),
    },
    light: LIGHT,
  };

  const { sculpt, runtime } = snippets();
  const install = `;${sculpt}${runtime}globalThis.__nsCreature=__nsCreatureFactory`
    + `({Mesh:Gt,ShaderMaterial:Lt,BufferAttribute:yn,Color:Re,Vector3:H},`
    + `${JSON.stringify(cfg)});\n`;

  const anchors = [
    {
      key: 'creatures.install',
      file: 'engine',
      find: FIND_INSTALL,
      replace: install + FIND_INSTALL,
      expect: 1,
    },
    {
      key: 'creatures.mesh', file: 'engine', find: FIND_MESH, replace: NEXT_MESH, expect: 1,
    },
  ];

  return {
    anchors,
    errors,
    warnings,
    enabled: true,
    detail: c.detail,
    tint: c.tint,
    names: order.map((i) => LABEL[NAMES[i]] || NAMES[i]),
    config: cfg,
  };
}

module.exports = {
  buildCreatures,
  grade,
  towardWhite,
  CREATURE_DEFAULTS,
  DETAIL,
  DETAIL_NAMES,
  TINTS,
  NAMES,
  LABEL,
  LIGHT,
  COUNT,
  ENGINE_GUARDS,
  FIND_INSTALL,
  FIND_MESH,
  NEXT_MESH,
};
