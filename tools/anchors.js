'use strict';
/**
 * anchors.js — the shell-string patch table.
 *
 * Every user-visible string outside the story blocks exists in up to three
 * places that must agree, or Vue hydration produces the half-English mess the
 * original clone shipped with:
 *
 *   html   — the prerendered first paint (index.html)
 *   page   — the page chunk's compiled render functions (FZFS71Nt.js)
 *   engine — the shell chunk: header, mobile menu, cursor (CbdjwYMp.js)
 *
 * Each anchor carries the exact original substring and how many times it must
 * occur. A count mismatch fails the build; silently skipping is what let the
 * old config.js look like it worked while doing nothing.
 */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** JSON-quote for embedding into the JS bundles. */
const q = (s) => JSON.stringify(String(s));

/** Split a CTA string into the per-letter spans the prerendered HTML uses. */
function ctaSpans(text) {
  return [...text].map((ch) => {
    const space = ch === ' ';
    return `<span class="letter" data-space="${space}" data-v-843b322d>${space ? '&nbsp;' : esc(ch)}</span>`;
  }).join('');
}

function buildAnchors(cfg) {
  const { meta, brand, nav, social, contact, hero, cursor, footer, errorPage } = cfg;
  const A = [];
  const add = (key, file, find, replace, expect = 1) =>
    A.push({ key, file, find, replace, expect });

  // ---------------------------------------------------------------- metadata
  add('meta.lang', 'html', '<html  lang="en">', `<html  lang="${esc(meta.lang)}">`);
  // 原克隆站往 index.html 里塞了一个运行时 config.js（在页面已经注水之后再去
  // 改 DOM，所以基本没生效）。模板改成构建期烤进产物，这个脚本连同它的 404
  // 一起去掉。
  add('legacy.configScript', 'html', '<script src="./config.js"></script>\n', '');
  add('meta.title', 'html',
    '<title>Noomo | 数字叙事的力量</title>', `<title>${esc(meta.title)}</title>`);
  add('meta.title.unhead', 'html',
    '{"title":"Noomo | 数字叙事的力量"}', JSON.stringify({ title: meta.title }));
  for (const [k, orig] of [
    ['description', '<meta name="description" content='],
    ['og:description', '<meta name="og:description" property="og:description" content='],
    ['twitter:description', '<meta name="twitter:description" content='],
  ]) {
    add(`meta.${k}`, 'html',
      `${orig}"一个沉浸式 3D 网站，探索数字叙事的原理 —— 通过 Noomo 为 Salesforce、AMD、Coinbase、Intel 和 Vogue 打造的真实项目。">`,
      `${orig}"${esc(meta.description)}">`);
  }
  add('meta.og:title', 'html',
    '<meta name="og:title" property="og:title" content="Noomo | 数字叙事的力量">',
    `<meta name="og:title" property="og:title" content="${esc(meta.title)}">`);
  add('meta.twitter:title', 'html',
    '<meta name="twitter:title" content="Noomo | 数字叙事的力量">',
    `<meta name="twitter:title" content="${esc(meta.title)}">`);
  add('meta.og:url', 'html',
    'content="https://storytelling.noomoagency.com/"', `content="${esc(meta.url)}"`);
  add('meta.ogImage', 'html', 'content="./og_image.jpg"', `content="./${meta.ogImage.out}"`, 2);
  add('meta.favicon', 'html',
    '<link rel="icon" type="image/png" href="./fav.png">',
    `<link rel="icon" type="image/png" href="./${meta.favicon.out}">`);
  // Nuxt 运行时把 app.baseURL 当作站点根：Vue Router 的 history base、app
  // manifest 的地址、publicAssetsURL() 生成的图标路径，全从这里读。上游把它
  // 烤死成 "/"，部署到 user.github.io/repo/ 就会连环出事：
  //   1. 路由 base 还是 "/"，当前地址 /repo/ 匹配不到任何路由，首页直接被
  //      渲染成 Nuxt 的错误组件 —— 肉眼看就是「打开啥都没有」；
  //   2. app manifest 去 /_nuxt/builds/meta/*.json 找 → 404；
  //   3. close.svg、fromError.svg 这些走 publicAssetsURL() 的图标去域名根
  //      找 → 404。
  // 三样在根路径预览时都不会暴露，只有真部署到子路径才炸，所以必须烤进去。
  add('meta.basePath', 'html', 'baseURL:"/"', `baseURL:${JSON.stringify(meta.basePath)}`);

  // ------------------------------------------------------------------- hero
  add('hero.headline', 'html',
    '> 数字<br><span class="xs:text-serif-26 lg:text-serif-66 font-300 xs:mt-10 lg:mt-0 lg:ml-60 xs:mr-0 lg:mr-15">叙事</span>的力量 <',
    `> ${esc(hero.headline.before)}<br><span class="xs:text-serif-26 lg:text-serif-66 font-300 `
    + `xs:mt-10 lg:mt-0 lg:ml-60 xs:mr-0 lg:mr-15">${esc(hero.headline.emphasis)}</span>`
    + `${esc(hero.headline.after)} <`);
  add('hero.headline', 'page',
    '[te(" The power",-1),d("br",null,null,-1),d("span",{class:"xs:text-serif-26 lg:text-serif-66 font-300 xs:mt-10 lg:mt-0 lg:ml-60 xs:mr-0 lg:mr-15"},"of",-1),te(" digital ",-1)]',
    `[te(${q(` ${hero.headline.before}`)},-1),d("br",null,null,-1),`
    + 'd("span",{class:"xs:text-serif-26 lg:text-serif-66 font-300 xs:mt-10 lg:mt-0 lg:ml-60 xs:mr-0 lg:mr-15"},'
    + `${q(hero.headline.emphasis)},-1),te(${q(`${hero.headline.after} `)},-1)]`);

  add('hero.title', 'html',
    '<h1 class="pointer-events-none">storytelling</h1>',
    `<h1 class="pointer-events-none">${esc(hero.title)}</h1>`);
  add('hero.title', 'page',
    'class:"pointer-events-none"},"storytelling",512)',
    `class:"pointer-events-none"},${q(hero.title)},512)`);

  add('hero.tapHint', 'html',
    '<span class="text-sans-18 text-brand-blue-500">点击探索</span>',
    `<span class="text-sans-18 text-brand-blue-500">${esc(hero.tapHint)}</span>`);
  add('hero.tapHint', 'page',
    'd("span",{class:"text-sans-18 text-brand-blue-500"},"Tap to explore")',
    `d("span",{class:"text-sans-18 text-brand-blue-500"},${q(hero.tapHint)})`);

  add('hero.scrollHint', 'html',
    '<span class="text-sans-14 lg:text-sans-18 text-brand-black/70"> 滚动探索 </span>',
    `<span class="text-sans-14 lg:text-sans-18 text-brand-black/70"> ${esc(hero.scrollHint)} </span>`);
  add('hero.scrollHint', 'page',
    'd("span",{class:"text-sans-14 lg:text-sans-18 text-brand-black/70"}," Scroll to explore ",-1)',
    `d("span",{class:"text-sans-14 lg:text-sans-18 text-brand-black/70"},${q(` ${hero.scrollHint} `)},-1)`);

  // CTA pill: label lives in one const, and the pill width was sized for the
  // original English label, so it travels with the text.
  add('hero.cta.label', 'page', 'oe="Reimagine Phoenix"', `oe=${q(hero.cta.label)}`);
  add('hero.cta.label', 'html', ctaSpans('释放灵感·像素之魂'), ctaSpans(hero.cta.label));
  // The compiled CSS only ships a fixed set of `w-*` utilities, so an arbitrary
  // label length cannot reuse them. `--spacing` is 1px here (`html{font-size:10px}`,
  // `--spacing:.1rem`), so `w-220` === `width:220px` and an inline override is exact.
  const PILL = 'wrapper w-220 relative h-46 flex pl-22 pr-20 items-center justify-between bg-white/25 rounded-full';
  add('hero.cta.width', 'page', `{class:"${PILL}"}`,
    `{class:"${PILL}",style:"width:${hero.cta.width}px"}`);
  add('hero.cta.width', 'html', `class="${PILL}" data-v-843b322d>`,
    `class="${PILL}" style="width:${hero.cta.width}px" data-v-843b322d>`);

  // ----------------------------------------------------------------- cursor
  add('cursor.case', 'page', 'default:"Click to view"', `default:${q(cursor.case)}`);
  add('cursor.start', 'page', 'setCursorText("Click to start")', `setCursorText(${q(cursor.start)})`);
  add('cursor.start', 'engine', '"Click to start"', q(cursor.start), 4);

  // ----------------------------------------------------------------- footer
  add('footer.tagline', 'html',
    '> 让我们以应有的方式，帮你讲述你的故事 <', `> ${esc(footer.tagline)} <`);
  add('footer.tagline', 'page',
    '" Let us help you tell your story the way it was meant "', q(` ${footer.tagline} `));

  add('contact.email', 'html',
    '<a class="text-white xs:text-sans-30 lg:text-sans-66" href="mailto:hello@noomoagency.com">hello@noomoagency.com</a>',
    `<a class="text-white xs:text-sans-30 lg:text-sans-66" href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`);
  add('contact.email', 'page',
    'class:"text-white xs:text-sans-30 lg:text-sans-66",href:"mailto:hello@noomoagency.com"},"hello@noomoagency.com",32)',
    `class:"text-white xs:text-sans-30 lg:text-sans-66",href:"mailto:${contact.email}"},${q(contact.email)},32)`);

  // Footer social row (page chunk + prerendered html)
  const S0 = social[0]; const S1 = social[1]; const S2 = social[2];
  add('social.0', 'html',
    '<a target="_blank" href="https://x.com/noomoagency" class="text-sans-18 text-white">x</a>',
    `<a target="_blank" href="${esc(S0.url)}" class="text-sans-18 text-white">${esc(S0.label)}</a>`);
  add('social.1', 'html',
    '<a target="_blank" href="https://www.instagram.com/noomoagency/" class="text-sans-18 text-white">照片墙</a>',
    `<a target="_blank" href="${esc(S1.url)}" class="text-sans-18 text-white">${esc(S1.label)}</a>`);
  add('social.2', 'html',
    '<a target="_blank" href="https://www.linkedin.com/company/noomoagency" class="text-sans-18 text-white">领英</a>',
    `<a target="_blank" href="${esc(S2.url)}" class="text-sans-18 text-white">${esc(S2.label)}</a>`);
  add('social.0', 'page',
    'target:"_blank",href:"https://x.com/noomoagency",class:"text-sans-18 text-white"},"x",32)',
    `target:"_blank",href:${q(S0.url)},class:"text-sans-18 text-white"},${q(S0.label)},32)`);
  add('social.1', 'page',
    'target:"_blank",href:"https://www.instagram.com/noomoagency/",class:"text-sans-18 text-white"},"Instagram",32)',
    `target:"_blank",href:${q(S1.url)},class:"text-sans-18 text-white"},${q(S1.label)},32)`);
  add('social.2', 'page',
    'target:"_blank",href:"https://www.linkedin.com/company/noomoagency",class:"text-sans-18 text-white"},"LinkedIn",32)',
    `target:"_blank",href:${q(S2.url)},class:"text-sans-18 text-white"},${q(S2.label)},32)`);

  // Mobile-menu + error-page social row (engine chunk, two compiled copies).
  //
  // The two copies differ in one inert way — the compiler's patch-flag argument,
  // `,-1)` in the mobile menu and `,32)` on the error page — and in one real
  // way: upstream typed "Linkedin" in the menu but "LinkedIn" on the error page.
  //
  // Matching on the label alone is not safe. Rewriting the menu's "Linkedin" to
  // the configured "LinkedIn" would make the two copies identical, and the next
  // anchor would then find two hits where it expects one. Including the trailing
  // flag keeps every anchor unique no matter what the config says.
  const MENU_CLS = 'class:"text-sans-18 text-white opacity-61"';
  const menuRow = [
    ['social.1.menu', 'https://www.instagram.com/noomoagency/', 'Instagram', 1, '-1)'],
    ['social.1.error', 'https://www.instagram.com/noomoagency/', 'Instagram', 1, '32)'],
    ['social.0.menu', 'https://x.com/noomoagency', 'x', 0, '-1)'],
    ['social.0.error', 'https://x.com/noomoagency', 'x', 0, '32)'],
    ['social.2.menu', 'https://www.linkedin.com/company/noomoagency', 'Linkedin', 2, '-1)'],
    ['social.2.error', 'https://www.linkedin.com/company/noomoagency', 'LinkedIn', 2, '32)'],
  ];
  for (const [key, url, label, cfgIdx, tail] of menuRow) {
    add(key, 'engine',
      `href:"${url}",${MENU_CLS}},"${label}",${tail}`,
      `href:${q(social[cfgIdx].url)},${MENU_CLS}},${q(social[cfgIdx].label)},${tail}`);
  }
  add('social.1.menu', 'html',
    '<a target="_blank" href="https://www.instagram.com/noomoagency/" class="text-sans-18 text-white opacity-61" data-v-89305177>照片墙</a>',
    `<a target="_blank" href="${esc(S1.url)}" class="text-sans-18 text-white opacity-61" data-v-89305177>${esc(S1.label)}</a>`);
  add('social.0.menu', 'html',
    '<a target="_blank" href="https://x.com/noomoagency" class="text-sans-18 text-white opacity-61" data-v-89305177>x</a>',
    `<a target="_blank" href="${esc(S0.url)}" class="text-sans-18 text-white opacity-61" data-v-89305177>${esc(S0.label)}</a>`);
  add('social.2.menu', 'html',
    '<a target="_blank" href="https://www.linkedin.com/company/noomoagency" class="text-sans-18 text-white opacity-61" data-v-89305177>领英</a>',
    `<a target="_blank" href="${esc(S2.url)}" class="text-sans-18 text-white opacity-61" data-v-89305177>${esc(S2.label)}</a>`);

  // -------------------------------------------------------------------- nav
  // Desktop header buttons (engine chunk) + prerendered html
  add('nav.agency', 'engine',
    'link:"https://noomoagency.com",text:"Agency"',
    `link:${q(nav.agency.url)},text:${q(nav.agency.label)}`);
  add('nav.labs', 'engine',
    'link:"https://labs.noomoagency.com",text:"Labs",type:"full-rounded"',
    `link:${q(nav.labs.url)},text:${q(nav.labs.label)},type:"full-rounded"`);
  add('nav.contact', 'engine',
    'text:"Contact",link:"/contacts",type:"none-rounded"',
    `text:${q(nav.contact.label)},link:${q(nav.contact.url)},type:"none-rounded"`);

  add('nav.agency', 'html',
    '<a href="https://noomoagency.com" rel="noopener noreferrer" target="_blank" class="simple-button relative text-sans-18 text-brand-black px-8 h-24 flex transition-all duration-300 ease-in-out items-center justify-center cursor-pointer medium-rounded" data-v-866aa93c data-v-3018309f>公司',
    `<a href="${esc(nav.agency.url)}" rel="noopener noreferrer" target="_blank" class="simple-button relative text-sans-18 text-brand-black px-8 h-24 flex transition-all duration-300 ease-in-out items-center justify-center cursor-pointer medium-rounded" data-v-866aa93c data-v-3018309f>${esc(nav.agency.label)}`);
  add('nav.labs', 'html',
    '<a href="https://labs.noomoagency.com" rel="noopener noreferrer" target="_blank" class="simple-button relative text-sans-18 text-brand-black px-8 h-24 flex transition-all duration-300 ease-in-out items-center justify-center cursor-pointer full-rounded" data-v-866aa93c data-v-3018309f>实验室',
    `<a href="${esc(nav.labs.url)}" rel="noopener noreferrer" target="_blank" class="simple-button relative text-sans-18 text-brand-black px-8 h-24 flex transition-all duration-300 ease-in-out items-center justify-center cursor-pointer full-rounded" data-v-866aa93c data-v-3018309f>${esc(nav.labs.label)}`);
  add('nav.contact', 'html',
    '<a href="/contacts" class="simple-button relative text-sans-18 text-brand-black px-8 h-24 flex transition-all duration-300 ease-in-out items-center justify-center cursor-pointer none-rounded" data-v-866aa93c data-v-3018309f>联系我们',
    `<a href="${esc(nav.contact.url)}"${nav.contact.external ? ' rel="noopener noreferrer" target="_blank"' : ''} class="simple-button relative text-sans-18 text-brand-black px-8 h-24 flex transition-all duration-300 ease-in-out items-center justify-center cursor-pointer none-rounded" data-v-866aa93c data-v-3018309f>${esc(nav.contact.label)}`);

  // Mobile menu links (engine chunk)
  add('nav.home', 'engine', '[Al("Home",-1)]', `[Al(${q(nav.home.label)},-1)]`);
  add('nav.agency.menu', 'engine',
    'to:"https://noomoagency.com",class:Vt(["text-sans-30 text-white',
    `to:${q(nav.agency.url)},class:Vt(["text-sans-30 text-white`);
  add('nav.agency.menu', 'engine', '[Al("Agency",-1)]', `[Al(${q(nav.agency.label)},-1)]`);
  add('nav.labs.menu', 'engine',
    'to:"https://labs.noomoagency.com",class:Vt(["text-sans-30 text-white',
    `to:${q(nav.labs.url)},class:Vt(["text-sans-30 text-white`);
  add('nav.labs.menu', 'engine', '[Al("Labs",-1)]', `[Al(${q(nav.labs.label)},-1)]`);
  add('nav.contact.menu', 'engine',
    'Le(e).mobileMenuOpen}]),to:"/contacts"},{default:$s(()=>[...r[3]||(r[3]=[Al("Contact",-1)])])',
    `Le(e).mobileMenuOpen}]),to:${q(nav.contact.url)}},{default:$s(()=>[...r[3]||(r[3]=[Al(${q(nav.contact.label)},-1)])])`);

  add('nav.home', 'html',
    '<a aria-current="page" href="./" class="router-link-active router-link-exact-active text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>首页</a>',
    `<a aria-current="page" href="./" class="router-link-active router-link-exact-active text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>${esc(nav.home.label)}</a>`);
  add('nav.agency.menu', 'html',
    '<a href="https://noomoagency.com" rel="noopener noreferrer" target="_blank" class="text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>公司</a>',
    `<a href="${esc(nav.agency.url)}" rel="noopener noreferrer" target="_blank" class="text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>${esc(nav.agency.label)}</a>`);
  add('nav.labs.menu', 'html',
    '<a href="https://labs.noomoagency.com" rel="noopener noreferrer" target="_blank" class="text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>实验室</a>',
    `<a href="${esc(nav.labs.url)}" rel="noopener noreferrer" target="_blank" class="text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>${esc(nav.labs.label)}</a>`);
  add('nav.contact.menu', 'html',
    '<a href="/contacts" class="text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>联系我们</a>',
    `<a href="${esc(nav.contact.url)}" class="text-sans-30 text-white opacity-0 transition-all duration-300 ease-in-out" data-v-89305177>${esc(nav.contact.label)}</a>`);
  add('nav.menuLabel', 'engine',
    'text-sans-18 transition-all duration-500 ease-in-out text-brand-black"])}," Menu ",2)',
    `text-sans-18 transition-all duration-500 ease-in-out text-brand-black"])},${q(` ${nav.menuLabel} `)},2)`);
  add('nav.menuLabel', 'html',
    '<p class="text-sans-18 transition-all duration-500 ease-in-out text-brand-black" data-v-9c7aa952> 菜单 </p>',
    `<p class="text-sans-18 transition-all duration-500 ease-in-out text-brand-black" data-v-9c7aa952> ${esc(nav.menuLabel)} </p>`);

  // ------------------------------------------------------------------ brand
  add('brand.logo', 'engine',
    'Vr("./images/svg/logo.svg")', `Vr("./${brand.logo.out}")`);
  add('brand.logoHover', 'engine',
    'Vr("./images/svg/logo2.svg")', `Vr("./${brand.logoHover.out}")`);
  add('brand.logoAlt', 'engine', 'alt:"Noomo Agency Logo"', `alt:${q(brand.logoAlt)}`, 2);
  add('brand.logo', 'html',
    'alt="Noomo 公司 Logo" src="./images/svg/logo.svg"',
    `alt="${esc(brand.logoAlt)}" src="./${brand.logo.out}"`);
  add('brand.logoHover', 'html',
    'alt="Noomo 公司 Logo" src="./images/svg/logo2.svg"',
    `alt="${esc(brand.logoAlt)}" src="./${brand.logoHover.out}"`);
  add('brand.logoSimple', 'html',
    'alt="noomo logo" src="./images/svg/logoSimple.svg"',
    `alt="${esc(brand.logoAlt)}" src="./${brand.logoSimple.out}"`, 2);

  // -------------------------------------------------------------- 404 page
  // Lives only in the engine chunk (there is no prerendered error page), and
  // it is very reachable: every route except `/` is dead in this export, so a
  // stray link or a refresh on a sub-path lands here.
  add('error.message', 'engine',
    'We("p",{class:"text-sans-26 text-white mt-500"}," Don\u2019t feel lost, let\u2019s go Home ",-1)',
    `We("p",{class:"text-sans-26 text-white mt-500"},${q(` ${errorPage.message} `)},-1)`);
  add('error.rights', 'engine',
    'We("p",{class:"text-sans-18 text-white opacity-61"}," \u00a9 All rights reserved ")',
    `We("p",{class:"text-sans-18 text-white opacity-61"},${q(` ${errorPage.rights} `)})`);
  // Upstream hardcodes the domain root, which is wrong for any project-page
  // deploy (user.github.io/repo/ would send the visitor to user.github.io/).
  add('error.homeUrl', 'engine',
    'window.location.assign("/")', `window.location.assign(${q(errorPage.homeUrl)})`);
  add('error.backAlt', 'engine', 'alt:"back"', `alt:${q(errorPage.backAlt)}`);

  return A;
}

module.exports = { buildAnchors, ctaSpans, esc };
