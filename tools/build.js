'use strict';
/**
 * build.js — 把 config/ 里的配置烤进 src/ 的静态产物，输出到 dist/。
 *
 * 设计原则
 * ---------
 * 1. **零依赖**：只用 Node 内置模块。这个仓库不该为了改几行文案就拖进
 *    一整棵 node_modules。
 * 2. **要么全对，要么报错**：每一次字符串替换都带预期出现次数，对不上就
 *    中止。原来的 config.js 之所以"看起来能用其实没生效"，就是因为替换
 *    失败被静默吞掉了。
 * 3. **错误一次报完**：配置错误全部收集后一起打印，而不是修一个跑一次。
 * 4. **src/ 只读**：所有改动都发生在内存里，最后写进 dist/。
 *
 * 流程
 * ----
 *   读配置 → 校验 → 编译文案 → 内存里打补丁 → 校验类名 → 落盘 dist/
 */
const fs = require('fs');
const path = require('path');

const { ROOT, SRC_DIR, DIST_DIR, CONFIG_DIR, SRC, REL } = require('./paths');
const { buildAnchors } = require('./anchors');
const { compileStory } = require('./blocks');
const { injectStory, patchCaseLinks } = require('./story');
const { normalizeScene, buildSceneAnchors, scenePayloadPatch } = require('./scene');
const { buildTheme } = require('./theme');
const { buildMenuCss } = require('./menu');
const { buildPreloader } = require('./preloader');
const { buildCrystals } = require('./crystals');
const { buildCreatures } = require('./creatures');
const payload = require('./payload');
const {
  loadClasses, unknownClasses, suggest, UPSTREAM_CLASSES,
} = require('./cssclasses');
const {
  normalizeSite, siteCopies, copyInto, copyTree, ConfigError,
} = require('./assets');

class BuildError extends Error {}

/** 构建摘要里加载页那一行的人话说明。 */
const PRE_LABEL = {
  editorial: '象牙纸排印',
  progress: '深蓝渐变进度条',
  legacy: '保持上游原样',
};

/** require 一份配置，顺便清缓存，好让 dev 监听模式能读到新内容。 */
function loadConfig(name) {
  const file = path.join(CONFIG_DIR, `${name}.js`);
  if (!fs.existsSync(file)) throw new BuildError(`缺少配置文件 config/${name}.js`);
  delete require.cache[require.resolve(file)];
  try {
    return require(file);
  } catch (err) {
    throw new BuildError(`config/${name}.js 有语法错误：\n  ${err.message}`);
  }
}

/**
 * 应用补丁表。每条补丁声明了 find 必须出现几次；对不上就抛错，
 * 因为"少替换了一处"意味着注水后中文会被换回英文。
 */
function applyAnchors(sources, anchors) {
  const out = { ...sources };
  const problems = [];
  const applied = [];
  for (const a of anchors) {
    const src = out[a.file];
    if (src === undefined) {
      problems.push(`${a.key}: 未知目标文件 "${a.file}"`);
      continue;
    }
    const hits = src.split(a.find).length - 1;
    if (hits !== a.expect) {
      problems.push(
        `${a.key} (${a.file}): 预期出现 ${a.expect} 次，实际 ${hits} 次\n`
        + `    查找: ${JSON.stringify(a.find.length > 120 ? `${a.find.slice(0, 120)}…` : a.find)}`);
      continue;
    }
    out[a.file] = src.split(a.find).join(a.replace);
    applied.push(a.key);
  }
  if (problems.length) {
    throw new BuildError(
      `补丁表和 src/ 里的产物对不上（${problems.length} 处）：\n  `
      + `${problems.join('\n  ')}\n\n`
      + '  这通常意味着 src/_nuxt 换成了另一份构建产物，或者补丁表被改坏了。\n'
      + '  修 tools/anchors.js，不要绕过这个检查 —— 静默跳过就是原版 config.js 的老毛病。');
  }
  return { out, applied };
}

/** 生成 dist/_nuxt/story.data.js。 */
function renderStoryData(data) {
  const tpl = fs.readFileSync(path.join(__dirname, 'runtime', 'story-runtime.js'), 'utf8');
  const marker = '/*__STORY_DATA__*/ null';
  if (!tpl.includes(marker)) {
    throw new BuildError('tools/runtime/story-runtime.js 里找不到数据占位符');
  }
  return tpl.replace(marker, JSON.stringify(data));
}

