'use strict';
/**
 * dev.js — 边改边看：监听 config/ 与 src/，改动后自动重建并让浏览器刷新。
 *
 *   node tools/dev.js              # http://127.0.0.1:3000/
 *   PORT=8080 node tools/dev.js
 *   BASE=/my-repo/ node tools/dev.js
 *
 * 三件事：
 *   1. 起一个静态服务器，服务 dist/（复用 tools/serve.js）。
 *   2. fs.watch 监听 config/ 和 src/，去抖 80ms 后在同一个进程里重建。
 *      重建走 require('./build').build()，不 fork 子进程 —— 一次全量构建
 *      不到 0.2 秒，进程内跑省掉了 Node 启动的开销。
 *   3. 往每个 HTML 响应里注入一段几行的轮询脚本，构建号一变就 location.reload()。
 *      用轮询而不是 WebSocket/SSE，是为了保持零依赖且不需要处理连接生命周期。
 *
 * 配置文件写错不会让进程退出：打印错误、保留上一次能用的 dist/，等你改回来。
 */
const fs = require('fs');
const path = require('path');

const { ROOT, SRC_DIR, DIST_DIR, CONFIG_DIR, defaultBase } = require('./paths');
const { createServer } = require('./serve');

const PORT = Number(process.env.PORT) || 3000;
const BASE = (process.env.BASE || defaultBase()).replace(/\/*$/, '/');
const DEBOUNCE = 80;

// 每次成功重建都换一个新的构建号，页面轮询到变化就刷新。
let buildId = String(Date.now());
let lastError = null;

const LIVE_RELOAD = `<script>(function(){
  var id=null;
  setInterval(function(){
    fetch('${BASE}__dev',{cache:'no-store'}).then(function(r){return r.text()}).then(function(t){
      if(id===null){id=t;return}
      if(t!==id){location.reload()}
    }).catch(function(){});
  },400);
})();</script>`;

function stamp() {
  return new Date().toTimeString().slice(0, 8);
}

/** 跑一次构建，捕获配置错误，不让 watcher 挂掉。 */
function rebuild(reason) {
  const t0 = Date.now();
  const lines = [];
  try {
    // build() 内部会清 require 缓存重新读 config/*.js，所以进程内重建拿得到新内容。
    require('./build').build({ log: (l) => lines.push(l) });
    buildId = String(Date.now());
    lastError = null;
    process.stdout.write(`${stamp()}  重建完成 ${Date.now() - t0}ms  ${reason}\n`);
    // 只回显有信息量的那几行，避免刷屏
    for (const l of lines.slice(1)) process.stdout.write(`          ${l.trim()}\n`);
  } catch (err) {
    lastError = err.message;
    process.stderr.write(`\n${stamp()}  构建失败  ${reason}\n${err.message}\n\n`
      + '          （dist/ 保持上一次成功的内容，改好后会自动重试）\n');
  }
}

// --------------------------------------------------------------------- 监听
let timer = null;
let pending = new Set();

function schedule(dir, name) {
  if (name) pending.add(path.join(dir, name));
  clearTimeout(timer);
  timer = setTimeout(() => {
    const files = [...pending].map((f) => path.relative(ROOT, f));
    pending = new Set();
    rebuild(files.length <= 3 ? files.join(', ') : `${files.length} 个文件`);
  }, DEBOUNCE);
}

function watch(dir) {
  if (!fs.existsSync(dir)) return;
  // recursive 在 Linux 上要 Node >= 20；低版本退回逐层监听。
  try {
    fs.watch(dir, { recursive: true }, (_e, name) => schedule(dir, name));
  } catch {
    const walk = (d) => {
      fs.watch(d, (_e, name) => schedule(d, name));
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(d, entry.name));
      }
    };
    walk(dir);
  }
}

// --------------------------------------------------------------------- 启动
rebuild('首次构建');

watch(CONFIG_DIR);
watch(SRC_DIR);
// 改构建脚本本身也要生效，但 require 缓存会拦住 —— 明确提示重启。
fs.watch(__dirname, (_e, name) => {
  if (name && name.endsWith('.js') && name !== 'dev.js') {
    process.stdout.write(`${stamp()}  tools/${name} 改了，构建脚本本身的改动需要重启 dev\n`);
  }
});

createServer({
  dir: DIST_DIR,
  base: BASE,
  inject: LIVE_RELOAD,
  onMiss: (u) => process.stdout.write(`${stamp()}  404  ${u}\n`),
  routes: (url, req, res) => {
    if (url !== '/__dev') return false;
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end(lastError ? `error:${buildId}` : buildId);
    return true;
  },
}).listen(PORT, () => {
  process.stdout.write(`\n开发服务器  http://127.0.0.1:${PORT}${BASE}\n`
    + `监听        ${path.relative(ROOT, CONFIG_DIR)}/  ${path.relative(ROOT, SRC_DIR)}/\n`
    + '改完存盘即自动重建 + 刷新页面，Ctrl-C 退出\n\n');
});
