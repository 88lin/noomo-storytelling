# 贡献指南

感谢你对 Noomo Storytelling 中文克隆项目的关注！欢迎提交 Issue 和 Pull Request。

## 🛠️ 开发环境

### 前置要求

- [Node.js](https://nodejs.org/) >= 12.0.0（用于本地预览服务器）
- 现代浏览器（支持 WebGL 2.0）

### 本地启动

```bash
# 克隆仓库
git clone https://github.com/88lin/noomo-storytelling-clone-zh.git
cd noomo-storytelling-clone-zh

# 启动本地预览服务器（默认端口 3000）
npm start

# 或指定端口
PORT=8080 npm start
```

然后在浏览器中打开 `http://localhost:3000`。

## 📝 如何贡献

### 报告问题

1. 在 [Issues](https://github.com/88lin/noomo-storytelling-clone-zh/issues) 页面搜索是否已有相同问题
2. 如果没有，创建新 Issue，请包含：
   - 问题描述
   - 复现步骤
   - 浏览器版本和操作系统
   - 截图（如有）

### 提交代码

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/你的功能名`
3. 修改代码
4. 提交：`git commit -m "描述你的修改"`
5. 推送：`git push origin feature/你的功能名`
6. 创建 Pull Request

### 修改内容

#### 修改文案/配置

大多数网站内容可通过编辑 `config.js` 文件修改，无需深入 HTML：

```javascript
// config.js
window.SITE_CONFIG = {
  site: {
    title: "你的网站标题",
    description: "你的网站描述",
  },
  // ... 更多配置项
};
```

#### 修改 3D 场景

3D 场景使用 Three.js 构建，相关代码在 `_nuxt/` 目录中。修改这些文件需要 Three.js 和 WebGL 知识。

#### 添加中文翻译

如发现残留英文文本，请：
1. 在 `index.html` 中找到对应文本
2. 替换为中文
3. 同时在 `config.js` 中添加对应配置项（如适用）
4. 提交 PR

## 📐 代码规范

- HTML/CSS/JS 文件使用 UTF-8 编码
- 缩进使用 2 个空格
- 注释使用中文
- 新增功能请在 `config.js` 中添加对应配置项

## 📄 许可证

本项目使用 [MIT 许可证](./LICENSE)。提交的代码也将遵循同一许可证。