/**
 * 生成 dist/404.html —— 一张独立的静态错误页。
 *
 * GitHub Pages 对未知路径返回站点根目录下的 404.html。为什么不直接复制一份
 * index.html（SPA 常见做法）？实测过，两个坑：
 *
 *   1. 产物里所有资源都是相对引用（`./_nuxt/...`）。访问 /repo/cases/xxx 时
 *      它们会被解析成 /repo/cases/_nuxt/...，整页资源全 404。加 <base> 能修，
 *      但 Vue Router 的 createWebHistory() 会去读 <base href> 当路由 base，
 *      连带改变路由行为。
 *   2. 这个克隆站的 /contacts、/cases/:slug 两个 chunk 原站根本没导出，
 *      路由一命中就抛 "Failed to fetch dynamically imported module"，
 *      Nuxt 的 chunk-reload 插件随即做整页跳转 —— 也就是说，把 index.html
 *      放在 404.html 的位置，很容易变成刷新循环。
 *
 * 所以这里给一张不依赖任何 JS 的独立页面：文案取自 config/site.js 的
 * errorPage，视觉沿用站内的深色底 + TTNeoris，一个链接回首页。
 */
function make404(site) {
  const { errorPage, meta, brand } = site;
  const e = require('./anchors').esc;
  return `<!DOCTYPE html>
<html lang="${e(meta.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>404 · ${e(meta.title)}</title>
<link rel="icon" type="image/png" href="${e(meta.basePath)}${e(meta.favicon.out)}">
<meta name="robots" content="noindex">
<style>
@font-face{font-display:swap;font-family:TTNeoris;font-style:normal;font-weight:400;
  src:url("${e(meta.basePath)}_nuxt/TTNeorisTrialRegular.CykOY4gR.ttf")}
:root{color-scheme:dark}
html,body{height:100%;margin:0}
body{background:#062969;color:#f5f5f5;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:2.4rem;padding:4rem 2rem;
  font-family:TTNeoris,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  text-align:center}
/* 注意：这页不加载站内的 Tailwind 产物，所以没有 html{font-size:10px}，
   1rem 就是浏览器默认的 16px，不要照搬站内那套 1 单位 = 1px 的写法。 */
.code{font-size:clamp(5rem,16vw,11rem);line-height:.9;margin:0;color:#88aeff;opacity:.35}
.msg{font-size:clamp(1.15rem,3vw,1.75rem);line-height:1.7;margin:0;max-width:22em}
.home{display:inline-flex;align-items:center;gap:.6em;padding:.7em 1.5em;
  border:1px solid rgba(245,245,245,.4);border-radius:999px;
  color:#f5f5f5;text-decoration:none;font-size:1rem;
  transition:background .3s ease,border-color .3s ease}
.home:hover{background:rgba(245,245,245,.12);border-color:#f5f5f5}
.rights{position:fixed;bottom:2rem;font-size:.875rem;opacity:.61;margin:0}
</style>
</head>
<body>
<p class="code">404</p>
<p class="msg">${e(errorPage.message)}</p>
<a class="home" href="${e(errorPage.homeUrl)}">
  <img src="${e(meta.basePath)}${e(brand.logoSimple.out)}" alt="${e(brand.logoAlt)}" width="20" height="20">
  ${e(errorPage.backAlt)}
</a>
<p class="rights">${e(errorPage.rights)}</p>
</body>
</html>
`;
}

/** 把主题 CSS 插进 </head> 之前。 */
function injectTheme(html, css) {
  if (!css.trim()) return html;
  const tag = `<style id="ns-theme">${css}</style>`;
  const at = html.lastIndexOf('</head>');
  if (at < 0) throw new BuildError('index.html 里找不到 </head>');
  return html.slice(0, at) + tag + html.slice(at);
}

