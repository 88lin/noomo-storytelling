'use strict';
/**
 * assets.js — turn the friendly path strings in config/*.js into concrete
 * copy jobs, and normalise them into the `{ src, out }` shape the anchor table
 * and the story runtime expect.
 *
 * Two flavours of destination:
 *
 *   free   — the engine reads the path from a string we also patch, so the
 *            output filename can follow the user's file (logo, og image...).
 *   fixed  — the engine builds the path arithmetically, e.g.
 *            `./models/crystal${i}.glb`, so a replacement file has to be
 *            copied *onto* that canonical name.
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./paths');
const { PRELOADER_DEFAULTS } = require('./preloader');

/** Destination directory for each "free" asset slot, relative to dist/. */
const FREE_SLOTS = {
  'meta.ogImage': '',
  'meta.favicon': '',
  'brand.logo': 'images/svg',
  'brand.logoHover': 'images/svg',
  'brand.logoSimple': 'images/svg',
  'preloader.mark': 'images/svg',
};

class ConfigError extends Error {}

function resolveSrc(value, where, errors) {
  const rel = typeof value === 'string' ? value : value && value.src;
  if (typeof rel !== 'string' || !rel.trim()) {
    errors.push(`${where}: 需要一个文件路径（字符串），实际拿到 ${JSON.stringify(value)}`);
    return null;
  }
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) {
    errors.push(`${where}: 路径必须在仓库内部，实际为 ${rel}`);
    return null;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    errors.push(`${where}: 找不到文件 ${rel}`);
    return null;
  }
  return { rel, abs };
}

/** Free slot: output keeps the user's filename inside the slot's directory. */
function freeAsset(value, slot, where, errors) {
  const r = resolveSrc(value, where, errors);
  if (!r) return { src: null, out: '' };
  const explicit = typeof value === 'object' && value && value.out;
  const out = explicit
    ? String(value.out).replace(/^\/+/, '')
    : path.posix.join(FREE_SLOTS[slot], path.basename(r.rel));
  return { src: r.abs, srcRel: r.rel, out };
}

/** Fixed slot: output name is dictated by the engine. */
function fixedAsset(value, out, where, errors) {
  const r = resolveSrc(value, where, errors);
  if (!r) return { src: null, out };
  return { src: r.abs, srcRel: r.rel, out };
}

/**
 * Rewrites the asset string fields of config/site.js in place (on a shallow
 * clone) so downstream code can rely on `.out`.
 */
/**
 * Fallbacks for optional sections, so an older config/site.js still builds.
 *
 * preloader 的默认值不在这里重抄一遍，直接引用 tools/preloader.js 里的那份 ——
 * 两处各写一份迟早会漂。menu 则相反：它的默认值只活在 tools/menu.js 里，
 * 因为 menu 段完全不含资源路径，normalizeSite 不需要认识它。
 */
const SITE_DEFAULTS = {
  errorPage: {
    message: '别在这儿迷路，回首页看看',
    rights: '© 版权所有',
    backAlt: '返回首页',
  },
  preloader: PRELOADER_DEFAULTS,
};

function normalizeSite(raw) {
  const errors = [];
  const site = JSON.parse(JSON.stringify(raw));
  for (const [section, defaults] of Object.entries(SITE_DEFAULTS)) {
    // 默认值深拷一份再合并：里面有数组（preloader.background / glow），
    // 直接 Object.assign 会把同一个数组实例塞进每次构建的结果里。
    site[section] = Object.assign({}, JSON.parse(JSON.stringify(defaults)), site[section] || {});
  }

  // 部署根路径：所有站内资源都是相对引用，只有 404 页需要一个绝对根。
  const base = String(site.meta.basePath || '/');
  if (!base.startsWith('/') || !base.endsWith('/')) {
    errors.push(`site.meta.basePath 必须以 / 开头且以 / 结尾，实际为 ${JSON.stringify(base)}`);
  }
  site.meta.basePath = base;
  site.errorPage.homeUrl = site.errorPage.homeUrl || base;

  site.meta.ogImage = freeAsset(raw.meta.ogImage, 'meta.ogImage', 'site.meta.ogImage', errors);
  site.meta.favicon = freeAsset(raw.meta.favicon, 'meta.favicon', 'site.meta.favicon', errors);
  site.brand.logo = freeAsset(raw.brand.logo, 'brand.logo', 'site.brand.logo', errors);
  site.brand.logoHover = freeAsset(raw.brand.logoHover, 'brand.logoHover', 'site.brand.logoHover', errors);
  site.brand.logoSimple = freeAsset(raw.brand.logoSimple, 'brand.logoSimple', 'site.brand.logoSimple', errors);

  // 加载页标识是可选的：留空字符串 = 不要标识，那是合法配置，不该报「找不到
  // 文件」。所以只有非空时才走解析。
  const mark = site.preloader.mark;
  site.preloader.mark = (typeof mark === 'string' && !mark.trim()) || mark == null
    ? { src: null, out: '' }
    : freeAsset(mark, 'preloader.mark', 'site.preloader.mark', errors);

  if (errors.length) throw new ConfigError(errors.join('\n'));
  return site;
}

/** Copy jobs implied by a normalized site config. */
function siteCopies(site) {
  return [site.meta.ogImage, site.meta.favicon,
    site.brand.logo, site.brand.logoHover, site.brand.logoSimple,
    site.preloader && site.preloader.mark]
    .filter((a) => a && a.src);
}

function copyInto(distDir, jobs) {
  const done = [];
  for (const job of jobs) {
    const dest = path.join(distDir, job.out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(job.src, dest);
    done.push(job.out);
  }
  return done;
}

/** Recursive directory copy (Node built-ins only, no deps). */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let files = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) files += copyTree(s, d);
    else { fs.copyFileSync(s, d); files += 1; }
  }
  return files;
}

module.exports = {
  ConfigError, FREE_SLOTS, SITE_DEFAULTS,
  normalizeSite, siteCopies, freeAsset, fixedAsset, resolveSrc,
  copyInto, copyTree,
};
