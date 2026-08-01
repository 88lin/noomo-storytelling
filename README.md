# 沉浸式 3D 叙事页模板

一套**可配置、可复用**的单页 3D 叙事网站模板：WebGL 水晶场景 + 滚动驱动的文字动画。
文案、品牌、排版、滚动节奏、外链、视觉素材全部收敛到 `config/` 下的三个文件，
`npm run build` 一条命令把配置烘焙进静态产物，**零 npm 依赖**（只用 Node 内置模块）。

```
config/site.js    站点外壳：标题、导航、首屏、页脚、社交、主题色、404
config/story.js   叙事内容：17 个文字块 + 7 个项目热区（简写 DSL 撰写）
config/scene.js   3D 场景与滚动节奏：20 段 scrollLength、画质、素材路径
        │
        │  node tools/build.js   （约 0.16 秒）
        ▼
dist/             可直接部署的静态站点（GitHub Pages / 任意静态托管）
```

---

## ⚠️ 先读这一段：素材与字体的授权

**本仓库只存放 `tools/`、`config/`、`docs/` —— 全部是本项目自己写的代码，MIT 授权。
`src/` 不入库**，由 `npm run fetch-src` 从快照仓库
[88lin/noomo-storytelling-clone-zh](https://github.com/88lin/noomo-storytelling-clone-zh)
的固定提交 `1412a9f` 取回到本地（清单写死在 `tools/fetch-src.js`，70 个文件、11.1 MB）。

这么分是有原因的：`src/` 来自对
[storytelling.noomoagency.com](https://storytelling.noomoagency.com)
的静态克隆，其中包含**不属于本项目、也未获授权再分发**的内容：

| 内容 | 情况 |
|---|---|
| `src/_nuxt/TTNeorisTrialRegular.*.ttf` | **TT Neoris 试用版字体**，仅供试用，禁止商用 |
| `src/_nuxt/fonnts.com-theseasons-it.*.otf` | **The Seasons 是商业字体**，文件名显示来自盗版字体站 |
| `src/models/*.glb`、`src/textures/*`、`src/audio/*` | 原站视觉与音频素材，版权归原作者 |
| `src/_nuxt/*.js`、`src/_nuxt/*.css` | 原站编译产物（Nuxt/Vue/Three.js/GSAP 打包结果） |

**因此：这份模板只适合个人学习、技术研究、离线演示。**
任何对外发布、商业使用，请先把上述素材整套换成你有权使用的资源，
并自行确认字体授权。作者对使用者的侵权行为不承担责任。

---

## 快速开始

要求 Node ≥ 18，**不需要 `npm install`**（本项目没有任何依赖）。

```bash
git clone https://github.com/88lin/noomo-storytelling.git
cd noomo-storytelling

npm run fetch-src # 首次必跑：拉取上游站点快照到 src/（约 11 MB，见下节）
npm run build     # 构建到 dist/
npm run serve     # 本地预览 dist/（端口 3000，自动挂在配置的 basePath 下）
npm run dev       # 边改边看：监听 config/ 与 src/，改完自动重建 + 浏览器自动刷新
npm test          # 220 项单元测试（纯 Node，无依赖）
npm run test:e2e  # 可选：真浏览器验收（需 Python + Playwright）
```

`npm run build` 与 `npm test` 都挂了 `pre` 钩子，`src/` 不在时会自动补拉，
所以实际上直接跑 `npm run build` 也行。

改文案 → 存盘 → 浏览器自己刷新，一次重建约 **0.16 秒**。
配置写错不会让 dev 进程挂掉：终端打印中文报错，`dist/` 保留上一次能用的版本，改回来自动恢复。

---

## 三个配置文件

### 1. `config/site.js` —— 站点外壳

```js
module.exports = {
  meta: {
    lang: 'zh-CN',
    title: '故事，是把世界讲给人听的方式',
    description: '……',
    basePath: '/noomo-storytelling/',            // 见下方「部署」
    favicon: 'src/fav.png',
    ogImage: 'src/og_image.jpg',
  },
  nav:   { home: {...}, agency: {...}, labs: {...}, contact: {...} },
  hero:  { title: 'storytelling', headline: { before, emphasis, after }, cta: {...} },
  footer:{ tagline: '...', copyright: '...' },
  social:[ { label: 'Instagram', url: '...' }, ... ],
  contact:{ email: '...', label: '...' },
  typography: {
    emphasis: 'accent',              // accent | gradient | italic | none
    onDark: '#88aeff', onLight: '#3762be',
    gradientOnDark: ['#ffffff', '#88aeff'], gradientOnLight: ['#3762be', '#29345a'],
  },
  errorPage: { message: '别在这儿迷路，回首页看看', rights: '© 版权所有', backAlt: '返回首页' },
};
```

**关于 `emphasis`（强调样式）**：原站用**斜体衬线字**做强调。但打包进来的两款字体
（The Seasons、TT Neoris）**都没有中文字形**，中文走系统回退字体，`<i>` 只能得到
浏览器合成的「伪斜体」，很难看。所以模板默认改用 `accent`（换色强调），
另外提供 `gradient`（渐变字）、`italic`（保留原样式）、`none`（不强调）三种。
颜色按所在段落的明暗自动选 `onDark` / `onLight`。

### 2. `config/story.js` —— 叙事内容

17 个文字块，分四组，外加 7 个项目热区：

| 组 | 数量 | 说明 |
|---|---|---|
| `smallLight` | 3 | 浅色场景里的小字段落 |
| `smallDark` | 4 | 深色场景里的小字段落 |
| `big` | 4 | 巨大衬线字（narrative / Light / Spirit / Sound） |
| `lines` | 6 | 带装饰横线的方法论段落 |
| `cases` | 7 | 3D 场景中的项目热区，点击跳外链 |

每个块长这样：

```js
{
  className: 'bottom-0 xs:pl-20 lg:pl-0 lg:right-1/10 w-410',  // 位置（Tailwind 类）
  size: '26/18',            // 字号 lg/xs
  align: 'left',
  at:   { s: 11, base: 160 },   // 进场滚动位置
  to:   { s: 11, base: 210 },   // 完全显示
  out:  { s: 11, base: 160 },   // 开始退场
  gone: { s: 11, base: 360 },   // 完全消失
  text: `{sz 38/26}从[[清晰]]开始{/sz}
{line dark my=20/10 w=600/300 x=-30%}\\
{g}先想清楚，你到底要说什么。{/g}
{g}无论是发布一款新产品，{/g}`,
}
```

**滚动位置怎么算**：`s: 11` 表示「第 1~11 段滚动长度之和」（含第 11 段），
`base` 是在此基础上的偏移，`half` 表示该偏移在移动端要折半，
`mobile` / `tablet` / `short` 分别只在移动端 / 平板 / 视口高度 < 850px 时叠加。
单位与 `config/scene.js` 的 `scrollLength` 一致。

**一行配置 = 页面上的一行。** 换行就是换行，不用写 `<br>`。

#### 文案简写 DSL

| 写法 | 作用 |
|---|---|
| `[[文字]]` | 强调（按 `typography.emphasis` 渲染） |
| `{em}…{/em}` | 同上，可带参数 `{em sz=38 cls="..." x=10 y=-5 xs-x= lg-x= xs-y= lg-y=}` |
| `{sz 38/26}…{/sz}` | 局部改字号（lg/xs） |
| `{line w=600/300 x=-30% y=8 my=20/10 dark half lg-only xs-only no-scale}` | 装饰横线，宽度/偏移任意取值 |
| `{icon bird\|bird2\|feather\|flower}` | 插入装饰小图标，可加 `rotate` `block` 与 `mb= mt=` |
| `{g}…{/g}` | 渐变文字（修好了原站失效的 `lg:lines-text-gradient`） |
| `{grad}` `{z}` `{lg}` `{xs}` | 渐变容器 / 抬高层级 / 仅桌面 / 仅移动 |
| `{span "任意类名"}…{/span}` | 套一层自定义 class |
| `{br}` `{nbsp}` | 换行 / 不换行空格 |
| `{raw}…{/raw}` | 直接写 HTML（逃生舱） |
| 行尾 `\\` | 续行，不产生新行 |

写错会**直接构建失败并指出是哪一个 token**，不会静默生成坏页面。

### 3. `config/scene.js` —— 场景与节奏

```js
{
  quality: 'high',            // 3D 画质
  sound: false,               // 是否默认开声音
  startColor: 'light',
  sections: [                 // 20 段滚动长度，数字或 { lg, xs }
    { lg: 100, xs: 50 }, { lg: 150, xs: 75 }, 300, ... ,
  ],
  assets: {
    crystals: [ { model: 'src/models/crystal0.glb', texture: 'src/textures/crystals/0.jpg' }, ...×7 ],
    environment: 'src/textures/wooden_studio_19_1k.hdr',
    ice: { color: ..., normal: ..., displacement: ... },
    audio: { hover: [...×5], release: 'src/audio/ReleaseSpirit.mp3' },
  },
}
```

调 `sections` 就是调**叙事节奏**：某段觉得太赶就把数字调大，冗长就调小。
改完记得同步检查 `story.js` 里引用该段的 `at/to/out/gone`。

**换素材**：`assets` 里的路径指向仓库内任意文件，构建时会替换进产物。
水晶模型必须是 **Draco 压缩的 `.glb`**，包围盒尺寸接近原模型；
**数量固定为 7 个**（相机时间线和材质是原站硬编码的，无法配置）。

---

## 三项视觉改版

克隆快照原样保留了上游的加载页、移动端菜单和水晶配色。这三处在本模板里被重做过，
都可以在配置里换预设或关掉。

### 加载页 `config/site.js → preloader`

```js
preloader: {
  style: 'progress',        // progress = 品牌渐变 + 真实百分比；legacy = 原样不动
  background: ['#00276e', '#143a8a', '#062969'],  // 三段渐变，必须是 #RRGGBB
  accent: '#88aeff',        // 百分号与进度条的高光色
  glow: ['#4edbef', '#6248a4'],                   // 上下两团极光光斑
  mark: 'src/images/svg/logoSimple.svg',          // 置空则不显示标记
  showPercent: true,        // 关掉就只剩进度条
  tip: '正在加载沉浸式体验',  // 置空则不显示
  revealDuration: 2,        // 揭幕圆形遮罩的秒数
}
```

百分比是**真实**的：运行时订阅引擎自己的 `loading.progress` / `loading.complete`
事件，按 `loaded/total` 映射。引擎包本身还在下载、事件还没开始发的那一段，由一小段
引导脚本按时间缓动往前推，**上限 50%**，引擎起来之后从那个位置接着走，所以数字既不
会卡在 0，也不会先冲到 90 再倒退。

`mark`、`showPercent`、`tip` 三个全关会报错 —— 那样加载页就是一片空白。

> 顺带修掉了一个克隆自带的问题：克隆作者手写了一段轮询脚本硬把 `.preloader` 从 DOM 里
> `remove()` 掉，导致上游那个圆形揭幕动画**从来没播放过**，而且 Vue 之后会往一个已经
> 为 null 的父节点里插东西。现在换成了双向握手：运行时自己判定就绪 → 调组件自己的揭幕
> 函数 → 由 Vue 正常卸载；兜底脚本只做隐藏，绝不摘节点。

### 移动端菜单背景 `config/site.js → menu`

```js
menu: {
  background: 'aurora',     // aurora | gradient | frost | none
  colors: ['#00276e', '#143a8a', '#062969'],
  glow: ['#4edbef', '#88aeff', '#6248a4'],
  noise: true,              // 细噪点，压掉大面积渐变的色带
  motion: true,             // 极光缓慢漂移；false 则完全静止
}
```

- `aurora` —— 深蓝品牌渐变 + 三团极光光斑 + 噪点，34 秒一个来回（默认）
- `gradient` —— 同一套色，但不漂移、不发光，最省电
- `frost` —— 毛玻璃，`backdrop-filter: blur()` 透出底下的 3D 场景
- `none` —— 一行 CSS 都不输出，回到上游状态

上游那条规则整条是废的：`.mobile-menu{//background-image:url(./images/menu_back.jpg);…}`
—— Sass 风格的 `//` 注释在 CSS 里非法，整条规则被解析器丢掉，而且 `images/menu_back.jpg`
这个文件在克隆里根本不存在。实测打开菜单时 `background-image` 是 `none`、
`background-color` 是全透明，所谓「黑不溜秋」其实是**完全没有背景**，看到的是底下的
3D 场景。构建时会在 `#ns-theme` 里用 `.mobile-menu.mobile-menu` 提高优先级覆盖掉它。

对比度是构建期算的，四套预设都会打印到构建摘要里；低于 4.5:1（AA）会告警。

### 水晶配色 `config/scene.js → crystals`

```js
crystals: {
  palette: 'aurora',   // aurora | ice | jewel | legacy | custom
  base: {},            // 覆盖静止态（7 颗共用）
  items: [],           // 覆盖悬停态，要给就得给满 7 条
}
```

| 预设 | 观感 |
| --- | --- |
| `aurora` | 极光虹彩：7 色沿色轮重新铺开，通透、带虹彩（默认） |
| `ice` | 冰蓝：全部收进蓝青一带，低饱和，冷 |
| `jewel` | 宝石：同 aurora 的色相，但压暗提饱和，像有色宝石 |
| `legacy` | 上游原样，一个字节都不改 |
| `custom` | 完全自己写，必须给满 7 条 |

**这里有个很容易踩的坑**：引擎里 `crystal` 和 `crystalHovers` 是两张不同的表。

- `crystal` = **静止态**，7 颗共用一份。上游把它设成了纯白、`envRefraction: 0`，
  所以不 hover 的时候 7 颗长得一模一样 —— 这是 95% 时间看到的样子。
- `crystalHovers` = **悬停态**，逐颗不同，**只在鼠标悬停时**通过弹簧插值过去。
  移动端没有 hover，永远看不到。

也就是说「7 个颜色」在上游是隐藏款。本模板的做法是：静止态也给一点点冷蓝底色和折射
（`envRefraction: 0.22`），让水晶平时就是透的；悬停态才是 7 种颜色各自的高潮。

几何模型没换 —— 每颗 `crystalN.glb` 里除了立方体本体，还嵌着一个刻着客户 logo 的
`Icon` 网格和一份预计算的 `ConvexHull`，顶点属性（`_peaks` / `_convexity` /
`_thickness` / `_concavity`）是烘焙进去的。换模型要重跑上游的烘焙流程，不在本模板范围内。
同理，`distancesFactor`、`convexityFactor`、`concavityFactor`、`peaksFactor`、
`uvShiftFactor`、`resetDistances`、`colorFactor`、`decayFactor` 这 8 个参数直接乘在烘焙
数据上，预设一律不碰。

> ⚠️ **水晶的观感必须真机验收。** 无 GPU 环境（CI、容器、远程沙箱）下 WebGL 走
> SwiftShader，帧率个位数，引擎写进 store 的 `getIceCubePositionByIndex` 恒为 0，
> 滚动根本进不到水晶那一段 —— 自动化测试只能验参数正确，验不了好不好看。
> 改完配色请在真机上滚到「品牌滑动体验」那一屏，把鼠标依次悬停到 7 颗上面看。

### 改完怎么看

```bash
npm run dev      # 监听 config/ 与 tools/，改一下存一下就重建 + 刷新
```

`npm run dev` 是增量构建，改配色不需要重新解一遍引擎包。

## 部署

### GitHub Pages（已配好工作流）

1. 把 `config/site.js` 的 `meta.basePath` 改成 `'/你的仓库名/'`（**必须以 `/` 开头和结尾**）；
   如果是 `用户名.github.io` 这类根域名仓库，填 `'/'`。
2. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
3. 推到 `main`。`.github/workflows/pages.yml` 会：跑测试 → 构建 → 校验产物 → 发布。

工作流**不跑 `npm ci`**，因为没有依赖可装。

### 其它静态托管

把 `dist/` 整个目录上传即可。注意两点：
- 站内资源引用全是相对路径（`./_nuxt/...`），子目录部署天然可用；
- 但 `404.html` 里的返回链接和字体路径用的是 `basePath`，配错会 404。
  本地可以用 `BASE=/some-path/ npm run serve` 提前验证。

---

## 工作原理

原站是 Nuxt + Vue + Three.js + GSAP 的**编译产物**，源码不可得。
本模板没有去反编译或重写它，而是把它当成一个**黑盒**，只在几个精确的位置做替换：

```
src/index.html            外壳 HTML（标题、meta、预渲染的导航与页脚）
src/_nuxt/FZFS71Nt.js     页面组件 chunk（首屏、页脚等文案）
src/_nuxt/CbdjwYMp.js     引擎 chunk（Vue 运行时 + Three.js + GSAP + 全部文案）
src/_nuxt/story.data.js   ← 构建时新生成：5 个故事数组
```

构建管线做四件事：

1. **锚点替换**（`tools/anchors.js`）：75 处文案/链接/属性，每一处都是一段
   **在整个文件中唯一**的字符串。匹配不到、或匹配到多处，构建立即失败——
   宁可炸掉，也不要半替换出一个坏站。
2. **故事数据注入**：`config/story.js` 经 DSL 编译成 HTML，写进 `story.data.js`，
   引擎里原来的 5 个内联数组改成从这个模块读。
3. **滚动节奏改写**：引擎里 20 段 `scrollLength` 的生成器函数被整体换掉。
   默认配置下的输出与原文件**逐字节一致**（有测试保证）。
4. **主题与资源**：注入 `<style id="ns-theme">`（强调色、`{line}` 的宽度/偏移变量），
   拷贝 `src/` 全量文件，按 `scene.js` 替换素材，生成 `404.html`。

### 为什么 CSS 类名不能乱写

`src/_nuxt/*.css` 是**已经编译好的 Tailwind 产物**，里面只有原站用过的 **585 个类名**。
写一个不存在的类（比如 `lg:text-serif-26`）不会报错，只会**静默失效**。
所以构建会校验所有 `className` 与 DSL 产出的类名，未知类名直接失败并给出相近建议。

需要任意宽度/位移时用 DSL 的 `{line w= x= y=}` —— 它走 CSS 自定义属性
（`--ns-w-lg` / `--ns-t-x-xs` 等）而不是 Tailwind 类，因此取值不受编译产物限制。

### 已知的上游问题（不是本模板引入的）

- `/cases/:slug` 和 `/contacts` 两个路由的 chunk（`B1pKjyE0.js`、`N9wcHCtb.js`）
  **在克隆时就没被抓下来**，站内路由全是死链。所以 7 个项目热区和联系入口
  在本模板里改成了**可配置的外部链接**（`window.open(..., '_blank')`），不再走前端路由。
- 上游 HTML 里有 `lg:hiddn`、`lg!w-400` 这类拼错的类名，重写时已顺手去掉。
- 原站的 `lg:lines-text-gradient` 在 CSS 里不存在，渐变文字其实一直没生效；
  DSL 的 `{g}` 输出无前缀的 `lines-text-gradient`，现在能正常渲染。

### 404 页面为什么是独立的一页

试过三种方案，只有第三种成立：

1. 直接把 `index.html` 复制成 `404.html` —— **不行**。资源引用全是相对路径，
   访问 `/repo/cases/xxx` 时会去找 `/repo/cases/_nuxt/...`，全部 404。
2. 加 `<base href="/repo/">` —— 资源能加载了，但 Vue Router 会把 `<base>` 当成路由基址，
   而缺失的路由 chunk 会触发 Nuxt 的「chunk 加载失败 → 强制整页刷新」逻辑，**有死循环风险**。
3. **采用**：`tools/build.js` 生成一个**零 JS 的独立 404 页**——深蓝底、`404` 水印、
   内联 `@font-face`、中文提示 + 返回首页胶囊按钮 + 版权行，`<meta name="robots" content="noindex">`。
   文案在 `site.errorPage` 里配。

> 注意：这一页**不加载站点的 Tailwind 产物**，所以 `html{font-size:10px}` 不生效，
> 这里 `1rem = 16px`，不要照搬站内「1 单位 = 1px」的写法。

---

## 目录结构

```
config/          三个配置文件（你主要改这里）
src/             原站静态产物（黑盒，不入库，由 npm run fetch-src 取回）
tools/
  build.js       构建入口
  dev.js         监听 + 热重载
  serve.js       静态预览服务器（零依赖）
  anchors.js     75 处锚点替换表
  markup.js      文案简写 DSL 编译器
  blocks.js      故事块 → HTML
  positions.js   滚动位置表达式求值
  theme.js       强调色与 {line} 的 CSS 变量规则
  scene.js       场景配置 → 引擎 payload
  assets.js      配置校验与素材替换
  cssclasses.js  编译产物里的类名白名单校验
  scanner.js     锚点唯一性扫描
  paths.js       路径与产物文件名
  runtime/story-runtime.js  注入引擎的故事数据读取器
  fetch-src.js   从快照仓库固定提交取回 src/（70 个文件）
  test/          220 项单元测试 + e2e.py（Playwright 验收）
.github/workflows/pages.yml   CI：测试 → 构建 → 发布 Pages
dist/            构建产物（已在 .gitignore 中）
```

## 测试

```bash
npm test          # 220 项：DSL 编译、位置求值、锚点唯一性、故事块、加载页、菜单、水晶、构建产物
npm run test:e2e  # 84 项：真浏览器里验证注水后中文没被换回英文、外链行为、子路径无 404、404 页、加载页、菜单对比度
```

e2e 需要 `pip install playwright && playwright install chromium`，**故意不作为构建依赖**。
它检查的是「Vue 注水之后中文还在不在」——这正是原始克隆站翻译失败的地方：
预渲染 HTML 是中文，注水瞬间被 JS 里的英文覆盖回去。本模板同时改了两边，所以不会回退。

**无法自动验证的部分**：headless 环境用 SwiftShader 软件渲染，3D 场景的实际观感、
水晶折射、滚动手感、音效都需要你在真机上亲眼确认。

## 常见操作

| 想做什么 | 改哪里 |
|---|---|
| 换标题 / 描述 / favicon | `config/site.js` → `meta` |
| 换首屏大字 | `config/site.js` → `hero.title`（默认保留英文 `storytelling`） |
| 改某段文案 | `config/story.js` 对应块的 `text` |
| 某段出现得太早/太晚 | 该块的 `at/to/out/gone` |
| 整体节奏太慢 | `config/scene.js` → `sections` 调小 |
| 换强调样式 | `config/site.js` → `typography.emphasis` |
| 换项目链接 | `config/story.js` → `cases[].url`（留空则不可点） |
| 换 3D 素材 | `config/scene.js` → `assets` |
| 部署到子路径 | `config/site.js` → `meta.basePath` |

## 许可

构建工具与配置层：MIT（见 `LICENSE`）。
`src/` 下的第三方代码、字体、模型、贴图、音频**不在此授权范围内**，见文首说明。