function build({ log = console.log } = {}) {
  const t0 = Date.now();

  // ------------------------------------------------------------ 1. 读输入
  const rawSite = loadConfig('site');
  const rawStory = loadConfig('story');
  const rawScene = loadConfig('scene');

  for (const [k, f] of Object.entries(SRC)) {
    if (!fs.existsSync(f)) throw new BuildError(`缺少源文件 (${k}): ${path.relative(ROOT, f)}`);
  }
  const sources = {
    html: fs.readFileSync(SRC.html, 'utf8'),
    page: fs.readFileSync(SRC.page, 'utf8'),
    engine: fs.readFileSync(SRC.engine, 'utf8'),
  };

  const cssFiles = fs.readdirSync(path.join(SRC_DIR, '_nuxt'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(SRC_DIR, '_nuxt', f));
  const known = loadClasses(cssFiles);

  // ------------------------------------------------------------ 2. 校验
  const errors = [];
  let site = null;
  try {
    site = normalizeSite(rawSite);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    errors.push(...err.message.split('\n'));
  }

  // 主题只读 site.typography，跟资源路径无关，所以即使上面的资源校验失败也
  // 照样跑一遍 —— 「一次把问题报完」这条承诺不能因为先失败的那一项而落空。
  const theme = buildTheme(site || rawSite);
  errors.push(...theme.errors);

  // 菜单背景同理：只读 site.menu，跟资源路径无关，先跑一遍好把问题一次报完。
  const menu = buildMenuCss(site || rawSite);
  errors.push(...menu.errors);

  // 加载页要往引擎里下补丁，所以只有 site 规范化成功时它的 mark 才是可用的；
  // 失败时仍然跑一遍，纯粹为了把 preloader 段自己的配置错误也一次报出来。
  const pre = buildPreloader(site || rawSite);
  errors.push(...pre.errors);

  const { scene, errors: sceneErrors } = normalizeScene(rawScene, sources.engine);
  errors.push(...sceneErrors);

  // 水晶配色 / 材质：整体替换引擎里的 crystal 与 crystalHovers 两段字面量。
  // 只读 scene.crystals，跟滚动段落和素材路径都无关，所以和上面几项一样
  // 无条件跑一遍，好把它自己的配置错误一次报出来。
  const crystals = buildCrystals(rawScene);
  errors.push(...crystals.errors);

  // 七颗水晶换成七只程序化磨砂小动物：整个换掉项目层的 mesh，走引擎的
  // 标准单通道渲染路径，而不是给上游那套磨砂立方体管线换个模型文件。
  // 颜色沿用上面这套水晶配色（baseColor 是引擎里的一根颜色弹簧）。
  const creatures = buildCreatures(rawScene, crystals, sources.engine);
  errors.push(...creatures.errors);

  const compiled = compileStory(rawStory, scene.sections.length || 20, known);
  errors.push(...compiled.errors);

  if (errors.length) {
    throw new BuildError(`配置有 ${errors.length} 处问题：\n  ${errors.join('\n  ')}`);
  }

  // ------------------------------------------------- 3. 内存里给产物打补丁
  let patched = { ...sources };

  // 3a. 故事数组 → 调用生成的数据模块；项目链接支持外部地址
  patched.page = patchCaseLinks(injectStory(patched.page, { dataModule: './story.data.js' }));

  // 3b. 外壳文案 + 滚动节奏
  // 分组留着，末尾的摘要要按来源报数（applyAnchors 有一条不上就抛错，
  // 所以这几个长度加起来必然等于 res.applied.length）。
  const shellAnchors = buildAnchors(site);
  const sceneAnchors = buildSceneAnchors(scene);
  const anchors = [
    ...shellAnchors, ...sceneAnchors, ...pre.anchors, ...crystals.anchors,
    ...creatures.anchors,
  ];
  const res = applyAnchors(patched, anchors);
  patched = res.out;

  // 3c. SSR 快照里的场景状态（桌面那一套）
  patched.html = payload.write(patched.html, scenePayloadPatch(scene));

  // 3d. 注入样式层：强调色 / 装饰线变量 + 移动端菜单背景 + 加载页
  patched.html = injectTheme(patched.html,
    [theme.css, menu.css, pre.css].filter(Boolean).join('\n'));

  // ------------------------------------------------------- 4. 类名兜底校验
  // 逐块的校验在 compileStory 里做过了（能报出是哪一块）；这里再扫一遍最终
  // HTML，兜住补丁表里手写的 class。
  //
  // 注入的 CSS 不参与这次校验（数据 URI 里的 `http://www.w3.org/2000/svg`
  // 会被当成 `.w3` / `.org` 之类的假类名），改由每个模块显式声明自己写进
  // HTML 的类名 —— 声明漏了就会在这里被抓出来，方向是对的。
  const knownPlus = new Set([...known, ...pre.classes]);
  const bad = unknownClasses(patched.html, knownPlus, UPSTREAM_CLASSES);
  if (bad.length) {
    throw new BuildError(
      `生成的 index.html 里有 ${bad.length} 个 CSS 中不存在的类名：\n  `
      + bad.map((c) => {
        const s = suggest(c, known);
        return `${c}${s.length ? `  → 是不是 ${s.join(' / ')}？` : ''}`;
      }).join('\n  '));
  }

  // ----------------------------------------------------------- 5. 写 dist/
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  const copied = copyTree(SRC_DIR, DIST_DIR);

  fs.writeFileSync(path.join(DIST_DIR, REL.html), patched.html);
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), make404(site));
  fs.writeFileSync(path.join(DIST_DIR, REL.page), patched.page);
  fs.writeFileSync(path.join(DIST_DIR, REL.engine), patched.engine);
  fs.writeFileSync(path.join(DIST_DIR, REL.storyData), renderStoryData(compiled.data));

  const assetJobs = [...siteCopies(site), ...scene.copies];
  copyInto(DIST_DIR, assetJobs);

  // 覆盖式拷贝可能引入新文件名（换了 logo 之后旧文件还留着），无害，
  // 但要提醒一下，免得用户以为没生效。
  const swapped = assetJobs.filter((j) => path.resolve(SRC_DIR, j.out) !== j.src);

  // ------------------------------------------------------------- 6. 汇总
  const ms = Date.now() - t0;
  if (log) {
    const s = compiled.stats;
    log(`构建完成  ${ms}ms  →  ${path.relative(ROOT, DIST_DIR)}/`);
    log(`  文案补丁   ${res.applied.length} 处（外壳 ${shellAnchors.length}`
      + ` + 滚动节奏 ${sceneAnchors.length}`
      + `${pre.anchors.length ? ` + 加载页 ${pre.anchors.length}` : ''}`
      + `${crystals.anchors.length ? ` + 水晶 ${crystals.anchors.length}` : ''}`
      + `${creatures.anchors.length ? ` + 小动物 ${creatures.anchors.length}` : ''}）`);
    log(`  故事块     smallLight ${s.smallLight} / smallDark ${s.smallDark} / `
      + `big ${s.big} / lines ${s.lines} / cases ${s.cases}`);
    log(`  滚动段落   ${scene.sections.length} 段，桌面合计 `
      + `${scene.sections.reduce((a, x) => a + x.lg, 0)}，移动端合计 `
      + `${scene.sections.reduce((a, x) => a + x.xs, 0)}`);
    log(`  强调样式   ${theme.mode}`);
    // paper 是墨字压纸底，其余预设都是白字压暗底 —— 报「白字对比度」会把
    // 读摘要的人带沟里，按 mode 分流。
    log(`  菜单背景   ${menu.mode}${menu.contrast
      ? `（${menu.mode === 'paper' ? '墨字' : '白字'}对比度 ${menu.contrast}:1）` : ''}`);
    log(`  加载页     ${pre.style}（${PRE_LABEL[pre.style] || '真实进度'}）`);
    log(`  水晶       ${crystals.palette}（${crystals.label}）`
      + `${crystals.anchors.length ? '' : ' — 与上游一致，未下补丁'}`);
    log(`  小动物     ${creatures.enabled
      ? `${creatures.names.join(' / ')}（${creatures.detail} / ${creatures.tint}）`
      : '关闭 — 保持上游水晶'}`);
    log(`  文件       ${copied} 个（其中 ${swapped.length} 个由 config 替换）`);
    if (swapped.length) {
      for (const j of swapped) log(`               ${path.relative(ROOT, j.src)} → ${j.out}`);
    }
    for (const w of menu.warnings) log(`  ⚠ ${w}`);
    for (const w of pre.warnings || []) log(`  ⚠ ${w}`);
    for (const w of crystals.warnings) log(`  ⚠ ${w}`);
    for (const w of creatures.warnings) log(`  ⚠ ${w}`);
  }

  return { dist: DIST_DIR, stats: compiled.stats, anchors: res.applied.length, ms };
}

module.exports = { build, BuildError, applyAnchors, loadConfig };

if (require.main === module) {
  try {
    build();
  } catch (err) {
    process.stderr.write(`\n构建失败：${err.message}\n\n`);
    process.exit(1);
  }
}
