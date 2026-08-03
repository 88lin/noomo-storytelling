# Noomo Storytelling 中文克隆版

> 🎬 一个沉浸式 3D 网站，探索数字叙事的原理。基于 [Noomo Agency](https://noomoagency.com) 的 Storytelling 页面克隆，已完全汉化并开源。

---

## 📖 项目简介

本项目是 [storytelling.noomoagency.com](https://storytelling.noomoagency.com/) 的静态克隆，使用以下技术栈：

| 技术 | 说明 |
|------|------|
| **Nuxt.js / Vue** | 前端框架（已预渲染为静态文件） |
| **Three.js / WebGL** | 3D 场景渲染 |
| **GSAP** | 动画引擎 |
| **Lenis** | 平滑滚动 |
| **Tailwind CSS** | 样式系统 |

### ✨ 特性

- ✅ **完全汉化** — 所有界面文本已翻译为中文
- ✅ **开源友好** — MIT 许可证，代码注释完善
- ✅ **易于配置** — 通过 `config.js` 一键修改网站内容
- ✅ **隐私保护** — Google Analytics 默认关闭
- ✅ **零依赖启动** — 仅需 Node.js 即可本地预览
- ✅ **响应式设计** — 支持桌面端和移动端

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 12.0.0

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/88lin/noomo-storytelling-clone-zh.git
cd noomo-storytelling-clone-zh

# 启动本地预览服务器
npm start
# 或
node serve.js
```

浏览器打开 **http://localhost:3000** 即可预览。

如需指定端口：

```bash
PORT=8080 npm start
```

---

## ⚙️ 配置说明

所有可配置内容集中在 **`config.js`** 文件中。修改后刷新浏览器即可生效。

### 配置项一览

| 配置组 | 说明 | 示例 |
|--------|------|------|
| `site` | 网站标题、描述、SEO | `title`, `description`, `url` |
| `brand` | 品牌名称、Logo | `name`, `logo` |
| `contact` | 联系邮箱 | `email` |
| `social` | 社交媒体链接 | `x`, `instagram`, `linkedin` |
| `links` | 外部链接 | `agency`, `labs` |
| `nav` | 导航菜单文字 | `home`, `agency`, `labs`, `contact` |
| `hero` | 首屏文案 | `titleLine1`, `scrollHint` |
| `footer` | 页脚文案 | `tagline` |
| `analytics` | Google Analytics | `enabled`, `googleAnalyticsId` |
| `features` | 功能开关 | `backgroundMusic`, `sceneQuality` |
| `theme` | 主题颜色（实验性） | `brandRose`, `background` |

### 常见配置示例

**修改网站标题：**
```javascript
// config.js
window.SITE_CONFIG.site.title = "我的数字叙事网站";
```

**关闭背景音乐：**
```javascript
window.SITE_CONFIG.features.backgroundMusic = false;
```

**启用 Google Analytics：**
```javascript
window.SITE_CONFIG.analytics.enabled = true;
window.SITE_CONFIG.analytics.googleAnalyticsId = "G-你的ID";
```

**修改联系邮箱：**
```javascript
window.SITE_CONFIG.contact.email = "contact@mycompany.com";
```

---

## 📁 项目结构

```
noomo-storytelling-clone-zh/
├── index.html              # 主页面（入口文件）
├── config.js               # ⭐ 全局配置文件（修改内容的首选）
├── serve.js                # 本地预览服务器（零依赖）
├── package.json            # 项目元数据
├── LICENSE                 # MIT 许可证
├── README.md               # 项目说明（本文件）
├── CONTRIBUTING.md         # 贡献指南
├── og_image.jpg            # 社交分享预览图
├── fav.png                 # 网站图标
├── images/                 # 图片资源
│   ├── svg/                # SVG 矢量图（Logo 等）
│   └── ...
├── audio/                  # 音频文件（背景音乐、音效）
├── fonts/                  # 字体文件
└── _nuxt/                  # Nuxt 预渲染的 JS/CSS 资源
    ├── entry.*.js          # 入口脚本
    ├── *.css               # 样式文件
    └── ...                 # 3D 模型、纹理等资源
```

---

## 🌐 部署

### 方式一：静态托管（推荐）

将整个目录上传到任意静态托管服务：

- **GitHub Pages** — 推送到 `gh-pages` 分支
- **Vercel** — `vercel deploy`
- **Netlify** — 拖拽部署
- **Nginx / Apache** — 复制到 web 根目录

### 方式二：Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "serve.js"]
```

---

## 🙏 致谢

- 原网站：[Noomo Agency](https://noomoagency.com) — [storytelling.noomoagency.com](https://storytelling.noomoagency.com/)
- 技术栈：Nuxt.js, Three.js, GSAP, Lenis, Tailwind CSS

---

## 📄 许可证

[MIT License](./LICENSE) — 可自由使用、修改和分发。
