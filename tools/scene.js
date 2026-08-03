'use strict';
/**
 * scene.js — 把 config/scene.js 写进编译好的引擎。
 *
 * 滚动节奏存在**两个**地方，必须一起改，否则首屏（SSR 快照）和注水后的
 * 状态对不上，滚动会在第一次交互时突然跳一下：
 *
 *   1. index.html 里 `__NUXT_DATA__` 的 pinia 快照（只有桌面那一套值）
 *      —— 由 tools/payload.js 负责
 *   2. 引擎 chunk 里生成这个数组的工厂函数 `aH=n=>[{id:"1",...}, ...]`
 *      —— 由本文件负责，桌面和移动两套值都在这里
 *
 * 工厂函数的参数是 `!isMobile`：true 分支是桌面/平板（lg），false 分支是
 * 移动端（xs）。两边相同时原始代码直接写一个数字，这里保持同样的写法，
 * 让 diff 尽量小。
 */
const { fixedAsset } = require('./assets');

/** 只有这一个画质档位在打包产物里真实存在。 */
const QUALITIES = ['high'];
const COLORS = ['light', 'dark'];

class SceneError extends Error {}

/**
 * 定位 `<name>=<param>=>[{id:"1",scrollLength:...}, ...]`。
 * 数组里不含 `]`，所以可以安全地用非贪婪匹配到第一个 `]`。
 */
const RE_FACTORY =
  /\b([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)=>(\[\{id:"1",scrollLength:[^\]]*\}\])/;
const RE_ENTRY =
  /\{id:"([^"]+)",scrollLength:(?:([A-Za-z_$][\w$]*)\?(-?\d+):(-?\d+)|(-?\d+))\}/g;

/**
 * 读出引擎里现有的滚动段落定义。
 * @returns {{factory: string, param: string, literal: string, entries: Array}}
 */
function readSections(engineSrc) {
  const m = RE_FACTORY.exec(engineSrc);
  if (!m) {
    throw new SceneError(
      '在引擎 chunk 里找不到滚动段落工厂函数 `x=n=>[{id:"1",scrollLength:...}]`。\n'
      + '  src/_nuxt 大概换成了另一份构建产物，tools/scene.js 需要同步更新。');
  }
  if (RE_FACTORY.exec(engineSrc.slice(m.index + m[0].length))) {
    throw new SceneError('引擎 chunk 里出现了两个滚动段落工厂函数，无法确定改哪一个。');
  }
  const [, factory, param, literal] = m;

  const entries = [];
  RE_ENTRY.lastIndex = 0;
  let e;
  let consumed = 0;
  while ((e = RE_ENTRY.exec(literal)) !== null) {
    consumed += e[0].length;
    if (e[5] !== undefined) {
      entries.push({ id: e[1], lg: Number(e[5]), xs: Number(e[5]) });
    } else {
      if (e[2] !== param) {
        throw new SceneError(
          `段落 ${e[1]} 的三元表达式用了变量 "${e[2]}"，但工厂函数的参数是 "${param}"。`);
      }
      entries.push({ id: e[1], lg: Number(e[3]), xs: Number(e[4]) });
    }
  }
  // 逗号 + 方括号：literal 长度应当只比各条目之和多出分隔符
  if (consumed + entries.length + 1 !== literal.length) {
    throw new SceneError(
      '滚动段落数组里出现了预期之外的写法，为安全起见中止。\n  原文: ' + literal.slice(0, 200));
  }
  return { factory, param, literal, entries };
}

/** 把配置里的 `170` 或 `{ lg, xs }` 统一成 `{ lg, xs }`。 */
function normalizeSection(value, where, errors) {
  const num = (v, k) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      errors.push(`${where}.${k}: 需要一个非负数字，实际为 ${JSON.stringify(v)}`);
      return 0;
    }
    return v;
  };
  if (typeof value === 'number') return { lg: num(value, 'lg'), xs: num(value, 'xs') };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of Object.keys(value)) {
      if (k !== 'lg' && k !== 'xs') errors.push(`${where}: 未知字段 "${k}"（只能是 lg / xs）`);
    }
    return { lg: num(value.lg, 'lg'), xs: num(value.xs, 'xs') };
  }
  errors.push(`${where}: 需要一个数字，或 { lg, xs } 两个数字`);
  return { lg: 0, xs: 0 };
}

/**
 * 校验并归一化 config/scene.js。
 * @returns {{scene: object, errors: string[]}}
 */
