# ✨ 沉浸式 3D 叙事页模板

一套**可配置、可复用**的单页 3D 叙事网站模板：WebGL 水晶场景 + 滚动驱动的文字动画。
文案、品牌、排版、滚动节奏、外链、视觉素材全部收敛到 `config/` 下的三个文件，
`npm run build` 一条命令把配置烘焙进静态产物，**零 npm 依赖**（只用 Node 内置模块）。

```
config/site.js    站点外壳：标题、导航、首屏、页脚、社交、加载页、菜单、主题色、404
config/story.js   叙事内容：17 个文字块 + 7 个项目热区（简写 DSL 撰写）
config/scene.js   3D 场景与滚动节奏：20 段 scrollLength、水晶配色、画质、素材路径
        │
        │  node tools/build.js   （约 0.22 秒）
        ▼
dist/             可直接部署的静态站点（GitHub Pages / 任意静态托管）
```

<p align="left">
  <img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A518-3c873a">
  <img alt="依赖" src="https://img.shields.io/badge/npm%20%E4%BE%9D%E8%B5%96-0-blue">
  <img alt="单元测试" src="https://img.shields.io/badge/%E5%8D%95%E5%85%83%E6%B5%8B%E8%AF%95-326-brightgreen">
  <img alt="端到端" src="https://img.shields.io/badge/%E7%AB%AF%E5%88%B0%E7%AB%AF-Playwright%20%E5%8F%AF%E9%80%89-blue">
  <img alt="工具层许可" src="https://img.shields.io/badge/%E5%B7%A5%E5%85%B7%E5%B1%82-MIT-lightgrey">
</p>

---

## 📑 目录

