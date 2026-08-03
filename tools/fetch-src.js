#!/usr/bin/env node
/**
 * tools/fetch-src.js —— 校验仓库内站点快照 src/
 *
 * 原始站点快照已经随模板迁入 src/，因此构建不依赖网络或另一个仓库。
 * 这个脚本只负责验证快照完整性，再交给 tools/build.js 做构建期烘焙。
 *
 *   node tools/fetch-src.js            # 验证 src/ 是否完整
 *
 * 零依赖，只用 Node 内置模块。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

/**
 * 需要存在的 70 个文件。清单写死是为了让误删或半截快照在构建前就失败，
 * 而不是等锚点替换或浏览器加载时才暴露。
 */
const FILES = [
  '.nojekyll',
  '_nuxt/CbdjwYMp.js',
  '_nuxt/CoNJmAYZ.js',
  '_nuxt/FZFS71Nt.js',
  '_nuxt/TTNeorisTrialRegular.CykOY4gR.ttf',
  '_nuxt/builds/meta/78d24864-e7ac-4700-9d87-77655fc8a92f.json',
  '_nuxt/entry.BEbxiOYI.css',
  '_nuxt/fonnts.com-theseasons-it.CUCq9ttA.otf',
  '_nuxt/index.CeGRoErV.css',
  'audio/ReleaseSpirit.mp3',
  'audio/hover1.mp3',
  'audio/hover2.mp3',
  'audio/hover3.mp3',
  'audio/hover4.mp3',
  'audio/hover5.mp3',
  'fav.png',
  'images/loader.gif',
  'images/svg/UnionWhite.svg',
  'images/svg/backArrowNew.svg',
  'images/svg/buttonStar.svg',
  'images/svg/close.svg',
  'images/svg/cursor_border.svg',
  'images/svg/fromError.svg',
  'images/svg/logo.svg',
  'images/svg/logo2.svg',
  'images/svg/logoSimple.svg',
  'images/svg/soundBorder.svg',
  'images/text_icons/black_bird.svg',
  'images/text_icons/black_bird_2.svg',
  'images/text_icons/blue_bird.svg',
  'images/text_icons/fater_white.svg',
  'images/text_icons/flow_white.svg',
  'images/text_icons/pixelBird.png',
  'index.html',
  'libs/draco/draco_decoder.js',
  'libs/draco/draco_decoder.wasm',
  'libs/draco/draco_wasm_wrapper.js',
  'models/crystal0.glb',
  'models/crystal1.glb',
  'models/crystal2.glb',
  'models/crystal3.glb',
  'models/crystal4.glb',
  'models/crystal5.glb',
  'models/crystal6.glb',
  'models/feather.glb',
  'models/v20.glb',
  'og_image.jpg',
  'textures/404.jpg',
  'textures/LDR_RG01_0.png',
  'textures/contact.jpg',
  'textures/crystals/0.jpg',
  'textures/crystals/1.jpg',
  'textures/crystals/2.jpg',
  'textures/crystals/3.jpg',
  'textures/crystals/4.jpg',
  'textures/crystals/5.jpg',
  'textures/crystals/6.jpg',
  'textures/ftrail.jpg',
  'textures/ice.jpg',
  'textures/iced.jpg',
  'textures/icen.jpg',
  'textures/icon.png',
  'textures/mountains.png',
  'textures/noises.jpg',
  'textures/sprite.png',
  'textures/waves.jpg',
  'textures/wooden_studio_19_1k.hdr',
  'timelines/cam-mob.glb',
  'timelines/cam.glb',
  'timelines/dev.glb',
];

/** build.js 真正会去解析锚点的四个文件，缺一不可。 */
const CRITICAL = [
  'index.html',
  '_nuxt/CbdjwYMp.js',
  '_nuxt/FZFS71Nt.js',
  '_nuxt/entry.BEbxiOYI.css',
];

function main() {
  const missing = FILES.filter((rel) => {
    const file = path.join(SRC_DIR, rel);
    try { return !fs.existsSync(file) || !fs.statSync(file).isFile(); }
    catch (_) { return true; }
  });
  if (missing.length) {
    console.error(`src/ 快照不完整：缺少或为空 ${missing.length} 个文件`);
    for (const rel of missing.slice(0, 12)) console.error(`  src/${rel}`);
    console.error('请恢复仓库中的 src/ 文件后重试；此项目不访问外部仓库下载素材。');
    process.exit(1);
  }
  for (const c of CRITICAL) {
    const p = path.join(SRC_DIR, c);
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
      console.error(`关键文件缺失或为空：src/${c}`);
      process.exit(1);
    }
  }
  console.log(`src/ 已就绪（${FILES.length} 个文件），使用仓库内快照`);
}

main();
