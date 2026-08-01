'use strict';
/**
 * config/story.js — 滚动叙事的全部文案与排版
 * ============================================
 *
 * 这一份配置决定了页面上 24 个会随滚动出现/消失的文字块，以及 7 个水晶项目卡。
 * 3D 场景（水晶数量、相机轨迹、材质）是预编译好的，**块的数量不能增删**，
 * 但每一块的文字、字号、位置、出现时机都在这里改。
 *
 *
 * 一、四种文字块
 * ---------------
 *   smallLight  3 块  深色字（#29345a），出现在浅色场景段
 *   smallDark   4 块  白字，出现在深色场景段
 *   big         4 块  巨型衬线字（200px），逐字渐变
 *   lines       6 块  白字，按「行」而不是按「字」做动画
 *   cases       7 项  水晶项目卡（标题 + 副标题 + 外链）
 *
 *
 * 二、出现时机：at / to / out / gone
 * ----------------------------------
 * 滚动位置不是像素，而是「第几段 + 偏移」。写成对象：
 *
 *     at:   { s: 10, base: 150 }        // 第 10 段结束处 + 150
 *     to:   { s: 10, base: 250 }        // 淡入结束
 *     out:  { s: 11, base: 220, short: -40 }  // 开始淡出
 *     gone: { s: 11, base: 420, short: -40 }  // 完全消失
 *
 * 可用的键：
 *     s       累加到第 s 段为止的滚动长度（见 config/scene.js 的 sections）
 *     base    固定偏移
 *     half    偏移，但移动端自动折半（原站大量使用，用来压缩手机上的滚动距离）
 *     mobile  仅移动端追加
 *     tablet  仅平板追加
 *     short   仅当窗口高度 < 850px 时追加
 *
 * 四个值必须递增：at < to <= out < gone。
 *
 *
 * 三、文案简写
 * -------------
 * 每一行配置 = 页面上渲染的一行（换行自动变成 <br>）。行尾加 `\` 表示「这一
 * 行还没完」，用来把装饰线、图标单独写一行而不产生多余换行。
 *
 *   [[强调]]            强调（中文默认换色，见 config/site.js 的 typography）
 *   {em ...}...{/em}    同上，可带参数：sz= cls= x= y= xs-x= lg-x= ...
 *   {sz 38/26}...{/sz}  临时改字号（永远写「桌面/手机」）
 *   {line w= x= y= ...} 装饰横线；flags: half dark lg-only xs-only no-scale
 *                       w/x/y 单位是 px，也可写 8% / 1/3 / [3vw]
 *   {icon bird|bird2|feather|flower}   插画图标；flags: rotate block
 *   {g}...{/g}          渐变文字（需要块上写 gradientDir: 'left' | 'right'）
 *   {grad}...{/grad}    巨型字专用的逐字渐变
 *   {z}...{/z}          relative z-2，压在装饰线上面
 *   {lg}...{/lg}        只在桌面显示    {xs}...{/xs} 只在手机显示
 *   {span "类名"}...{/span}   任意类名
 *   {raw}...{/raw}      原样输出 HTML（终极逃生舱）
 *   {br} {nbsp}
 *
 *
 * 四、关于英文
 * -------------
 * 巨型字用的 TheSeasons 是一款只有拉丁字形的衬线体。中文放进去会掉回系统字体，
 * 而 .gradient-text 的逐字负边距（-0.35em）是按拉丁字形调的，中文会糊成一团。
 * 所以 narrative. / Light / Spirit / Sound 这四个词保持英文，当作视觉元素处理。
 */