| 章节 | 讲什么 |
| --- | --- |
| [⚠️ 一、先读：素材与字体的授权](#️-一先读素材与字体的授权) | 哪些能用、哪些不能，先看这个 |
| [🚀 二、快速开始](#-二快速开始) | 五条命令跑起来 |
| [⚙️ 三、三个配置文件](#️-三三个配置文件) | 🏷 site / ✍️ story / 🎬 scene |
| [🎨 四、三项视觉设计](#-四三项视觉设计) | 📜 加载页 / ❄️ 移动端菜单 / 💎 水晶 |
| [🌐 五、部署](#-五部署) | GitHub Pages 与子路径那个坑 |
| [🔧 六、工作原理](#-六工作原理) | 黑盒替换管线怎么跑的 |
| [🧪 七、测试](#-七测试) | 326 项单测 + 可选浏览器验收 |
| [🗂 八、目录结构](#-八目录结构) | 文件放在哪 |
| [🧭 九、常见操作速查](#-九常见操作速查) | 想改 X 去哪改 |
| [🐞 十、已知问题与限制](#-十已知问题与限制) | 原始快照的坑与环境的坑 |
| [📄 十一、许可](#-十一许可) | |

---

## ⚠️ 一、先读：素材与字体的授权

**本仓库的 `tools/`、`config/`、`docs/` 是本项目自己写的代码，MIT 授权；
`src/` 快照现在随本仓库一起提供，`npm run fetch-src` 只做本地完整性校验，
不访问外部仓库（清单写死在 `tools/fetch-src.js`，70 个文件、约 11.1 MB）。

这么分是有原因的：`src/` 来自对
[storytelling.noomoagency.com](https://storytelling.noomoagency.com)
的静态克隆，其中包含**不属于本项目、也未获授权再分发**的内容：

| 内容 | 情况 |
|---|---|
| `src/_nuxt/TTNeorisTrialRegular.*.ttf` | **TT Neoris 试用版字体**（251,756 B），仅供试用，禁止商用 |
| `src/_nuxt/fonnts.com-theseasons-it.*.otf` | **The Seasons 是商业字体**（19,048 B），文件名显示来自盗版字体站 |
| `src/models/*.glb`、`src/textures/*`、`src/audio/*` | 原站视觉与音频素材，版权归原作者 |
| `src/_nuxt/*.js`、`src/_nuxt/*.css` | 原站编译产物（Nuxt/Vue/Three.js/GSAP 打包结果） |

**因此：这份模板只适合个人学习、技术研究、离线演示。**
任何对外发布、商业使用，请先把上述素材整套换成你有权使用的资源，
并自行确认字体授权。作者对使用者的侵权行为不承担责任。

---

## 🚀 二、快速开始

要求 Node ≥ 18，**不需要 `npm install`**（本项目没有任何依赖）。

```bash
git clone https://github.com/88lin/noomo-storytelling.git
cd noomo-storytelling

npm run fetch-src # 校验仓库内 src/ 快照（70 个文件，约 11 MB）
npm run build     # 构建到 dist/（源文件 70 个 + 2 个生成文件）
npm run serve     # 本地预览 dist/（端口 3000，自动挂在配置的 basePath 下）
npm run dev       # 边改边看：监听 config/ 与 tools/，改完自动重建 + 浏览器自动刷新
npm test          # 326 项单元测试（纯 Node，无依赖）
npm run test:e2e  # 可选：真浏览器验收（需 Python + Playwright）
```

`npm run build` 与 `npm test` 都挂了 `pre` 钩子，会先校验 `src/` 是否完整；
所以实际上直接跑 `npm run build` 也行。缺文件时会立即提示具体路径，不会偷偷联网下载。

改文案 → 存盘 → 浏览器自己刷新，一次全量重建实测 **203~224 ms**。
配置写错不会让 dev 进程挂掉：终端打印中文报错，`dist/` 保留上一次能用的版本，改回来自动恢复。

构建摘要长这样，四项视觉设置一眼可见：

```
构建完成  203ms  →  dist/
  文案补丁   89 处（外壳 76 + 滚动节奏 1 + 加载页 8 + 水晶 4）
  故事块     smallLight 3 / smallDark 4 / big 4 / lines 6 / cases 7
  滚动段落   20 段，桌面合计 4230，移动端合计 3715
  强调样式   accent
  菜单背景   frost（白字对比度 7:1）
  加载页     editorial（象牙纸排印）
  水晶       prism（棱镜）
  文件       70 个（其中 0 个由 config 替换）
```

---

## ⚙️ 三、三个配置文件

### 🏷 1. `config/site.js` —— 站点外壳

```js
module.exports = {
  meta: {
    lang: 'zh-CN',
    title: 'Noomo | 数字叙事的力量',
    description: '一个沉浸式 3D 网站，探索数字叙事的原理……',
    url: 'https://88lin.github.io/noomo-storytelling/',  // og:url / canonical
    basePath: '/noomo-storytelling/',                    // 见「🌐 五、部署」
    ogImage: 'src/og_image.jpg',
    favicon: 'src/fav.png',
    fontPreload: true,      // 在第一个 modulepreload 之前预载两款字体
  },
  brand:  { logo, logoHover, logoSimple, logoAlt },
  nav:    { home, agency, labs, contact, menuLabel: '菜单' },
  social: [ { label: 'X', url: '…' }, { label: 'Instagram', … }, { label: 'LinkedIn', … } ],
  contact:{ email: 'hello@noomoagency.com' },
  hero:   { title: 'storytelling', headline: { before: '数字', emphasis: '叙事', after: '的力量' },
            tapHint: '点击探索', scrollHint: '滚动探索', cta: { label: '重塑凤凰之魂', width: 182 } },
  cursor: { case: '查看项目', start: '点击开始' },
  footer: { tagline: '让我们以应有的方式，帮你讲述你的故事' },
  preloader: { … },   // 见「📜 加载页」
  menu:      { … },   // 见「❄️ 移动端菜单」
  errorPage: { message: '别在这儿迷路，回首页看看', rights: '© 版权所有', backAlt: '返回首页' },
  typography: {
    emphasis: 'accent',              // accent | gradient | italic | none
    onDark: '#88aeff', onLight: '#3762be',
    gradientOnDark: ['#ffffff', '#88aeff'], gradientOnLight: ['#3762be', '#29345a'],
  },
};
```

**关于 `emphasis`（强调样式）**：原站用**斜体衬线字**做强调。但打包进来的两款字体
（The Seasons、TT Neoris）**都没有中文字形**，中文走系统回退字体，`<i>` 只能得到
浏览器合成的「伪斜体」，很难看。所以模板默认改用 `accent`（换色强调），
另外提供 `gradient`（渐变字）、`italic`（保留原样式）、`none`（不强调）三种。
颜色按所在段落的明暗自动选 `onDark` / `onLight`。

**关于 `fontPreload`**：两款字体原本要等浏览器解析完 CSS 才开始下，首屏那个巨大的
斜体数字会先用系统字重排一次再跳。打开这个开关后，构建会在 HTML 里第一个
`<link rel="modulepreload">` 之前插入两条 `rel="preload" as="font" crossorigin`，
让字体和引擎包并行下载。

### ✍️ 2. `config/story.js` —— 叙事内容

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

#### 📝 文案简写 DSL

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

### 🎬 3. `config/scene.js` —— 场景与节奏

```js
{
  quality: 'high',            // 3D 画质
  sound: false,               // 是否默认开声音
  startColor: 'light',
  sections: [                 // 20 段滚动长度，数字或 { lg, xs }
    { lg: 100, xs: 50 }, { lg: 150, xs: 75 }, 300, … ,
  ],
  crystals: { palette: 'prism', items: [] },   // 见「💎 水晶」
  assets: {
    crystals: [ { model: 'src/models/crystal0.glb', texture: 'src/textures/crystals/0.jpg' }, …×7 ],
    environment: 'src/textures/wooden_studio_19_1k.hdr',
    ice: { color: …, normal: …, displacement: … },
    audio: { hover: […×5], release: 'src/audio/ReleaseSpirit.mp3' },
  },
}
```

调 `sections` 就是调**叙事节奏**：某段觉得太赶就把数字调大，冗长就调小。
改完记得同步检查 `story.js` 里引用该段的 `at/to/out/gone`。

**换素材**：`assets` 里的路径指向仓库内任意文件，构建时会替换进产物。
水晶模型必须是 **Draco 压缩的 `.glb`**，包围盒尺寸接近原模型；
**数量固定为 7 个**（相机时间线和材质是原站硬编码的，无法配置）。

---

## 🎨 四、三项视觉设计

原始快照保留了站点的加载页、移动端菜单和水晶配色。这三处在本模板里被重做过，
每一处都可以在配置里换预设或整个关掉。三套设计**刻意不共用色板** —— 加载页是暖白纸，
菜单是冷墨黑，水晶是七色棱镜，避免整站变成同一坨蓝渐变。

### 📜 4.1 加载页 `config/site.js → preloader`

```js
preloader: {
  style: 'editorial',       // editorial | progress | legacy
  paper: '#f2ede3',         // editorial：纸色
  ink:   '#14120f',         // editorial：墨色（与纸色对比度 16.02:1）
  background: ['#00276e', '#143a8a', '#062969'],  // progress：三段渐变
  accent: '#88aeff',        // progress：百分号与进度条高光
  glow: ['#4edbef', '#6248a4'],                   // progress：上下两团极光光斑
  mark: 'src/images/svg/logoSimple.svg',          // 置空则不显示标记
  markInvert: 'auto',       // auto | true | false：标记是否按底色反相
  showPercent: true,        // 关掉就只剩进度条
  tip: '正在加载沉浸式体验',  // 置空则不显示
  revealDuration: 2,        // 揭幕遮罩的秒数
}
```

| 预设 | 观感 |
| --- | --- |
| `editorial` | **象牙纸排印（默认）**：暖白纸底、680px 版心、版心左上角一枚 48px 标记，一个撑满版心的巨大斜体衬线数字，数字随进度**从左到右由淡墨转浓墨**，底部一条 1px 静态发丝线收边 |
| `progress` | 深蓝品牌渐变 + 极光光斑 + 居中百分比与进度条 |
| `legacy` | 原样不动，上游那张紫色渐变 |

`editorial` 的核心是那个数字**自己就是进度条**：用 `background-clip: text` 给数字铺一
道分界渐变，分界点由 `--ns-pre-cut` 精确映射到当前百分比。`0` 和 `100` 两头会各留
4% 的补偿，配合等量的 `padding` / 负 `margin`，避免字形侧边承（side bearing）被裁掉。
不支持 `background-clip:text` 的浏览器走 `@supports` 兜底，数字直接是纯墨色。

淡墨色不是手填的，是按纸色**反解**出来的（`solveFaint`），而且算的不是名义纸色，是
**最暗那一档纸**（`worstPaper`）—— 纸面铺了两团柔光渐变又压了一层颗粒，最暗处实测
`#e1ded7`，按名义纸色算会整整高估一档。当前配色下解得两个值：小字 `#64625d`（对最坏纸
4.53:1，过 AA 正文线）、数字未填充的那一半 `#817e79`（对最坏纸 3.01:1，够看清轮廓又不
抢已填充的部分，两半明度差 4.62:1）。纸墨对比度低于 7:1 会**直接报错而不是降级**，
因为加载页是整站唯一一屏纯文字。

底部那条发丝线**故意是静态的**，不跟着百分比跑。试过让它带进度，不成立：数字的墨色
分界点由 `background-clip:text` 决定，实际位置取决于字形的内容宽度，而 CSS 没有办法把
这个宽度传给兄弟元素 —— 86% 那一帧线已经跑到 585px，数字的分界还在 351px，差 244px，
读起来就是「线比数字快」。所以线退回去只当版心收边，进度全交给数字自己表达。

百分比是**真实**的：运行时订阅引擎自己的 `loading.progress` / `loading.complete`
事件，按 `loaded/total` 映射。引擎包本身还在下载、事件还没开始发的那一段，由一小段
引导脚本按时间缓动往前推，**上限 50%**，引擎起来之后从那个位置接着走，所以数字既不
会卡在 0，也不会先冲到 90 再倒退。

`mark`、`showPercent`、`tip` 三个全关会报错 —— 那样加载页就是一片空白。

> 顺带修掉了一个克隆自带的问题：克隆作者手写了一段轮询脚本硬把 `.preloader` 从 DOM 里
> `remove()` 掉，导致上游那个圆形揭幕动画**从来没播放过**，而且 Vue 之后会往一个已经
> 为 null 的父节点里插东西（桌面端稳定报 `Cannot read properties of null (reading 'insertBefore')`）。
> 现在换成了双向握手：运行时自己判定就绪 → 调组件自己的揭幕函数 → 由 Vue 正常卸载；
> 兜底脚本只做透明度过渡然后 `visibility:hidden`，**绝不摘节点**。

### ❄️ 4.2 移动端菜单背景 `config/site.js → menu`

```js
menu: {
  background: 'frost',      // frost | ink | aurora | gradient | none
  ink: '#0c0c0e',           // frost / ink：墨色底
  index: true,              // frost / ink：条目的 01 / 02 / 03 序号
  bloom: ['#0055ba', '#8000e0', '#a9007b', '#b4003b'],  // frost：四角彩晕
  grid: true,               // frost：暗网格（黑线不占亮度预算）
  colors: ['#00276e', '#143a8a', '#062969'],      // aurora / gradient
  glow: ['#4edbef', '#88aeff', '#6248a4'],        // aurora
  noise: true,              // 颗粒（normal 混合，std≈3.2/255）
  motion: true,             // 极光缓慢漂移；false 则完全静止
}
```

| 预设 | 观感 |
| --- | --- |
| `frost` | **带颜色的磨砂（默认）**：四角各一团全饱和彩晕（蓝 → 紫 → 玫 → 红）压在近黑墨底上，叠 64px 暗网格和一层胶片颗粒。导航左对齐竖排，序号打在条目上方，下划线从 0 拉到满宽 |
| `ink` | 墨玻璃索引：近黑墨色 + `backdrop-filter: blur(26px) saturate(110%)`，四条导航拉成满宽横排、上下各一条发丝线，右侧打 `01`–`04` 序号 —— 克制版，不想要颜色时用它 |
| `aurora` | 深蓝品牌渐变 + 三团极光光斑 + 噪点，缓慢漂移 |
| `gradient` | 同一套色，但不漂移、不发光，最省电 |
| `none` | 一行 CSS 都不输出，回到上游状态 |

`frost` 的四角色不是挑好看挑出来的，是解出来的：白字对彩晕峰值必须 ≥ 7:1，在
OKLCh 里按色相逐格二分，求每个色相在这条线下能吃到的最大彩度。结果很不对称 ——
暗底上紫红半圈能上色（h=280 时 C 上限 .295），青绿橙半圈几乎上不了（h=200 时
只有 .077，差近 4 倍）。四角因此取 h=258 / 300 / 345 / 15，全部贴着 7.0:1 落位。
同样的对比度预算下，四角有效色的色彩跨度是上一版的 3.2 倍。

`frost` 的细节：颗粒用 `feTurbulence` 生成、`normal` 混合（`overlay` 在暗底放大端会
炸成电视雪花），逐通道标准差标定到 2.7–3.2/255；对比度门把「无颗粒 / 颗粒均值 /
颗粒 +2σ」三态都算一遍取最坏 —— 因为颗粒在四角彩晕峰值处其实是**压暗**的，只算
均值会漏掉 6.1:1 那一档。`frost` 不用 `backdrop-filter`：菜单后面是全屏 3D 场景，
模糊它既拿不到磨砂质感又白烧一帧 GPU。

`ink` 的细节：序号走 `counter-reset` / `counter-increment` / `counter(ns-menu,
decimal-leading-zero)`，加减导航项不用改 CSS；左右留白用
`--ns-menu-gut: max(20px, (100% - 520px)/2)`，窄屏贴边 20px、宽屏自动居中收进 520px；
高度用 `@supports (height:100dvh)` 处理移动端地址栏；不支持 `backdrop-filter` 的浏览器
自动落到 `background-color: #0c0c0e` 实底；`prefers-reduced-motion: reduce` 时不做位移。
错峰入场复用上游自带的 `delay-200/250/300/350`，没有另造一套。

**上游那条规则整条是废的**：`.mobile-menu{//background-image:url(./images/menu_back.jpg);…}`
—— Sass 风格的 `//` 注释在 CSS 里非法，整条规则被解析器丢掉，而且
`src/images/menu_back.jpg` 这个文件在克隆里根本不存在。实测打开菜单时
`background-image` 是 `none`、`background-color` 完全透明，所谓「黑不溜秋」其实是
**完全没有背景**，看到的是底下的 3D 场景。构建时不动那两处坏规则，而是在
`<style id="ns-theme">` 里用 `.mobile-menu.mobile-menu` 提权覆盖。

对比度是构建期算的（`frost` 最坏 **7.0:1**、`ink` **15.4:1**），五套预设都会打印到
构建摘要里；`frost` 与 `ink` 低于 7:1 直接报错，其余预设低于 4.5:1（AA）告警。

### 💎 4.3 水晶配色 `config/scene.js → crystals`

```js
crystals: {
  palette: 'prism',    // prism | aurora | ice | jewel | legacy | custom
  base: {},            // 可选：一次性覆盖 7 颗共用的光学参数
  items: [],           // 可选：逐颗覆盖，要给就得给满 7 条（{ rest: {...}, ...hover }）
}
```

| 预设 | 观感 |
| --- | --- |
| `prism` | **棱镜（默认）**：静止态就是七色，色相沿色轮铺开（琥珀 → 珊瑚 → 玫瑰 → 紫罗兰 → 靛蓝 → 青 → 薄荷），中低饱和高明度，通透 |
| `aurora` | 极光虹彩：静止态偏冷蓝底，悬停才炸出七色 |
| `ice` | 冰蓝：全部收进蓝青一带，低饱和，冷 |
| `jewel` | 宝石：同色相压暗提饱和，像有色宝石 |
| `legacy` | 上游原样，一个字节都不改 |
| `custom` | 完全自己写，必须给满 7 条 |

`prism` 的实际输出（构建期算出来的，可在测试里断言）：

| # | 静止态 | 悬停态 | 色相 |
|---|---|---|---|
| 1 | `#e0bf85` | `#f8d496` | 琥珀 38° |
| 2 | `#e19f8e` | `#f8ae9b` | 珊瑚 12° |
| 3 | `#e199bd` | `#f7a1cc` | 玫瑰 330° |
| 4 | `#ce9cde` | `#e2a3f5` | 紫罗兰 286° |
| 5 | `#90a5e0` | `#98b1f6` | 靛蓝 224° |
| 6 | `#86d3df` | `#92e9f7` | 青 188° |
| 7 | `#92ddba` | `#99f5ca` | 薄荷 152° |

**为什么之前「改了看不出来」**：引擎里 `crystal` 和 `crystalHovers` 是两张不同的表。

- `crystal` = **静止态**，上游让 7 颗**共用同一份**，而且设成了纯白 `#ffffff` —— 这是
  95% 时间看到的样子，怎么改配色都是七颗一模一样的白疙瘩。
- `crystalHovers` = **悬停态**，逐颗不同，**只在鼠标悬停时**通过弹簧插值过去。
  移动端没有 hover，永远看不到。

所以「7 个颜色」在上游是隐藏款。本模板的解法是**给静止态也开一张逐颗的表**：注入新键
`crystalRests: { crystal0: {…}, …, crystal6: {…} }`，并改写引擎里两处读取点，让它优先按
`this.id` 取自己那份，取不到才回落到共用的 `crystal`。于是**不悬停、不点、纯静止**就
能看出七颗是七个颜色；悬停时再往同色相的高饱和版本走（棱峰 `+34°`、边缘 `−26°` 的色散偏移）。

几何模型没换 —— 每颗 `crystalN.glb` 里除了立方体本体，还嵌着一个刻着客户 logo 的
`Icon` 网格和一份预计算的 `ConvexHull`，顶点属性（`_peaks` / `_convexity` /
`_thickness` / `_concavity`）是烘焙进去的。换模型要重跑上游的烘焙流程，不在本模板范围内。
同理，`distancesFactor`、`convexityFactor`、`concavityFactor`、`peaksFactor`、
`uvShiftFactor`、`resetDistances`、`colorFactor`、`decayFactor` 这 8 个参数直接乘在烘焙
数据上，预设一律不碰。

> ⚠️ **水晶的观感必须真机验收。** 无 GPU 环境（CI、容器、远程沙箱）下 WebGL 走
> SwiftShader，帧率个位数，引擎写进 store 的 `getIceCubePositionByIndex` 恒为 0，
> 滚动根本进不到水晶那一段 —— 自动化测试只能验参数正确，验不了好不好看。
> 改完配色请在真机上滚到「品牌滑动体验」那一屏，7 颗静止时就应该是 7 个颜色。

### 🔍 4.4 改完怎么看

```bash
npm run dev      # 监听 config/ 与 tools/，改一下存一下就重建 + 刷新
```

`npm run dev` 是增量构建，改配色不需要重新解一遍引擎包。

---

## 🌐 五、部署

### GitHub Pages（已配好工作流）

1. 把 `config/site.js` 的 `meta.basePath` 改成 `'/你的仓库名/'`（**必须以 `/` 开头和结尾**）；
   如果是 `用户名.github.io` 这类根域名仓库，填 `'/'`。
2. 仓库 **Settings → Pages → Source 选 `GitHub Actions`**。这一步必须手动点。
   仓库如果曾经用过默认的 `Deploy from a branch`，Jekyll 会一直抢占部署，
   工作流跑绿了线上还是旧内容 —— `actions/configure-pages` 没有权限替你切换这个开关。
3. 推到 `main`。`.github/workflows/pages.yml` 会：跑测试 → 构建 → 校验产物 → 发布。

工作流**不跑 `npm ci`**，因为没有依赖可装；并发组设的是
`cancel-in-progress: false`，避免连着推两次时把正在发布的那次掐断、留下半截站点。

### ⚠️ 子路径部署：`meta.basePath` 不是可选项

站内**静态资源**引用确实是相对路径（`./_nuxt/…`），但 **Nuxt 运行时的 `app.baseURL`
被上游烤死成了 `"/"`**，光靠相对路径救不了。它是 Vue Router 的 history base、
app manifest 的地址、`publicAssetsURL()` 生成图标路径的来源。部署到
`用户名.github.io/仓库名/` 时会连环出事：

1. 路由 base 还是 `/`，当前地址 `/仓库名/` 匹配不到任何路由，首页被渲染成 Nuxt 错误组件
   —— 肉眼看就是**「打开网页啥都没有」**；
2. app manifest 去 `/_nuxt/builds/meta/*.json` 找 → 404；
3. `close.svg`、`fromError.svg` 这些走 `publicAssetsURL()` 的图标去域名根找 → 404。

**这三样在根路径本地预览时都不暴露，只有真部署到子路径才炸。**
构建时的 `meta.basePath` 锚点（`tools/anchors.js`）就是改这个的。本地要提前验证，用：

```bash
BASE=/some-path/ npm run serve   # serve 会把站点真的挂到子路径下
npm run test:e2e                 # e2e 的静态服务器只服务子路径，会断言运行时 baseURL
```

### 其它静态托管

把 `dist/` 整个目录上传即可，同样先把 `meta.basePath` 配对。
`404.html` 里的返回链接和内联字体路径也走 `basePath`，配错会 404。

---

## 🔧 六、工作原理

原站是 Nuxt + Vue + Three.js + GSAP 的**编译产物**，源码不可得。
本模板没有去反编译或重写它，而是把它当成一个**黑盒**，只在几个精确的位置做替换：

```
src/index.html            外壳 HTML（标题、meta、预渲染的导航与页脚）
src/_nuxt/FZFS71Nt.js     页面组件 chunk（首屏、页脚等文案）
src/_nuxt/CbdjwYMp.js     引擎 chunk（Vue 运行时 + Three.js + GSAP + 全部文案，161 万字符）
src/_nuxt/story.data.js   ← 构建时新生成：5 个故事数组
```

构建管线做五件事：

1. **锚点替换**（`tools/anchors.js` 等）：**89 处**文案/链接/属性/样式
   （外壳 76 + 滚动节奏 1 + 加载页 8 + 水晶 4），每一处都是一段**在整个文件中唯一**
   的字符串。匹配不到、或匹配到多处，构建立即失败 —— 宁可炸掉，也不要半替换出一个坏站。
2. **故事数据注入**：`config/story.js` 经 DSL 编译成 HTML，写进 `story.data.js`，
   引擎里原来的 5 个内联数组改成从这个模块读。
3. **滚动节奏改写**：引擎里 20 段 `scrollLength` 的生成器函数被整体换掉。
   默认配置下的输出与原文件**逐字节一致**（有测试保证）。
4. **主题与视觉注入**：生成 `<style id="ns-theme">`（强调色、`{line}` 的宽度/偏移变量、
   加载页、菜单、`:focus-visible` 焦点环），加载页运行时脚本也在这一步内联进去。
5. **资源与产物**：拷贝 `src/` 全量文件，按 `scene.js` 替换素材，生成 `404.html`。

### 为什么 CSS 类名不能乱写

`src/_nuxt/*.css` 是**已经编译好的 Tailwind 产物**，里面只有原站用过的 **585 个类名**。
写一个不存在的类（比如 `lg:text-serif-26`）不会报错，只会**静默失效**。
所以构建会校验所有 `className` 与 DSL 产出的类名，未知类名直接失败并给出相近建议。

需要任意宽度/位移时用 DSL 的 `{line w= x= y=}` —— 它走 CSS 自定义属性
（`--ns-w-lg` / `--ns-t-x-xs` 等）而不是 Tailwind 类，因此取值不受编译产物限制。

### 404 页面为什么是独立的一页

试过三种方案，只有第三种成立：

1. 直接把 `index.html` 复制成 `404.html` —— **不行**。资源引用全是相对路径，
   访问 `/repo/cases/xxx` 时会去找 `/repo/cases/_nuxt/…`，全部 404。
2. 加 `<base href="/repo/">` —— 资源能加载了，但 Vue Router 会把 `<base>` 当成路由基址，
   而缺失的路由 chunk 会触发 Nuxt 的「chunk 加载失败 → 强制整页刷新」逻辑，**有死循环风险**。
3. **采用**：`tools/build.js` 生成一个**零 JS 的独立 404 页** —— 深蓝底、`404` 水印、
   内联 `@font-face`、中文提示 + 返回首页胶囊按钮 + 版权行，`<meta name="robots" content="noindex">`。
   文案在 `site.errorPage` 里配。

> 注意：这一页**不加载站点的 Tailwind 产物**，所以 `html{font-size:10px}` 不生效，
> 这里 `1rem = 16px`，不要照搬站内「1 单位 = 1px」的写法。

---

## 🧪 七、测试

```bash
npm test          # 326 项单元测试
npm run test:e2e  # 可选的 Playwright 真浏览器验收
```

| 层 | 数量 | 覆盖 |
| --- | --- | --- |
| 单元（纯 Node，零依赖） | **326** | DSL 编译、位置求值、锚点唯一性与产物断言、故事块、场景 payload、类名白名单、加载页、菜单、水晶、颗粒标定、构建产物与静态服务器请求解析 |
| 端到端（Playwright，可选） | 按配置执行 | 注水后中文没被换回英文、外链行为与 `rel`、子路径无 404、404 页、加载页真实进度、菜单实拍像素对比度、控制台零报错 |

e2e 需要 `pip install playwright && playwright install chromium`，**故意不作为构建依赖**。
它检查的核心是「Vue 注水之后中文还在不在」—— 这正是原始克隆站翻译失败的地方：
预渲染 HTML 是中文，注水瞬间被 JS 里的英文覆盖回去。本模板同时改了两边，所以不会回退。

**无法自动验证的部分**：headless 环境用 SwiftShader 软件渲染，3D 场景的实际观感、
水晶折射、滚动手感、音效都需要你在真机上亲眼确认。详见
[`docs/代码审查.md`](docs/代码审查.md) 的「已知环境限制」一节。

---

## 🗂 八、目录结构

```
config/          三个配置文件（你主要改这里）
  site.js        站点外壳 / 加载页 / 菜单 / 主题 / 404
  story.js       17 个文字块 + 7 个项目热区
  scene.js       滚动节奏 / 水晶配色 / 素材路径
src/             原站静态产物（黑盒，随仓库提供，由 npm run fetch-src 校验）
tools/
  build.js       构建入口
  dev.js         监听 + 热重载
  serve.js       静态预览服务器（零依赖）
  anchors.js     76 处外壳锚点替换表 + 字体预载 + 外链 rel
  markup.js      文案简写 DSL 编译器
  blocks.js      故事块 → HTML
  positions.js   滚动位置表达式求值
  theme.js       强调色与 {line} 的 CSS 变量规则
  preloader.js   加载页三套预设的 CSS 与锚点
  menu.js        移动端菜单五套预设的 CSS 与对比度校验
  crystals.js    水晶六套预设 + crystalRests 逐颗静止态注入
  grain.js       胶片颗粒生成与标定、彩晕/网格叠层的最坏对比度模型
  color.js       色彩换算与对比度求解
  scene.js       场景配置 → 引擎 payload
  payload.js     引擎 payload 的读写与转义
  assets.js      配置校验与素材替换
  cssclasses.js  编译产物里的 585 个类名白名单校验
  scanner.js     锚点唯一性扫描
  paths.js       路径、产物文件名、预载字体清单
  runtime/story-runtime.js      注入引擎的故事数据读取器
  runtime/preloader-runtime.js  加载页真实进度与揭幕握手
  fetch-src.js   校验仓库内 src/ 快照（70 个文件）
  test/          326 项单元测试 + e2e.py（Playwright 可选）
docs/
  改造说明.md    从克隆站到模板的完整改造记录
  代码审查.md    全仓审查结论、已修问题、不改的理由、环境限制
.github/workflows/pages.yml   CI：测试 → 构建 → 发布 Pages
dist/            构建产物（已在 .gitignore 中）
```

---

## 🧭 九、常见操作速查

| 想做什么 | 改哪里 |
|---|---|
| 换标题 / 描述 / favicon | `config/site.js` → `meta` |
| 换首屏大字 | `config/site.js` → `hero.title`（默认保留英文 `storytelling`） |
| 改某段文案 | `config/story.js` 对应块的 `text` |
| 某段出现得太早/太晚 | 该块的 `at/to/out/gone` |
| 整体节奏太慢 | `config/scene.js` → `sections` 调小 |
| 换强调样式 | `config/site.js` → `typography.emphasis` |
| 换加载页风格 | `config/site.js` → `preloader.style` |
| 换加载页纸墨色 | `config/site.js` → `preloader.paper` / `preloader.ink` |
| 换移动端菜单背景 | `config/site.js` → `menu.background` |
| 关掉菜单序号 | `config/site.js` → `menu.index: false` |
| 换水晶配色 | `config/scene.js` → `crystals.palette` |
| 逐颗自定义水晶 | `crystals.palette: 'custom'` + `crystals.items`（给满 7 条） |
| 换项目链接 | `config/story.js` → `cases[].url`（留空则不可点） |
| 换 3D 素材 | `config/scene.js` → `assets` |
| 部署到子路径 | `config/site.js` → `meta.basePath` |
| 关掉字体预载 | `config/site.js` → `meta.fontPreload: false` |

---

## 🐞 十、已知问题与限制

### 上游带来的（不是本模板引入的）

- `/cases/:slug` 和 `/contacts` 两个路由的 chunk（`B1pKjyE0.js`、`N9wcHCtb.js`）
  **在克隆时就没被抓下来**，站内路由全是死链。所以 7 个项目热区和联系入口
  在本模板里改成了**可配置的外部链接**（`window.open(…, '_blank')`），不再走前端路由。
- 上游 HTML 里有 `lg:hiddn`、`lg!w-400` 这类拼错的类名，重写时已顺手去掉。
- 原站的 `lg:lines-text-gradient` 在 CSS 里不存在，渐变文字其实一直没生效；
  DSL 的 `{g}` 输出无前缀的 `lines-text-gradient`，现在能正常渲染。
- The Seasons 斜体没有 `tnum` 等宽数字表，加载页百分号会随数字宽度横向轻微跳动。
  这是字体本身的度量，改 CSS 解决不了，只能换字体 —— 详见 `docs/代码审查.md`。

### 环境限制

- **无 GPU 环境渲染不出水晶区**：SwiftShader 软件渲染帧率个位数，水晶的 y 坐标恒为 0，
  滚动进不到那一屏。水晶只能真机验收。
- **`backdrop-filter` 在软件渲染里被算成 `none`**，但 `CSS.supports` 仍报 true。
  e2e 因此改成验 CSSOM 里的声明，而不是 computed style。
- **伪元素里的 `counter()` 在 computed style 中不求值**（`frost` 走 `::before`、
  `ink` 走 `::after`），菜单序号只能断言字面量与 `counter-increment` / `counter-reset`。

---

## 📄 十一、许可

构建工具与配置层：**MIT**（见 [`LICENSE`](LICENSE)）。
`src/` 下的第三方代码、字体、模型、贴图、音频**不在此授权范围内**，见
[⚠️ 一、先读：素材与字体的授权](#️-一先读素材与字体的授权)。

想改这个模板本身，先看 [`CONTRIBUTING.md`](CONTRIBUTING.md)（改锚点的规矩、测试门槛）
和 [`docs/改造说明.md`](docs/改造说明.md)（每一处改动的来龙去脉）。
