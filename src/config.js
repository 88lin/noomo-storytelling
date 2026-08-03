/**
 * ============================================================================
 *  Noomo Storytelling 克隆站 — 全局配置文件（中文版）
 * ============================================================================
 *
 *  📌 本文件是整个网站的唯一配置入口。
 *     修改此文件后刷新浏览器即可生效，无需深入 HTML 代码。
 *
 *  📖 目录
 *     1. site         — 网站基本信息（标题、描述、SEO）
 *     2. brand        — 品牌信息（名称、Logo）
 *     3. contact      — 联系方式（邮箱、联系页路径）
 *     4. social       — 社交媒体链接
 *     5. links        — 外部链接（公司官网、实验室）
 *     6. nav          — 导航菜单文字
 *     7. hero         — 首页 Hero 区域文案
 *     8. footer       — 页脚文案
 *     9. analytics    — Google Analytics 配置
 *    10. features     — 功能开关（音乐、音效、3D 质量、预加载）
 *    11. theme        — 主题颜色（实验性）
 *
 *  💡 提示：所有文本内容也可以直接在 index.html 中修改，
 *     但推荐通过本文件配置，便于维护和升级。
 * ============================================================================
 */

window.SITE_CONFIG = {

  // ==========================================================================
  //  1. 网站基本信息
  //  用于浏览器标签页标题、SEO 搜索引擎优化、社交媒体分享
  // ==========================================================================
  site: {
    /** 浏览器标签页显示的标题 */
    title: "Noomo | 数字叙事的力量",
    /** 网站描述（用于 SEO 和社交媒体分享卡片） */
    description: "一个沉浸式 3D 网站，探索数字叙事的原理 —— 通过 Noomo 为 Salesforce、AMD、Coinbase、Intel 和 Vogue 打造的真实项目。",
    /** 网站完整 URL（用于 Open Graph 社交分享） */
    url: "https://storytelling.noomoagency.com/",
    /** 社交分享时的预览图片路径 */
    ogImage: "./og_image.jpg",
    /** 浏览器标签页图标 */
    favicon: "./fav.png",
    /** 网站语言代码 */
    lang: "zh-CN",
  },

  // ==========================================================================
  //  2. 品牌信息
  //  控制网站 Logo 和品牌名称的显示
  // ==========================================================================
  brand: {
    /** 品牌名称（显示在 Logo 旁、版权信息等位置） */
    name: "Noomo",
    /** 主 Logo 图片路径（SVG 格式） */
    logo: "./images/svg/logo.svg",
    /** 备用 Logo（鼠标悬停时切换显示） */
    logoAlt: "./images/svg/logo2.svg",
    /** 简化版 Logo（移动端使用） */
    logoSimple: "./images/svg/logoSimple.svg",
  },

  // ==========================================================================
  //  3. 联系方式
  //  页脚显示的联系邮箱和联系页面链接
  // ==========================================================================
  contact: {
    /** 联系邮箱地址 */
    email: "hello@noomoagency.com",
    /** 联系页面路径（设为 null 则隐藏联系链接） */
    contactPagePath: "/contacts",
  },

  // ==========================================================================
  //  4. 社交媒体链接
  //  页脚显示的社交媒体图标/文字链接
  //  设为 null 则隐藏对应平台
  // ==========================================================================
  social: {
    /** X（原 Twitter）链接 */
    x: "https://x.com/noomoagency",
    /** Instagram 链接 */
    instagram: "https://www.instagram.com/noomoagency/",
    /** 领英（LinkedIn）链接 */
    linkedin: "https://www.linkedin.com/company/noomoagency",
  },

  // ==========================================================================
  //  5. 外部链接
  //  导航栏中的「公司」「实验室」等外部跳转链接
  // ==========================================================================
  links: {
    /** 公司官网链接 */
    agency: "https://noomoagency.com",
    /** 实验室（Labs）链接 */
    labs: "https://labs.noomoagency.com",
  },

  // ==========================================================================
  //  6. 导航菜单文字
  //  桌面端导航栏和移动端菜单中显示的文字
  // ==========================================================================
  nav: {
    /** 首页 */
    home: "首页",
    /** 公司 */
    agency: "公司",
    /** 实验室 */
    labs: "实验室",
    /** 联系我们 */
    contact: "联系我们",
    /** 菜单按钮文字（移动端） */
    menu: "菜单",
  },

  // ==========================================================================
  //  7. 首页 Hero 区域文案
  //  网站首屏的大标题和提示文字
  // ==========================================================================
  hero: {
    /** 标题第一行 */
    titleLine1: "数字",
    /** 标题第二行（较小字号） */
    titleLine2: "叙事",
    /** 标题第三行 */
    titleLine3: "的力量",
    /** 高亮大标题（使用特殊英文字体，建议保留英文或短中文） */
    titleHighlight: "storytelling",
    /** 桌面端滚动提示 */
    scrollHint: "滚动探索",
    /** 移动端点击提示 */
    mobileHint: "点击探索",
    /** CTA 按钮文字（3D 场景中的交互按钮） */
    ctaText: "释放灵感·像素之魂",
  },

  // ==========================================================================
  //  8. 页脚文案
  //  页脚显示的标语和版权信息
  // ==========================================================================
  footer: {
    /** 页脚标语 */
    tagline: "让我们以应有的方式，帮你讲述你的故事",
    /** 社交媒体平台显示名称 */
    socialX: "X",
    socialInstagram: "照片墙",
    socialLinkedin: "领英",
  },

  // ==========================================================================
  //  9. Google Analytics 配置
  //  ⚠️ 默认关闭以保护隐私。如需启用，设 enabled 为 true 并填入你的 GA ID
  // ==========================================================================
  analytics: {
    /** 是否启用 Google Analytics */
    enabled: false,
    /** Google Analytics ID（格式：G-XXXXXXXXXX） */
    googleAnalyticsId: "",
  },

  // ==========================================================================
  //  10. 功能开关
  //  控制网站各项交互功能的开启/关闭
  // ==========================================================================
  features: {
    /** 背景音乐（进入网站后自动播放） */
    backgroundMusic: true,
    /** 悬停音效（鼠标悬停时的交互音效） */
    hoverSounds: true,
    /**
     * 3D 场景渲染质量
     * @type {"high" | "medium" | "low"}
     * high   — 高质量（完整纹理和光照，适合高性能设备）
     * medium — 中等质量（平衡性能与画质）
     * low    — 低质量（降低纹理分辨率，适合低端设备）
     */
    sceneQuality: "high",
    /** 预加载动画（进入网站前的加载进度条） */
    preloader: true,
    /** 平滑滚动（Lenis 滚动库） */
    smoothScroll: true,
  },

  // ==========================================================================
  //  11. 主题颜色（实验性）
  //  ⚠️ 此功能为实验性功能，修改后可能需要调整 CSS 变量
  // ==========================================================================
  theme: {
    /** 品牌主色（玫瑰粉） */
    brandRose: "#eabdf6",
    /** 背景色 */
    background: "#0a0a0a",
    /** 文字颜色 */
    textPrimary: "#ffffff",
    /** 次要文字颜色 */
    textSecondary: "rgba(255, 255, 255, 0.7)",
  },
};


