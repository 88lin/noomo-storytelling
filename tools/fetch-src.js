#!/usr/bin/env node
/**
 * tools/fetch-src.js —— 拉取上游站点快照到 src/
 *
 * 本模板只收录**自己写的**构建代码（tools/、config/、docs/），不收录
 * Noomo Agency 的模型、贴图、音频与商用字体。那些文件公开存放在克隆快照仓库里，
 * 由这个脚本按需取回，落到 src/ 下，再交给 tools/build.js 做构建期烘焙。
 *
 *   node tools/fetch-src.js            # src/ 已存在则跳过
 *   node tools/fetch-src.js --force    # 强制重取
 *
 * 零依赖，只用 Node 内置模块 + 系统 git。
 */

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

/** 上游快照仓库（公开）。PIN 是本模板全部锚点所校准的那个提交，不要随意改。 */
const UPSTREAM = 'https://github.com/88lin/noomo-storytelling-clone-zh.git';
const PIN = '1412a9f98e976cd60703a60918d40b338a4bff89';

/**
 * 需要取回的 70 个文件。清单写死而不是「整个目录照搬」，是为了让
 * 上游仓库将来新增无关文件时，本模板的 src/ 仍然是可预期的。
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

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
}

function haveGit() {
  try {
    git(['--version'], ROOT);
    return true;
  } catch {
    return false;
  }
}

function fmt(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function main() {
  const force = process.argv.includes('--force');

  if (!force && fs.existsSync(path.join(SRC_DIR, 'index.html'))) {
    const n = FILES.filter((f) => fs.existsSync(path.join(SRC_DIR, f))).length;
    if (n === FILES.length) {
      console.log(`src/ 已就绪（${n} 个文件），跳过。要重取请加 --force`);
      return;
    }
    console.log(`src/ 不完整（${n}/${FILES.length}），重新取回`);
  }

  if (!haveGit()) {
    console.error('找不到 git。请先安装 git，或手动把下面这个仓库的内容拷进 src/：');
    console.error(`  ${UPSTREAM}  @ ${PIN.slice(0, 7)}`);
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noomo-src-'));
  try {
    console.log(`拉取上游快照 ${PIN.slice(0, 7)} …`);
    // 只取一个提交的树，不要历史；blob:none 让二进制按需下载，首次仍会拉全量但省掉历史。
    git(['init', '--quiet', tmp], undefined);
    git(['remote', 'add', 'origin', UPSTREAM], tmp);
    git(['fetch', '--quiet', '--depth', '1', 'origin', PIN], tmp);
    git(['checkout', '--quiet', 'FETCH_HEAD'], tmp);

    let copied = 0;
    let bytes = 0;
    const missing = [];

    for (const rel of FILES) {
      const from = path.join(tmp, rel);
      if (!fs.existsSync(from)) {
        missing.push(rel);
        continue;
      }
      const to = path.join(SRC_DIR, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      bytes += fs.statSync(to).size;
      copied += 1;
    }

    if (missing.length) {
      console.error(`上游缺少 ${missing.length} 个文件：`);
      for (const m of missing.slice(0, 10)) console.error('  ' + m);
      process.exit(1);
    }

    for (const c of CRITICAL) {
      const p = path.join(SRC_DIR, c);
      if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
        console.error(`关键文件缺失或为空：src/${c}`);
        process.exit(1);
      }
    }

    console.log(`已写入 src/：${copied} 个文件，${fmt(bytes)}`);
    console.log('接下来跑：npm run build');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
