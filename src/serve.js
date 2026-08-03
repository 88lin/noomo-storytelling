/**
 * ============================================================================
 *  Noomo Storytelling 克隆站 — 本地预览服务器
 * ============================================================================
 *
 *  📌 用于在本地启动 HTTP 服务器预览网站效果。
 *
 *  🚀 使用方法：
 *     node serve.js              # 默认端口 3000
 *     PORT=8080 node serve.js    # 自定义端口
 *
 *  📦 无需安装任何依赖，仅使用 Node.js 内置模块。
 * ============================================================================
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// --- 配置 ---
const PORT = process.env.PORT || 3000;          // 服务端口，可通过环境变量覆盖
const ROOT_DIR = __dirname;                      // 网站根目录（即本文件所在目录）

/**
 * MIME 类型映射表
 * 根据文件扩展名返回对应的 Content-Type 响应头
 */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf":  "font/ttf",
  ".otf":  "font/otf",
  ".eot":  "application/vnd.ms-fontobject",
  ".mp3":  "audio/mpeg",
  ".wav":  "audio/wav",
  ".ogg":  "audio/ogg",
  ".glb":  "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".hdr":  "application/octet-stream",
  ".wasm": "application/wasm",
  ".map":  "application/json; charset=utf-8",
};

/**
 * 处理 HTTP 请求
 * @param {http.IncomingMessage} req - 请求对象
 * @param {http.ServerResponse} res - 响应对象
 */
function handleRequest(req, res) {
  // 解析 URL，移除查询参数
  let urlPath = req.url.split("?")[0];

  // 默认入口文件
  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  // 安全检查：防止目录遍历攻击
  const filePath = path.join(ROOT_DIR, urlPath);
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 禁止访问");
    return;
  }

  // 检查文件是否存在
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 文件不存在，返回 404
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`404 未找到: ${urlPath}`);
      console.log(`  ❌ 404 ${urlPath}`);
      return;
    }

    // 获取文件扩展名对应的 MIME 类型
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    // 读取并返回文件内容
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("500 服务器内部错误");
        return;
      }

      res.writeHead(200, { "Content-Type": mimeType });
      res.end(data);
      console.log(`  ✅ 200 ${urlPath} (${(stats.size / 1024).toFixed(1)}KB)`);
    });
  });
}

// --- 创建并启动服务器 ---
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log("");
  console.log("  ╔══════════════════════════════════════════════════╗");
  console.log("  ║   Noomo Storytelling 克隆站 — 本地预览服务器      ║");
  console.log("  ╠══════════════════════════════════════════════════╣");
  console.log(`  ║   地址: http://localhost:${String(PORT).padEnd(24)}║`);
  console.log("  ║   按 Ctrl+C 停止                                  ║");
  console.log("  ╚══════════════════════════════════════════════════╝");
  console.log("");
});