/**
 * ============================================================================
 *  自动应用配置（以下为内部实现，一般无需修改）
 * ============================================================================
 *
 *  此函数在页面加载后自动执行，将 SITE_CONFIG 中的值应用到 DOM 元素。
 *  如果你在 index.html 中直接修改了文本，这里的自动应用可能会覆盖你的修改。
 *  如需完全手动控制，可以删除此函数或注释掉特定行。
 * ============================================================================
 */
(function applyConfig() {
  const config = window.SITE_CONFIG;
  if (!config) return;

  // --- 应用网站标题和 SEO 描述 ---
  if (config.site?.title) {
    document.title = config.site.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && config.site.description) {
      metaDesc.setAttribute("content", config.site.description);
    }
    // 更新 Open Graph 标题和描述
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", config.site.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && config.site.description) {
      ogDesc.setAttribute("content", config.site.description);
    }
    // 更新 Twitter 卡片
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute("content", config.site.title);
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc && config.site.description) {
      twDesc.setAttribute("content", config.site.description);
    }
  }

  // --- 应用语言属性 ---
  if (config.site?.lang) {
    document.documentElement.setAttribute("lang", config.site.lang);
  }

  // --- 应用 Hero 区域文案 ---
  if (config.hero) {
    // 更新 h2 副标题（三行文字）
    const h2 = document.querySelector(".home-hero h2");
    if (h2) {
      h2.innerHTML = ` ${config.hero.titleLine1}<br>` +
        `<span class="xs:text-serif-26 lg:text-serif-66 font-300 xs:mt-10 lg:mt-0 lg:ml-60 xs:mr-0 lg:mr-15">` +
        `${config.hero.titleLine2}</span> ${config.hero.titleLine3} `;
    }
    // 更新 h1 主标题
    const h1 = document.querySelector(".home-hero h1");
    if (h1) {
      h1.textContent = config.hero.titleHighlight;
    }
    // 更新滚动提示
    if (config.hero.scrollHint) {
      const hints = document.querySelectorAll(".text-brand-black\\/70");
      hints.forEach((el) => {
        if (el.textContent.includes("探索")) {
          el.textContent = ` ${config.hero.scrollHint} `;
        }
      });
    }
  }

  // --- 应用页脚文案 ---
  if (config.footer?.tagline) {
    const footerP = document.querySelector("footer p.text-center");
    if (footerP) {
      footerP.textContent = ` ${config.footer.tagline} `;
    }
  }

  // --- 应用联系邮箱 ---
  if (config.contact?.email) {
    const emailLink = document.querySelector('footer a[href^="mailto:"]');
    if (emailLink) {
      emailLink.href = `mailto:${config.contact.email}`;
      emailLink.textContent = config.contact.email;
    }
  }

  // --- 应用社交媒体链接 ---
  if (config.social) {
    const linkMap = [
      { selector: 'a[href*="x.com/noomoagency"]', url: config.social.x },
      { selector: 'a[href*="instagram.com/noomoagency"]', url: config.social.instagram },
      { selector: 'a[href*="linkedin.com/company/noomoagency"]', url: config.social.linkedin },
    ];
    linkMap.forEach(({ selector, url }) => {
      if (url) {
        document.querySelectorAll(selector).forEach((el) => (el.href = url));
      }
    });
  }

  // --- 应用外部链接 ---
  if (config.links) {
    const extMap = [
      { selector: 'a[href*="noomoagency.com"]', url: config.links.agency },
      { selector: 'a[href*="labs.noomoagency.com"]', url: config.links.labs },
    ];
    extMap.forEach(({ selector, url }) => {
      if (url) {
        document.querySelectorAll(selector).forEach((el) => (el.href = url));
      }
    });
  }

  // --- 应用 CTA 按钮文字 ---
  if (config.hero?.ctaText) {
    const ctaLabel = document.querySelector(".release-spirit .label");
    if (ctaLabel) {
      ctaLabel.innerHTML = config.hero.ctaText
        .split("")
        .map((char) => {
          const isSpace = char === " ";
          return `<span class="letter" data-space="${isSpace}" data-v-843b322d>${isSpace ? " " : char}</span>`;
        })
        .join("");
    }
  }

  // --- 应用 Google Analytics 配置 ---
  if (config.analytics && window.__NUXT__?.config?.public?.gtag) {
    window.__NUXT__.config.public.gtag.enabled = config.analytics.enabled;
    if (config.analytics.googleAnalyticsId) {
      window.__NUXT__.config.public.gtag.id = config.analytics.googleAnalyticsId;
    }
  }

  // --- 应用 3D 场景质量 ---
  if (config.features?.sceneQuality) {
    window.__SITE_SCENE_QUALITY__ = config.features.sceneQuality;
  }

  // --- 应用主题颜色（实验性） ---
  if (config.theme) {
    const root = document.documentElement;
    if (config.theme.brandRose) {
      root.style.setProperty("--color-brand-rose-200", config.theme.brandRose);
    }
    if (config.theme.background) {
      root.style.setProperty("--color-black", config.theme.background);
    }
  }

  // 控制台输出配置加载完成信息
  console.log(
    "%c[配置] %c网站配置已加载完成 ✅",
    "color: #eabdf6; font-weight: bold;",
    "color: #888;"
  );
})();
