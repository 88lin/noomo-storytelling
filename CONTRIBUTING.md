# 贡献指南

欢迎提交 Issue 和 Pull Request。这个仓库是一套**可配置的 3D 叙事页模板**，
只存放本项目自己写的代码（`tools/`、`config/`、`docs/`），
上游站点快照 `src/` 不入库。

## 开发环境

### 前置要求

- Node.js >= 18（只用内置模块，**没有任何 npm 依赖**）
- 现代浏览器（支持 WebGL 2.0）
- 可选：Python 3 + Playwright（跑端到端验收时才需要）

### 本地启动

```bash
git clone https://github.com/88lin/noomo-storytelling.git
cd noomo-storytelling

npm run fetch-src   # 首次必跑：从快照仓库固定提交取回 src/（70 个文件，约 11 MB）
npm run build       # 构建到 dist/
npm run serve       # 本地预览 dist/，默认端口 3000
npm run dev         # 边改边看：监听 config/ 与 tools/，自动重建 + 浏览器刷新
npm test            # 279 项单元测试
npm run test:e2e    # 可选：真浏览器验收
```

**不需要 `npm install`。** `build`、`dev`、`test` 都挂了 `pre` 钩子，
`src/` 不在时会自动调用 `tools/fetch-src.js` 补拉，所以直接跑 `npm run build` 也行。

## 该改哪里

| 想做的事 | 改哪里 | 要注意什么 |
|---|---|---|
| 改文案、品牌、配色、滚动节奏 | `config/` 下三个文件 | 一般不需要动 `tools/` |
| 加新的 DSL 记法 | `tools/markup.js` | 必须同时补 `tools/test/markup.test.js` |
| 加新的锚点替换 | `tools/anchors.js` | 见下方「锚点的唯一性」 |
| 改构建流程 | `tools/build.js` | 跑一遍 `npm test`，确认 279 项全过 |
| 改加载页 / 菜单 / 水晶 | `tools/preloader.js`、`tools/menu.js`、`tools/crystals.js` | 三者都有对应测试文件 |

**请不要提交 `src/` 下的任何文件。** 它已在 `.gitignore` 里，
内容来自对原站的静态克隆，版权不属于本项目。
需要换素材请改 `config/scene.js` 的 `assets`，指向你自己有权使用的文件。

### 锚点的唯一性

`tools/anchors.js` 里每一条替换规则的 `find` 字符串，
必须在目标文件中**恰好出现 `expect` 次**。匹配不到、或匹配次数对不上，
构建会立即失败并报出是哪一条 —— 这是故意的，宁可炸掉也不要半替换出一个坏站。

新增锚点时请：

1. 用 `node tools/scanner.js` 确认候选字符串的出现次数；
2. 在规则里写明 `expect`；
3. 在 `tools/test/anchors.test.js` 里补一条断言。

## 提交流程

1. Fork 本仓库
2. 建分支：`git checkout -b feat/你的功能名`
3. 改代码，**跑一遍 `npm test`**，确认 279 项全过
4. 提交：`git commit -m "描述你的修改"`
5. 推送：`git push origin feat/你的功能名`
6. 开 Pull Request，说明改了什么、为什么、怎么验证的

改动涉及视觉效果（加载页、菜单、水晶配色）时，
请附上**真机截图** —— 无 GPU 环境下 WebGL 走软件渲染，
自动化测试只能验参数正确，验不了好不好看。

## 代码规范

- 一律 CommonJS（`require` / `module.exports`），不要引入任何 npm 依赖
- 缩进 2 个空格，文件 UTF-8 无 BOM，行尾 LF
- 注释写中文，说明**为什么**这么做，而不是复述代码在做什么
- 配置校验失败要给出可操作的中文报错（写清哪个字段、期望什么、实际收到什么）
- 新增工具模块请配套加 `tools/test/*.test.js`，并在 `tools/test/run.js` 里注册

## 报告问题

在 [Issues](https://github.com/88lin/noomo-storytelling/issues) 里搜一下是否已有相同问题。
新建 Issue 时请包含：

- 问题描述与复现步骤
- `node -v` 输出、操作系统、浏览器版本
- 构建报错的完整终端输出（如果是构建问题）
- 截图（如果是视觉问题）

## 许可证

本仓库的代码使用 [MIT 许可证](./LICENSE)，提交的代码同样遵循该许可证。
`npm run fetch-src` 取回的 `src/` 内容**不在此授权范围内**，详见 `README.md` 开头的说明。
