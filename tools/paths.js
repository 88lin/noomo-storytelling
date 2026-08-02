'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const CONFIG_DIR = path.join(ROOT, 'config');

/**
 * Hashed filenames from the original Nuxt build. They are content addresses,
 * not names we chose; if an upstream snapshot ever changes them the build
 * must fail loudly rather than half-patch, so they live in one place.
 */
const SRC = {
  html: path.join(SRC_DIR, 'index.html'),
  page: path.join(SRC_DIR, '_nuxt', 'FZFS71Nt.js'),
  engine: path.join(SRC_DIR, '_nuxt', 'CbdjwYMp.js'),
  css: path.join(SRC_DIR, '_nuxt', 'entry.BEbxiOYI.css'),
};

const REL = {
  html: 'index.html',
  page: '_nuxt/FZFS71Nt.js',
  engine: '_nuxt/CbdjwYMp.js',
  storyData: '_nuxt/story.data.js',
};

/**
 * 两款自托管字体，href 相对 index.html。
 *
 * 上游把 @font-face 写在 entry CSS 里，浏览器得先下完 CSS、排版到那个字形，
 * 才知道要去取字体文件；而加载页最显眼的就是那个巨大的衬线斜体数字。结果是
 * 整场加载都在用系统回落字体顶着，等引擎包（1.6 MB）下完、页面都快揭幕了
 * 字体才到位，数字当场跳变一下 —— font-display:swap 换来的正是这一跳。
 *
 * 预载把请求提前到 HTML 解析阶段，和引擎包并行下。顺序有意：衬线只有 19 KB
 * 却是加载页的主角，排在前面；无衬线 246 KB 是正文字体，晚一点无所谓。
 *
 * 注意 crossorigin 不能省 —— 字体请求一律走 CORS 模式，预载链接不带这个属性
 * 会被当成另一个请求，白下一遍。
 */
const FONTS = [
  { href: './_nuxt/fonnts.com-theseasons-it.CUCq9ttA.otf', type: 'font/otf' }, // TheSeasons 斜体
  { href: './_nuxt/TTNeorisTrialRegular.CykOY4gR.ttf', type: 'font/ttf' },     // TTNeoris 正常
];

/**
 * 本地预览默认挂载路径。取 config/site.js 里的 meta.basePath，这样
 * `npm run serve` 出来的 URL 和线上部署路径一致，不用手动传 BASE=。
 * 配置读不出来（比如正在改坏了）时退回 '/'，预览服务器不该因此起不来。
 */
function defaultBase() {
  try {
    const site = require(path.join(CONFIG_DIR, 'site.js'));
    const base = site && site.meta && site.meta.basePath;
    if (typeof base === 'string' && base.startsWith('/')) return base.replace(/\/*$/, '/');
  } catch (_) { /* 配置坏了不影响起服务 */ }
  return '/';
}

module.exports = { ROOT, SRC_DIR, DIST_DIR, CONFIG_DIR, SRC, REL, FONTS, defaultBase };
