'use strict';
/**
 * story.js — locates the five story arrays inside the prebuilt page chunk and
 * replaces them with calls into a generated data module.
 *
 * Why not splice new array literals back in?  The arrays hold multi-kilobyte
 * template literals mixed with expressions over closure variables. Rewriting
 * them in place means regenerating minified code. Replacing each literal with
 * one function call keeps the patched bytes to a few dozen per array, so the
 * diff stays reviewable and the closure variables stay owned by the original
 * code.
 */
const fs = require('fs');
const S = require('./scanner');

const COMPONENTS = ['SmallTextNew', 'BigTextNew', 'LinesText', 'CaseHover'];

class StoryError extends Error {}

function fail(msg) {
  throw new StoryError(
    `${msg}\n  The prebuilt page chunk does not match what this template expects. ` +
    'If src/_nuxt was replaced with a different build, tools/story.js needs updating.');
}

/** Resolve the local alias each text component was assigned. */
function findComponentAliases(src) {
  const aliases = {};
  for (const comp of COMPONENTS) {
    const marker = `{__name:"HomeComponents${comp}"}`;
    const at = src.indexOf(marker);
    if (at < 0) fail(`component marker not found: ${marker}`);
    if (src.indexOf(marker, at + 1) >= 0) fail(`component marker appears twice: ${marker}`);
    const before = src.slice(Math.max(0, at - 400), at);
    const m = [...before.matchAll(/([A-Za-z_$][\w$]*)=Object\.assign\(/g)].pop();
    if (!m) fail(`cannot resolve local alias for ${comp}`);
    aliases[comp] = m[1];
  }
  return aliases;
}

/** Resolve the closure variable names AnimatedTexts uses for scroll maths. */
function findClosureVars(region) {
  const dev = /\{isRealTablet:([A-Za-z_$][\w$]*),isMobile:([A-Za-z_$][\w$]*)\}=/.exec(region);
  if (!dev) fail('cannot find the {isRealTablet, isMobile} destructuring');
  const sum = /([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)=>\{let [A-Za-z_$][\w$]*=0;for\(let /.exec(region);
  if (!sum) fail('cannot find the scroll-section sum helper');
  const ih = /([A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\(typeof window<"u"\?window\.innerHeight:0\)/.exec(region);
  if (!ih) fail('cannot find the window.innerHeight ref');
  return { tablet: dev[1], mobile: dev[2], sum: sum[1], innerHeight: ih[1] };
}

/**
 * Map each computed array variable to the component it feeds, by reading the
 * render function rather than trusting minified variable names.
 */
function findRenderBindings(region, aliases) {
  const byAlias = Object.fromEntries(Object.entries(aliases).map(([k, v]) => [v, k]));
  const bindings = [];
  const re = /U\((\w+)(\.value)?,\w+=>(?:\(S\(\),q|V)\((\w+),\{([^]{0,400}?)\}(?:,null,8|\),64)/g;
  let m;
  while ((m = re.exec(region))) {
    const comp = byAlias[m[3]];
    if (!comp) continue;
    bindings.push({
      variable: m[1],
      computed: Boolean(m[2]),
      component: comp,
      dark: /mode:"dark"/.test(m[4]),
      toTop: /toTop:/.test(m[4]),
    });
  }
  return bindings;
}

/** Kind name used in config/story.js for each render binding. */
function kindOf(b) {
  if (b.component === 'CaseHover') return 'cases';
  if (b.component === 'BigTextNew') return 'big';
  if (b.component === 'LinesText') return 'lines';
  return b.dark ? 'smallDark' : 'smallLight';
}

const EXPECTED_KINDS = {
  cases: 7, smallLight: 3, smallDark: 4, big: 4, lines: 6,
};

/**
 * Locate the five arrays. Returns
 *   { <kind>: { start, end, src, items, variable } }
 * with absolute offsets into the whole file.
 */
function locateStoryArrays(src) {
  const anchor = src.indexOf('__name:"AnimatedTexts"');
  if (anchor < 0) fail('AnimatedTexts component not found');
  const region = src.slice(anchor);

  const aliases = findComponentAliases(src);
  const vars = findClosureVars(region);
  const bindings = findRenderBindings(region, aliases);

  const kinds = bindings.map(kindOf);
  const missing = Object.keys(EXPECTED_KINDS).filter((k) => !kinds.includes(k));
  if (missing.length) fail(`render function is missing story arrays: ${missing.join(', ')}`);
  if (kinds.length !== 5) {
    fail(`expected 5 story arrays in the render function, found ${kinds.length}: ${kinds.join(', ')}`);
  }

  const out = {};
  for (const b of bindings) {
    const kind = kindOf(b);
    const decl = b.computed
      ? new RegExp(`\\b${b.variable}=G\\(\\(\\)=>\\[`)
      : new RegExp(`\\b${b.variable}=\\[\\{className:`);
    const m = decl.exec(region);
    if (!m) fail(`cannot find the declaration of story array "${b.variable}" (${kind})`);
    const bracket = region.indexOf('[', m.index);
    const end = S.matchBracket(region, bracket);
    out[kind] = {
      variable: b.variable,
      computed: b.computed,
      start: anchor + bracket,
      end: anchor + end,
      src: region.slice(bracket, end + 1),
      toTop: b.toTop,
    };
  }
  return { arrays: out, aliases, vars, anchor };
}

/** Parse the located arrays into plain objects (raw expression strings kept). */
function readStoryArrays(pageFile) {
  const src = fs.readFileSync(pageFile, 'utf8');
  const { arrays } = locateStoryArrays(src);
  const out = {};
  for (const [kind, a] of Object.entries(arrays)) {
    const elems = S.parseArrayLiteral(a.src);
    if (elems.length !== EXPECTED_KINDS[kind]) {
      fail(`story array "${kind}" has ${elems.length} entries, expected ${EXPECTED_KINDS[kind]}`);
    }
    out[kind] = {
      variable: a.variable,
      items: elems.map((e) => {
        const o = {};
        for (const [k, v] of S.parseObjectLiteral(e)) {
          o[k] = (k === 'text' || k === 'content') ? S.decodeTemplate(v)
            : (k === 'className' || k === 'id' || k === 'link' || k === 'mode')
              ? JSON.parse(v.replace(/^'(.*)'$/, '"$1"'))
              : v;
        }
        return o;
      }),
    };
  }
  return out;
}

/**
 * Replace the five array literals with calls into the generated data module,
 * and prepend the import. Returns the patched source.
 */
function injectStory(src, { dataModule = './story.data.js' } = {}) {
  const { arrays, vars } = locateStoryArrays(src);
  const args = `${vars.sum},${vars.mobile},${vars.tablet},${vars.innerHeight}`;

  // Replace from the end so earlier offsets stay valid.
  const ordered = Object.entries(arrays).sort((a, b) => b[1].start - a[1].start);
  let out = src;
  for (const [kind, a] of ordered) {
    const call = kind === 'cases'
      ? '__nsCases(__nsData.cases)'
      : `__nsBlocks(__nsData.${kind},${args})`;
    out = out.slice(0, a.start) + call + out.slice(a.end + 1);
  }

  if (!out.startsWith('import{')) {
    fail('page chunk does not start with an import statement');
  }
  const imp = `import{data as __nsData,blocks as __nsBlocks,cases as __nsCases}from"${dataModule}";`;
  return imp + out;
}

/**
 * CaseHover 的点击处理原本是 `router.push(props.link)` —— 只能跳站内路由。
 * 这个静态克隆里站内路由全是死链（原站的 /cases/:slug chunk 根本没导出），
 * 模板把项目链接改成了可配置的外部地址，所以这里要让它分流：
 *
 *   http(s):// 开头 → window.open 新标签页
 *   留空         → 什么也不做（水晶不可点击，也不报错）
 *   其余（/xxx、#xxx）→ 仍然走 router.push
 *
 * 变量名从源码里读出来而不是写死，minify 后的名字换了也能对上。
 */
const RE_CASE_CLICK =
  /const ([A-Za-z_$][\w$]*)=\(\)=>\{([A-Za-z_$][\w$]*)\.isTransitionActive\|\|([A-Za-z_$][\w$]*)\.push\(([A-Za-z_$][\w$]*)\.link\)\}/;

function patchCaseLinks(src) {
  const m = RE_CASE_CLICK.exec(src);
  if (!m) fail('cannot find the CaseHover click handler (router.push(props.link))');
  if (RE_CASE_CLICK.exec(src.slice(m.index + m[0].length))) {
    fail('the CaseHover click handler pattern matches twice');
  }
  const [, fn, store, router, props] = m;
  const patched = `const ${fn}=()=>{if(${store}.isTransitionActive)return;`
    + `const __nsL=${props}.link;if(!__nsL)return;`
    + `/^https?:/i.test(__nsL)?window.open(__nsL,"_blank","noopener,noreferrer")`
    + `:${router}.push(__nsL)}`;
  return src.slice(0, m.index) + patched + src.slice(m.index + m[0].length);
}

module.exports = {
  locateStoryArrays, readStoryArrays, injectStory, patchCaseLinks, StoryError,
  EXPECTED_KINDS, kindOf,
};
