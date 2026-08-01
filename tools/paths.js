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

module.exports = { ROOT, SRC_DIR, DIST_DIR, CONFIG_DIR, SRC, REL, defaultBase };
