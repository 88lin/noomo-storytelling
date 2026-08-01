'use strict';
/**
 * cssclasses.js — 把编译后的 CSS 里出现过的类名抽出来，用于构建时校验。
 *
 * 为什么必须做这件事
 * -------------------
 * `src/_nuxt/*.css` 是 Tailwind 编译产物：只有原站源码里真正用过的工具类才
 * 会被生成。写配置时随手加一个 `lg:translate-y-0`，如果原站没用过，这个类
 * 在 CSS 里根本不存在 —— 页面不会报错，只是排版悄悄不生效。
 *
 * 所以构建时会把生成的 HTML 里所有 class 收集起来，和 CSS 里存在的类名对
 * 照，报出不存在的那些。这类问题排查起来非常费时，交给构建来发现。
 */
const fs = require('fs');

// 运行时才出现 / 由 JS 添加的类，CSS 里不一定有对应规则，跳过。
const RUNTIME_CLASSES = new Set([
  'char', 'word', 'line', 'ic', 'from-scale', 'content',
  'ns-em', 'ns-em--on-dark', 'ns-em--on-light', 'ns-w', 'ns-t',
]);

/**
 * CSS 标识符的转义有两种，都要还原：
 *   `\:` `\/` `\!` `\[`  —— 单字符转义
 *   `\32 ` `\31 30`      —— 十六进制码点（1..6 位，后面可跟一个空白吃掉）
 * 第二种最容易踩坑：Tailwind 把 `2xl:top-1/8` 写成 `.\32xl\:top-1\/8`，
 * 按单字符转义还原会得到 `32xl:top-1/8`，于是一个真实存在的类被判成不存在。
 */
const IDENT_PART = String.raw`(?:\\[0-9a-fA-F]{1,6}[ \t\r\n]?|\\[^\n]|[A-Za-z0-9_\u00a0-\uffff-])`;

function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})[ \t\r\n]?|\\([^\n])/g,
    (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch));
}

/** CSS 里 `.foo`、`.lg\:w-10`、`.xs\:-translate-y-\[200\%\]` 都要还原成原始类名。 */
function loadClasses(files) {
  const set = new Set();
  const re = new RegExp(`\\.(${IDENT_PART}+)`, 'g');
  for (const f of files) {
    const css = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(css)) !== null) {
      // `.5rem`、`0.75s` 这类小数不是类名：真实类名若以数字开头，CSS 里必然
      // 是转义写法（`.\32xl…`），未转义的数字开头一律跳过。
      if (/^[0-9]/.test(m[1])) continue;
      set.add(unescapeIdent(m[1]));
    }
  }
  return set;
}

/** 收集一段 HTML 里所有 class="..." 中的类名。 */
function classesIn(html) {
  const out = new Set();
  const re = /class\s*=\s*(["'])(.*?)\1/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    for (const c of m[2].split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

/**
 * 原站预渲染 HTML 里就存在、但 CSS 里查不到的类名。
 * 前 7 个由 Vue Router / GSAP / 组件脚本在运行时使用，`text-sans-14` 则是
 * 原站自己写错的死类。这些出现在我们没有改动的上游标记里，不该报错；
 * 但**我们生成的**标记不享受这个豁免。
 */
const UPSTREAM_CLASSES = new Set([
  'close', 'gradient', 'home-page', 'parent',
  'router-link-active', 'router-link-exact-active', 'stagger-item',
  'text-sans-14',
]);

/**
 * @param {string} html
 * @param {Set<string>} known  CSS 里存在的类名
 * @param {Set<string>} [allow] 额外豁免（校验上游文件时传 UPSTREAM_CLASSES）
 * @returns {string[]} 排序后的「CSS 里查不到」的类名
 */
function unknownClasses(html, known, allow) {
  const bad = [];
  for (const c of classesIn(html)) {
    if (RUNTIME_CLASSES.has(c)) continue;
    if (allow && allow.has(c)) continue;
    // `!w-600` 这类 important 变体在 CSS 里就是 `.\!w-600`，loadClasses 已还原
    if (known.has(c)) continue;
    bad.push(c);
  }
  return bad.sort();
}

/** 给出「你是不是想写这个」的候选，按编辑距离粗排。 */
function suggest(name, known, limit = 3) {
  const d = (a, b) => {
    const m = a.length; const n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i += 1) {
      const cur = [i];
      for (let j = 1; j <= n; j += 1) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  };
  const base = name.replace(/^[a-z]+:/, '');
  return [...known]
    .map((k) => [Math.min(d(name, k), d(base, k.replace(/^[a-z]+:/, '')) + 1), k])
    .filter(([dist]) => dist <= Math.max(2, Math.round(name.length * 0.34)))
    .sort((a, b) => a[0] - b[0] || a[1].length - b[1].length)
    .slice(0, limit)
    .map(([, k]) => k);
}

module.exports = {
  loadClasses, classesIn, unknownClasses, suggest,
  RUNTIME_CLASSES, UPSTREAM_CLASSES,
};