module.exports = {
  // ==================================================================
  // 浅色场景里的深色文字
  // ==================================================================
  smallLight: [
    {
      // 开场第一句
      className: 'top-1/2 left-1/2 -translate-x-1/2 xs:-translate-y-1/1 lg:-translate-y-2/3',
      size: '50/30',
      align: 'center',
      at: { s: 0, half: -50, mobile: 30 },
      to: { s: 0, half: 100 },
      out: { s: 1 },
      gone: { s: 1, half: 150 },
      text: `{icon bird mb=20}\\
{line half w=300/200 xs-y=-5 lg-y=0 xs-x=1/2 lg-x=1/3}\\
世界始终在
{line lg-only w=500/350 x=10% y=-200%}\\
{z}不断[[流变]]，{/z}
{line half w=412/300 xs-y=8 lg-y=0 xs-x=-10% lg-x=0}`,
    },
    {
      // 右对齐的阶梯排版：每行用 mr-* 错开，视线自右上向左下滑
      className: 'lg:top-[40vh] xs:top-[30vh] right-[10vw]',
      size: '50/30',
      align: 'right',
      at: { s: 1, half: 100 },
      to: { s: 1, half: 220 },
      out: { s: 2, half: 70 },
      gone: { s: 2, half: 200 },
      text: `{span "inline-block xs:mr-20 lg:mr-166"}引领我们{/span}
{line lg-only half w=230 x=1/1}\\
{span "inline-block xs:mr-25 lg:mr-110 relative z-2"}穿过[[变化]]、{/span}
{line lg-only half w=300 lg-x=4/5 xs-x=110%}\\
{span "inline-block xs:mr-0 lg:mr-0 relative z-2"}穿过重塑，{/span}
{line lg-only half w=400 x=4/6}\\
{span "inline-block xs:mr-20 lg:mr-115 relative z-2"}与[[未知]]的，{/span}
{line half w=600/300 lg-y=-200% xs-y=0 lg-x=-1/3 xs-x=5%}`,
    },
    {
      className: 'top-1/2 left-1/2 -translate-x-1/2 xs:-translate-y-[120%] lg:-translate-y-2/3',
      size: '50/30',
      align: 'center',
      at: { s: 3, half: 250 },
      to: { s: 3, half: 400 },
      out: { s: 5 },
      gone: { s: 5, half: 100 },
      text: `{icon bird2 rotate mb=20}\\
{line half w=320/250 xs-x=-10% lg-x=15%}\\
而[[故事]]，诞生于
{line half w=400/200 x=10% y=4}`,
    },
  ],

  // ==================================================================
  // 巨型衬线字。这四块保持英文，理由见文件头。
  // ==================================================================
  big: [
    {
      className: 'top-1/2 left-1/2 -translate-x-1/2 xs:-translate-y-1/1 lg:-translate-y-1/2',
      family: 'serif',
      size: '200/80',
      align: 'center',
      pClass: 'whitespace-nowrap',
      at: { s: 2, half: 150 },
      to: { s: 2, half: 300 },
      out: { s: 3, half: 150 },
      gone: { s: 3, half: 300 },
      // 「是」要贴在 narrative. 的左上方，位移量和原版一致，
      // 这种一次性的精细定位直接写 HTML 比发明新语法划算。
      text: '{raw}<i class="lg:text-sans-50 xs:text-sans-30 xs:block lg:inline text-brand-black '
        + 'ns-t" style="--ns-ty-lg:-200%;--ns-tx-lg:-40%;--ns-ty-xs:140%">是</i>{/raw} '
        + '{grad}narrative.{/grad}{br}',
    },
    {
      className: 'top-1/2 left-1/2 -translate-x-1/2 xs:-translate-y-1/1 lg:-translate-y-1/2',
      family: 'serif',
      size: '200/100',
      align: 'center',
      pClass: 'whitespace-nowrap gradient-text gradient-text-big',
      at: { s: 5, half: 50 },
      to: { s: 5, half: 120 },
      out: { s: 5, half: 270 },
      gone: { s: 5, half: 340 },
      text: 'Light',
    },
    {
      className: 'top-1/2 left-1/2 -translate-x-1/2 xs:-translate-y-1/1 lg:-translate-y-1/2',
      family: 'serif',
      size: '200/100',
      align: 'center',
      pClass: 'whitespace-nowrap gradient-text gradient-text-big',
      at: { s: 6, half: -190 },
      to: { s: 6, half: -120 },
      out: { s: 6, half: -20 },
      gone: { s: 6, half: 50 },
      text: 'Spirit',
    },
    {
      className: 'top-1/2 left-1/2 -translate-x-1/2 xs:-translate-y-1/1 lg:-translate-y-1/2',
      family: 'serif',
      size: '200/100',
      align: 'center',
      pClass: 'whitespace-nowrap gradient-text gradient-text-big',
      at: { s: 6, half: 30 },
      to: { s: 6, half: 100 },
      out: { s: 6, half: 200 },
      gone: { s: 6, half: 270 },
      text: 'Sound',
    },
  ],

  // ==================================================================
  // 深色场景里的白字
  // ==================================================================
  smallDark: [
    {
      className: 'xs:top-1/4 lg:top-1/12 left-1/2 -translate-x-1/2',
      size: '50/38',
      align: 'center',
      at: { s: 10, base: -100 },
      to: { s: 10, base: -30 },
      out: { s: 10, base: 50 },
      gone: { s: 10, base: 170 },
      text: `{icon flower block mb=26}\\
最好的[[故事]]
{line lg-only dark w=280 y=-4}\\
{z}不只是{/z}
{line lg-only dark w=260}\\
{z}说给我们听{/z}
{line lg-only dark w=300 x=-7%}\\
{z}它邀请我们{/z}
{line lg-only dark w=300 y=-4 x=-7%}\\
{z}一起[[走进]]故事{/z}
{line dark w=300 lg-y=-2 xs-x=2% lg-x=7%}`,
    },
    {
      className: 'xs:top-1/9 lg:top-1/6 left-1/2 xs:w-full lg:w-auto -translate-x-1/2',
      size: '26/18',
      align: 'center',
      at: { s: 17, base: -180, mobile: -100 },
      to: { s: 17, base: -90, mobile: -100 },
      out: { s: 17, base: -10, mobile: -20 },
      gone: { s: 17, base: 60, mobile: -20 },
      text: '叙事，远不止于\n文字本身。',
    },
    {
      className: 'xs:bottom-1/8 lg:bottom-1/6 left-1/2 -translate-x-1/2',
      size: '66/38',
      align: 'center',
      at: { s: 17, base: -160, mobile: -100 },
      to: { s: 17, base: -70, mobile: -100 },
      out: { s: 17, base: 40, mobile: 20 },
      gone: { s: 17, base: 120, mobile: 20 },
      text: `它让一点[[火花]]
{line lg-only dark w=700 y=-1 x=-8%}\\
{span "inline-block lg:-translate-y-2"}燃成[[燎原之火]]。{/span}
{line dark w=600/250 xs-y=-4 lg-y=-10 xs-x=10% lg-x=-5%}`,
    },
    {
      className: 'lg:bottom-1/10 xs:bottom-1/9 left-1/2 -translate-x-1/2',
      size: '66/38',
      align: 'center',
      pClass: 'xs:w-[100vw] lg:w-auto xs:px-0 lg:px-0',
      at: { s: 17, base: 110, mobile: 20 },
      to: { s: 17, base: 210, mobile: 20 },
      out: { s: 17, base: 300 },
      gone: { s: 17, base: 400 },
      text: `叙事，是你所见、所闻、所感，
{line lg-only dark w=900 y=-6 x=-8%}\\
也是你[[亲手参与]]的一切。
{line dark w=800/250 lg-y=-6 xs-x=25% lg-x=-5%}`,
    },
  ],

  // ==================================================================
  // 按行动画的白字：一个提问 + 四张方法卡 + 一句收束
  // ==================================================================
  lines: [
    {
      className: 'xs:top-1/9 2xl:top-1/8 xl:top-1/17 left-1/2 xs:w-full lg:w-auto '
        + '-translate-x-1/2 -translate-y-2/2',
      size: '26/18',
      align: 'center',
      at: { s: 10, base: 150 },
      to: { s: 10, base: 250 },
      out: { s: 11, base: 220, short: -40 },
      gone: { s: 11, base: 420, short: -40 },
      text: `{icon feather block mb=56/20}\\
{span "inline-block xs:mb-8 lg:mb-0"}怎样才能让故事，真正活在{/span}
{sz 66/38}体验的[[核心]]？{/sz}{br}`,
    },
    {
      className: 'bottom-0 xs:pl-20 lg:pl-0 lg:right-1/10 w-410',
      size: '26/18',
      align: 'left',
      gradientDir: 'right',
      toTop: 120,
      at: { s: 11, base: 160 },
      to: { s: 11, base: 210 },
      out: { s: 11, base: 160 },
      gone: { s: 11, base: 360 },
      text: `{sz 38/26}从[[清晰]]开始{/sz}
{line dark my=20/10 w=600/300 x=-30%}\\
{g}先想清楚，你到底要说什么。{/g}
{g}无论是发布一款新产品，{/g}
{g}还是建立情感连接，{/g}
{g}目标都必须足够明确。{/g}`,
    },
    {
      className: 'bottom-0 xs:pr-40 lg:pr-0 xs:right-0 lg:left-1/10 w-410',
      size: '26/18',
      align: 'right',
      gradientDir: 'left',
      toTop: 120,
      at: { s: 11, base: 230 },
      to: { s: 11, base: 280 },
      out: { s: 11, base: 230 },
      gone: { s: 11, base: 430 },
      text: `{sz 38/26}让故事[[引领]]设计{/sz}
{line dark my=20/10 w=500/260 x=-5%}\\
{g}每一次动效、每一次交互、{/g}
{g}每一个画面，都该为叙事服务。{/g}
{g}如果它无助于讲好故事，{/g}
{g}那就不需要它。{/g}`,
    },
    {
      className: 'bottom-0 xs:pl-20 lg:pl-0 lg:right-1/10 w-410',
      size: '26/18',
      align: 'left',
      gradientDir: 'right',
      toTop: 120,
      at: { s: 11, base: 300 },
      to: { s: 11, base: 350 },
      out: { s: 11, base: 300 },
      gone: { s: 11, base: 500 },
      text: `{sz 38/26}[[试验]]，然后迭代{/sz}
{line dark my=20/10 w=550/280 x=-30%}\\
{g}很多最好的想法，都来自{/g}
{g}先动手做出来，看看哪里成立，{/g}
{g}再从那里继续打磨。{/g}`,
    },
    {
      className: 'bottom-0 xs:pr-40 lg:pr-0 xs:right-0 lg:left-1/10 w-410',
      size: '26/18',
      align: 'right',
      gradientDir: 'left',
      toTop: 120,
      at: { s: 11, base: 370 },
      to: { s: 11, base: 420 },
      out: { s: 11, base: 370 },
      gone: { s: 11, base: 570 },
      text: `{sz 38/26}让体验[[因人而异]]{/sz}
{line dark my=20/10 w=600/300 x=-15%}\\
{g}最好的故事会建立情感连接。{/g}
{g}无论是借助 AI 个性化，{/g}
{g}还是定制化的设计细节，{/g}
{g}都要让每个人的体验{/g}
{g}都独一无二。{/g}`,
    },
    {
      className: 'top-1/8 left-1/2 -translate-x-1/2 xs:w-full lg:w-auto',
      size: '66/38',
      align: 'center',
      at: { s: 15, base: 40 },
      to: { s: 15, base: 130 },
      out: { s: 15, base: 225, mobile: -50, tablet: -70 },
      gone: { s: 15, base: 430, mobile: -10, tablet: -70 },
      text: `在这里，[[故事]]
{span "inline-block lg:-translate-y-10"}成为体验{/span}`,
    },
  ],

  // ==================================================================
  // 7 个水晶项目卡
  // ------------------------------------------------------------------
  // 水晶数量、位置、模型都由预编译的 3D 场景决定，这里只能改文字和链接。
  // url 留空 = 不可点击；https:// 开头 = 新标签页打开。
  // 原站的 /cases/* 内页并没有被导出到这个静态克隆里，所以一律指向官网。
  // ==================================================================
  cases: [
    {
      title: 'Coinbase & Warriors',
      subtitle: '品牌活动体验',
      side: 'left',
      url: 'https://noomoagency.com/work/microsite-golden-state-warriors-and-coinbase-collectible',
    },
    {
      title: 'Salesforce',
      subtitle: 'Agentforce360 官网',
      side: 'right',
      url: 'https://noomoagency.com/work/enterprise-3d-platform-website-salesforce',
    },
    {
      title: 'Intel | ai.io',
      subtitle: '展台互动体验',
      side: 'left',
      url: 'https://noomoagency.com/work/creating-immersive-activation-ai-experience-for-intel-booth',
    },
    {
      // 原克隆把合作方 Archrival 误写成了 Archival，这里改回来
      title: 'Vogue Business | Archrival',
      subtitle: '编辑型内容网站',
      side: 'right',
      url: 'https://noomoagency.com/work/vogue-business-gen-z-report-editorial-website',
    },
    {
      title: 'Noomo Labs',
      subtitle: '3D 官网',
      side: 'left',
      url: 'https://noomoagency.com/work/noomo-labs-the-jellyfish',
    },
    {
      title: 'Noomo Valentime',
      subtitle: '3D 叙事体验',
      side: 'right',
      url: 'https://valentime.noomoagency.com/',
    },
    {
      title: 'AMD',
      subtitle: '数字活动体验',
      side: 'left',
      url: 'https://noomoagency.com/work/amd-ai-factory-digital-event-experience',
    },
  ],
};