function normalizeScene(raw, engineSrc) {
  const errors = [];
  const found = readSections(engineSrc);
  const scene = {
    quality: raw.quality === undefined ? 'high' : raw.quality,
    sound: raw.sound === undefined ? false : raw.sound,
    startColor: raw.startColor === undefined ? 'light' : raw.startColor,
    sections: [],
    copies: [],
    factory: found,
  };

  for (const k of Object.keys(raw)) {
    if (!['quality', 'sound', 'startColor', 'sections', 'assets', 'crystals',
      'creatures'].includes(k)) {
      errors.push(`scene: 未知字段 "${k}"`);
    }
  }
  if (!QUALITIES.includes(scene.quality)) {
    errors.push(`scene.quality: "${scene.quality}" 不可用`
      + `（编译好的引擎只带了 ${QUALITIES.join(' / ')} 一档）`);
  }
  if (typeof scene.sound !== 'boolean') {
    errors.push('scene.sound: 需要 true 或 false');
  }
  if (!COLORS.includes(scene.startColor)) {
    errors.push(`scene.startColor: "${scene.startColor}" 不可用（只能是 ${COLORS.join(' / ')}）`);
  }

  const list = raw.sections;
  if (!Array.isArray(list)) {
    errors.push('scene.sections: 需要一个数组');
  } else if (list.length !== found.entries.length) {
    errors.push(`scene.sections: 必须正好 ${found.entries.length} 段，实际 ${list.length} 段`
      + '（段数写死在编译好的相机运镜里，不能增删）');
  } else {
    scene.sections = list.map((v, i) =>
      Object.assign(normalizeSection(v, `scene.sections[${i}]`, errors), { id: found.entries[i].id }));
  }

  // ------------------------------------------------------------- 固定素材槽
  const a = (raw.assets || {});
  const crystals = Array.isArray(a.crystals) ? a.crystals : [];
  if (crystals.length !== 7) {
    errors.push(`scene.assets.crystals: 必须正好 7 组（对应 7 个项目），实际 ${crystals.length} 组`);
  }
  crystals.slice(0, 7).forEach((c, i) => {
    const w = `scene.assets.crystals[${i}]`;
    scene.copies.push(fixedAsset(c && c.model, `models/crystal${i}.glb`, `${w}.model`, errors));
    scene.copies.push(fixedAsset(c && c.texture, `textures/crystals/${i}.jpg`, `${w}.texture`, errors));
  });
  scene.copies.push(fixedAsset(a.environment,
    'textures/wooden_studio_19_1k.hdr', 'scene.assets.environment', errors));
  const ice = a.ice || {};
  scene.copies.push(fixedAsset(ice.color, 'textures/ice.jpg', 'scene.assets.ice.color', errors));
  scene.copies.push(fixedAsset(ice.normal, 'textures/icen.jpg', 'scene.assets.ice.normal', errors));
  scene.copies.push(fixedAsset(ice.displacement, 'textures/iced.jpg', 'scene.assets.ice.displacement', errors));
  const audio = a.audio || {};
  const hover = Array.isArray(audio.hover) ? audio.hover : [];
  if (hover.length !== 5) {
    errors.push(`scene.assets.audio.hover: 必须正好 5 个音效，实际 ${hover.length} 个`);
  }
  hover.slice(0, 5).forEach((f, i) => {
    scene.copies.push(fixedAsset(f, `audio/hover${i + 1}.mp3`, `scene.assets.audio.hover[${i}]`, errors));
  });
  scene.copies.push(fixedAsset(audio.release,
    'audio/ReleaseSpirit.mp3', 'scene.assets.audio.release', errors));
  scene.copies = scene.copies.filter((c) => c && c.src);

  return { scene, errors };
}

/** 生成替换掉整个工厂函数数组的补丁条目（结构与 tools/anchors.js 一致）。 */
function buildSceneAnchors(scene) {
  const { param, literal } = scene.factory;
  const body = scene.sections.map((s) => {
    const len = s.lg === s.xs ? String(s.lg) : `${param}?${s.lg}:${s.xs}`;
    return `{id:"${s.id}",scrollLength:${len}}`;
  }).join(',');
  return [{
    key: 'scene.sections',
    file: 'engine',
    find: literal,
    replace: `[${body}]`,
    expect: 1,
  }];
}

/** payload.js 需要的补丁：SSR 快照里只存桌面那一套。 */
function scenePayloadPatch(scene) {
  return {
    sceneQuality: scene.quality,
    soundEnabled: scene.sound,
    sectionColor: scene.startColor,
    sections: scene.sections.map((s) => s.lg),
  };
}

module.exports = {
  readSections, normalizeScene, buildSceneAnchors, scenePayloadPatch,
  SceneError, QUALITIES, COLORS,
};
