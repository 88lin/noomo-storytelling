'use strict';
/**
 * serve.js — 本地静态预览服务器（零依赖，只用 Node 内置模块）。
 *
 *   node tools/serve.js                 # http://127.0.0.1:3000/ ，服务 dist/
 *   PORT=8080 node tools/serve.js       # 换端口
 *   BASE=/my-repo/ node tools/serve.js  # 挂在子路径下预览
 *   node tools/serve.js src             # 服务未处理的原始产物，用于对照
 *
 * BASE 用来验证「部署到 GitHub Pages 子路径」这种情况：站内所有资源引用都是
 * 相对路径（./_nuxt/...），所以子路径部署本来就该正常工作 —— 这个开关让你在
 * 本地就能确认，而不是推上去才发现 404。
 *
 * tools/dev.js 复用这里的 createServer()，多传一个 inject 参数注入热重载脚本。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ROOT, DIST_DIR, defaultBase } = require('./paths');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.hdr': 'image/vnd.radiance',
  '.wasm': 'application/wasm',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * @param {object} opts
 * @param {string} opts.dir      要服务的目录
 * @param {string} [opts.base]   挂载前缀，形如 '/repo/'
 * @param {function} [opts.routes]  额外路由：(url, req, res) => true 表示已处理
 * @param {string} [opts.inject]    注入到 HTML </body> 前的脚本片段
 * @param {function} [opts.onMiss]  404 回调，用来打日志
 */
function createServer(opts) {
  const dir = opts.dir;
  const base = (opts.base || '/').replace(/\/*$/, '/');
  const inject = opts.inject || '';

  return http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (base !== '/' && url.startsWith(base)) url = `/${url.slice(base.length)}`;
    else if (base !== '/' && `${url}/` === base) url = '/';

    if (opts.routes && opts.routes(url, req, res)) return;

    // 路径必须落在 dir 之内。path.normalize 已经能吃掉多余的 ..，但这里再
    // 显式确认一次绝对路径的归属 —— 这个服务器有可能被临时暴露到公网预览。
    let file = path.resolve(dir, `.${path.posix.normalize(url)}`);
    if (file !== dir && !file.startsWith(dir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

    // 单页应用：找不到的路径回落到 404.html（和 GitHub Pages 的行为一致），
    // 没有 404.html 时退回 index.html。
    let status = 200;
    if (!fs.existsSync(file)) {
      const ext = path.extname(file);
      if (ext && ext !== '.html') {
        if (opts.onMiss) opts.onMiss(url);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 ${url}`);
        return;
      }
      if (opts.onMiss) opts.onMiss(url);
      status = 404;
      const notFound = path.join(dir, '404.html');
      file = fs.existsSync(notFound) ? notFound : path.join(dir, 'index.html');
    }

    let body = fs.readFileSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (inject && type.startsWith('text/html')) {
      body = Buffer.from(String(body).replace(/<\/body>/i, `${inject}</body>`));
    }
    res.writeHead(status, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });
}

module.exports = { createServer, MIME };

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  const BASE = (process.env.BASE || defaultBase()).replace(/\/*$/, '/');
  const target = process.argv[2];
  const dir = target ? path.resolve(ROOT, target) : DIST_DIR;

  if (!fs.existsSync(dir)) {
    process.stderr.write(`找不到目录 ${path.relative(ROOT, dir)}/，先跑一次 npm run build\n`);
    process.exit(1);
  }

  createServer({ dir, base: BASE, onMiss: (u) => process.stdout.write(`  404  ${u}\n`) })
    .listen(PORT, () => {
      process.stdout.write(`预览  http://127.0.0.1:${PORT}${BASE}`
        + `   （目录 ${path.relative(ROOT, dir) || '.'}/）\n`);
    });
}
