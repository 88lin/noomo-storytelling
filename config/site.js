'use strict';
/**
 * config/site.js — 外壳文案与品牌配置
 * =====================================
 *
 * 这里放的是「故事之外」的所有文字：页面标题、导航、页脚、光标提示、社交链接。
 * 每一项在构建时都会被写进三个地方（预渲染 HTML、页面 chunk、引擎 chunk），
 * 三处必须一致，否则 Vue 注水（hydration）会把你的中文换回英文。
 * 构建脚本会强制校验替换次数，改错了会直接报错，不会静默失效。
 *
 * 资源字段（logo / ogImage / favicon ...）写「相对仓库根目录的路径」即可，
 * 换素材只要把路径指向你自己的文件，构建时会自动拷贝并重写引用。
 */

module.exports = {
  // ------------------------------------------------------------------ 元信息
  meta: {
    lang: 'zh-CN',
    title: 'Noomo | 数字叙事的力量',
    description:
      '一个沉浸式 3D 网站，探索数字叙事的原理 —— 通过 Noomo 为 Salesforce、AMD、Coinbase、Intel 和 Vogue 打造的真实项目。',
    // 站点最终部署地址，用于 og:url。改成你自己的域名或 Pages 地址。
    url: 'https://88lin.github.io/noomo-storytelling/',
    // 部署根路径（url 里域名之后的那一段，必须以 / 开头和结尾）。
    //   自定义域名挂在根目录        → '/'
    //   GitHub Pages 项目页          → '/仓库名/'
    // 站内所有资源引用都是相对路径，只有两处需要知道绝对根：404 页面的
    // <base>，和 404 页「返回」按钮的跳转目标。填错了这两处会失效，
    // 首页本身不受影响。
    basePath: '/noomo-storytelling/',
    ogImage: 'src/og_image.jpg',
    favicon: 'src/fav.png',
  },

  // -------------------------------------------------------------------- 品牌
  brand: {
    logo: 'src/images/svg/logo.svg',        // 默认（深色）标志
    logoHover: 'src/images/svg/logo2.svg',  // 悬停 / 反色版本
    logoSimple: 'src/images/svg/logoSimple.svg', // 移动端菜单里的简版
    logoAlt: 'Noomo 品牌标识',
  },

  // -------------------------------------------------------------------- 导航
  // 站内路由在这个静态克隆里全部是死链（原站的 /contacts、/cases/* 代码块
  // 并没有被导出），所以这里一律指向可用的外部地址。
  nav: {
    home: { label: '首页', url: './' },
    agency: { label: '主站', url: 'https://noomoagency.com' },
    labs: { label: '实验室', url: 'https://labs.noomoagency.com' },
    contact: {
      label: '联系我们',
      url: 'https://noomoagency.com/connect',
      external: true, // true 时桌面端导航按钮加 target="_blank"
    },
    menuLabel: '菜单', // 移动端汉堡按钮旁的文字
  },

  // ------------------------------------------------------------------ 社交链接
  // 顺序固定为 [x, instagram, linkedin]，与页脚的三个位置一一对应。
  // 平台名保留拉丁字母是中文站的通行做法；想用中文名直接改 label 即可
  // （例如 'Instagram' -> '照片墙'、'LinkedIn' -> '领英'）。
  social: [
    { label: 'X', url: 'https://x.com/noomoagency' },
    { label: 'Instagram', url: 'https://www.instagram.com/noomoagency/' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/noomoagency' },
  ],

  contact: {
    email: 'hello@noomoagency.com',
  },

  // -------------------------------------------------------------------- 首屏
  hero: {
    // 三段式标题：before + <换行> + 斜体强调 + after
    headline: { before: '数字', emphasis: '叙事', after: '的力量' },
    // 巨型字用的是 TheSeasons 衬线体，没有中文字形，保持英文。
    title: 'storytelling',
    tapHint: '点击探索',   // 移动端
    scrollHint: '滚动探索', // 桌面端
    cta: {
      label: '重塑凤凰之魂',
      // 胶囊按钮宽度（像素）。编译后的 CSS 只带了固定几档 w-* 工具类，
      // 所以这里用行内样式覆盖，任意长度的文案都能撑住。
      width: 182,
    },
  },

  // ------------------------------------------------------------------ 自定义光标
  cursor: {
    case: '查看项目',  // 悬停在水晶项目上
    start: '点击开始', // 首屏进入体验
  },

  footer: {
    tagline: '让我们以应有的方式，帮你讲述你的故事',
  },

  // -------------------------------------------------------------- 加载页
  // 上游是一片 45° 淡紫渐变 + 正中一个 50px 的 loader.gif，问题不是「丑」，
  // 是**空**且**没有反馈**：站内最大的 v20.glb 有 4.3MB，慢网下要等很久，
  // 而屏幕上没有任何东西告诉用户还剩多少。这里换成品牌深蓝 + 真实百分比。
  //
  // 进度数字来自引擎自己的加载事件（THREE.LoadingManager 的 loaded/total），
  // 不是假动画；但它按**资源条目数**计数、不按字节，所以原始比值是阶梯状的，
  // 构建注入的运行时会取「只增不减的上包络」再做缓动，让它看起来连续。
  // 万一订阅失败（上游换了构建），会自动退化成时间缓动，不会卡住也不会报错。
  //
  // style:
  //   'progress' 品牌深蓝渐变 + 标识 + 百分比 + 进度条（默认）
  //   'legacy'   原封不动保留上游的淡紫底 + loader.gif，一键回退
  preloader: {
    style: 'progress',
    // 底色三段：起点 / 中段 / 终点。数字和提示语是白色，所以要够深。
    background: ['#00276e', '#143a8a', '#062969'],
    // 百分号和进度条的高亮色。
    accent: '#88aeff',
    // 上下两团光晕，避免大面积纯渐变发闷。
    glow: ['#4edbef', '#6248a4'],
    // 中央标识；留空字符串就不显示。默认复用站内那枚白色像素 logo。
    mark: 'src/images/svg/logoSimple.svg',
    showPercent: true,
    tip: '正在加载沉浸式体验', // 留空则不显示这行小字
    // 揭幕动画时长（秒）。上游是 2；改这个值会同步改滚动解锁的延时。
    revealDuration: 2,
  },

  // ------------------------------------------------------------ 移动端菜单
  // 上游给菜单写过背景，但那条 CSS 用 Sass 风格的 `//` 注释掉了（`//` 在纯
  // CSS 里非法，整条规则会被丢弃），引用的 images/menu_back.jpg 也不存在。
  // 结果是菜单**没有自己的背景**：白色导航文字直接压在 3D 场景上，页面顶部
  // 场景偏淡就几乎看不见字，滚到深色段落又是一片黑。这里给它一个自己的底。
  //
  // background:
  //   'aurora'   深蓝渐变 + 三团极光光斑 + 细噪点（默认）
  //   'gradient' 纯线性渐变，最省电，动画和噪点都不要
  //   'frost'    半透明深色 + 背景模糊，3D 场景隐约透出来
  //   'none'     什么都不注入，保持上游那个「没有背景」的状态
  menu: {
    background: 'aurora',
    // 底色三段：起点 / 中段 / 终点。文字是上游写死的白色，所以要够深。
    colors: ['#00276e', '#143a8a', '#062969'],
    // 三团光斑的颜色，只有 aurora 用得到。
    glow: ['#4edbef', '#88aeff', '#6248a4'],
    noise: true,  // 细噪点，用来打散深色渐变上的色带
    motion: true, // 极光缓慢飘动；系统开了「减少动态效果」时会自动停
  },

  // ----------------------------------------------------------------- 404 页
  // 这个静态克隆里除首页外的所有路由都是死链（原站的 /contacts、/cases/*
  // 代码块没被导出），任何非首页地址都会落到这张 404 页，所以它的文案同样
  // 需要汉化。
  errorPage: {
    message: '别在这儿迷路，回首页看看',
    rights: '© 版权所有',
    backAlt: '返回首页', // 返回按钮图标的 alt 文本
    // 返回按钮的跳转目标默认取 meta.basePath，一般不用改。
  },

  // -------------------------------------------------------------- 强调样式
  // 原站的 [[强调]] 是「衬线体 + 斜体」。这条路对中文走不通：
  // 站内自带的两款字体（TheSeasons / TT Neoris）都没有中文字形，中文会掉回
  // 系统字体，再被浏览器强行拉斜 —— 也就是所谓的「伪斜体」，中文排版里通常
  // 被认为是错误做法。所以这里把强调改成「换色」，并保留切回原效果的开关。
  //
  // mode:
  //   'accent'  换色（默认，适合中文）
  //   'gradient' 渐变填色，与站内 .lines-text-gradient 同一套语言
  //   'italic'  原版：衬线体斜体（拉丁文案请用这个）
  //   'none'    不加任何视觉区分，只保留语义 <i>
  //
  // onDark / onLight 分别对应「白字段落」和「深色字段落」里的强调色。
  typography: {
    emphasis: 'accent',
    onDark: '#88aeff',   // --color-brand-blue-200
    onLight: '#3762be',  // --color-brand-blue
    // gradient 模式用的两端颜色
    gradientOnDark: ['#ffffff', '#88aeff'],
    gradientOnLight: ['#3762be', '#29345a'],
  },
};
