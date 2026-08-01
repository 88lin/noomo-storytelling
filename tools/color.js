'use strict';
/**
 * color.js — 颜色小工具，零依赖。
 *
 * 三个消费方各有各的需求，但共用同一套解析与校验：
 *   theme.js     强调色（允许任意 CSS 颜色写法）
 *   menu.js      菜单背景（需要把 #RRGGBB 拆成 rgba(...) 才能做透明渐变）
 *   crystals.js  水晶配色（需要 #RRGGBB → 十进制整数喂给 THREE.Color）
 *
 * 关于 `rgba(r,g,b,0)` 而不是 `transparent`
 * ----------------------------------------
 * 渐变里写 `transparent` 等价于 `rgba(0,0,0,0)`，浏览器在预乘色彩空间之外
 * 插值时会掺进黑色，光斑边缘会出现一圈脏灰。所以所有径向光斑的收尾都用
 * 同色零透明度，这是渐变里的常识性写法，但很容易被忽略。
 */

/** 严格的 6 位十六进制 —— 配置面只接受这一种写法，避免歧义。 */
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

function isHex6(v) {
  return typeof v === 'string' && HEX6_RE.test(v.trim());
}

/** '#88aeff' → [136,174,255] */
function hexToRgb(hex) {
  const h = hex.trim().slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** [136,174,255] → '#88aeff'（分量先夹到 0..255 并取整） */
function rgbToHex(rgb) {
  return `#${rgb.map((v) => {
    const n = Math.max(0, Math.min(255, Math.round(v)));
    return n.toString(16).padStart(2, '0');
  }).join('')}`;
}

/** '#88aeff' → 8957695，喂给 `new Re(...)`（Re 就是 THREE.Color）。 */
function hexToInt(hex) {
  return parseInt(hex.trim().slice(1), 16);
}

/** 8957695 → '#88aeff'，用来把上游的十进制字面量读回可读形式。 */
function intToHex(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

/**
 * '#4edbef' + .28 → 'rgba(78,219,239,.28)'
 * 透明度按 CSS 习惯省掉前导 0，能省几十字节。
 */
function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  const a = String(Math.max(0, Math.min(1, alpha)))
    .replace(/^0\./, '.')
    .replace(/^1$/, '1');
  return `rgba(${r},${g},${b},${a})`;
}

/** 同色零透明度，用于渐变收尾（不要写 transparent，见文件头注释）。 */
function fade(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},0)`;
}

// --------------------------------------------------------------- HSL 互转
// 水晶配色需要「同色相、改明度/饱和度」地派生 peaks / fringe 色，
// 在 RGB 空间里做不到，所以要一组 HSL 互转。h ∈ [0,360)，s/l ∈ [0,1]。

function hexToHsl(hex) {
  const [r0, g0, b0] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r0) h = ((g0 - b0) / d) % 6;
  else if (max === g0) h = (b0 - r0) / d + 2;
  else h = (r0 - g0) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const seg = Math.floor(hh / 60) % 6;
  const rgb = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  return rgbToHex(rgb.map((v) => (v + m) * 255));
}

// ------------------------------------------------------------- 对比度计算
// WCAG 2.1 相对亮度。菜单的白字压在深底上，构建时算一遍对比度能挡住
// 「换了个浅色预设结果字看不清」这类回归 —— e2e 里也会再采样验证一次。

function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度，1..21。 */
function contrast(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 把前景色按 alpha 合成到背景色上，得到实际显示的颜色。 */
function over(fg, bg, alpha) {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)));
}

/** 线性插值，t=0 取 a，t=1 取 b。 */
function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

module.exports = {
  HEX6_RE,
  isHex6,
  hexToRgb,
  rgbToHex,
  hexToInt,
  intToHex,
  rgba,
  fade,
  hexToHsl,
  hslToHex,
  relLuminance,
  contrast,
  over,
  mix,
};
