#!/usr/bin/env python3
"""端到端验收测试（可选，构建本身不需要它）

构建脚本是零依赖的纯 Node；但「注水之后中文还在不在」这件事只有真浏览器能
回答 —— 原始克隆站的中文正是在注水那一刻被换回英文的。所以这份测试单独用
Python + Playwright 跑，不进 package.json 的依赖。

    pip install playwright && playwright install chromium
    npm run build
    python3 tools/test/e2e.py

覆盖的验收项：
    1  外壳文案注水后仍与 config/site.js 一致（不回退成英文）
    2  17 个文字块 + 7 个项目热区渲染出配置里的中文
    3  外部项目链接走新标签页，不触发前端路由；留空的不可点击
    4  子路径部署（/sub/）下没有 404
    5  加载页：SSR 首帧就有骨架、百分比从 0 单调涨到 100、揭幕后节点离开 DOM
    6  移动端菜单：打开后真有背景，实拍像素上白字对比度 ≥ 4.5:1
    7  水晶：构建产物里 crystalHovers 恰好 7 组、色相拉得开
    8  控制台无报错、无注水不匹配警告

只有 1–4 是「原样克隆」时代就有的；5–8 是三项视觉改版之后补的。

⚠ 沙箱/无 GPU 环境下 WebGL 走 SwiftShader，帧率个位数，水晶所在的滚动区
根本进不去（引擎写进 store 的 getIceCubePositionByIndex 恒为 0）。所以这里
只做「参数正确」的静态校验，**不做**水晶的渲染断言 —— 观感必须真机验收。
"""
import base64
import functools
import http.server
import json
import re
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
PORT = 8131
# 挂在 config/site.js 里配置的部署子路径下，顺带验收「部署到 Pages 子目录」。
# BASE 在 main() 里按配置覆盖。
BASE = "/sub/"

LAUNCH_ARGS = [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
]

# 揭幕由引擎「场景就绪」驱动。软件渲染下这一步能拖到 40 秒开外，给足余量。
REVEAL_TIMEOUT = 150_000

failures: list[str] = []
checks = 0


def check(ok: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if ok:
        print(f"  ok   {label}")
    else:
        failures.append(f"{label}{chr(10) + '        ' + detail if detail else ''}")
        print(f"  FAIL {label}")
        if detail:
            print(f"        {detail}")


# --------------------------------------------------------------- 静态服务器
class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):  # noqa: D102
        path = path.split("?")[0]
        if BASE != "/" and not path.startswith(BASE):
            # 早先这里对 BASE 之外的请求也照常从 dist/ 根发文件，等于把整个站点
            # 同时挂在 / 和 /sub/ 两处 —— 结果是任何漏掉 basePath 的绝对链接
            # (/_nuxt/builds/meta/*.json、publicAssetsURL() 出来的图标) 在本地
            # 都是 200，一上 GitHub Pages 才 404。GitHub Pages 的域名根不属于
            # 这个仓库，所以这里也必须让它 404。
            return str(DIST / "__outside_base__")
        if path.startswith(BASE):
            path = "/" + path[len(BASE):]
        return super().translate_path(path)

    def log_message(self, *_):  # 静音
        pass


def load_config(name: str) -> dict:
    """用 node 把 config/*.js 导出成 JSON，避免在 Python 里重实现 CommonJS。"""
    out = subprocess.run(
        ["node", "-e",
         f'process.stdout.write(JSON.stringify(require({str(ROOT / "config" / name)!r})))'],
        capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def story_texts() -> dict:
    """从构建产物里取回每个块的纯文本，用来和 DOM 对照。"""
    src = (DIST / "_nuxt" / "story.data.js").read_text(encoding="utf8")
    m = re.search(r"export const data = (.*?);\n", src, re.S)
    data = json.loads(m.group(1))
    strip = lambda h: re.sub(r"\s+", "", re.sub(r"<[^>]*>", "", h))  # noqa: E731
    return {k: [strip(i["html"]) for i in v] for k, v in data.items()}


# ------------------------------------------------------------------ 颜色工具
def _lin(c: float) -> float:
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = (_lin(x) for x in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b) -> float:
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def hue_of(rgb) -> float:
    r, g, b = (x / 255.0 for x in rgb[:3])
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return 0.0
    d = mx - mn
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60.0


def hue_gap(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def balanced(src: str, start: int, open_ch: str, close_ch: str) -> str:
    """从 start 处的括号开始，切出配平的一段字面量。"""
    depth = 0
    for i in range(start, len(src)):
        if src[i] == open_ch:
            depth += 1
        elif src[i] == close_ch:
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
    return ""


# ------------------------------------------------------- 静态产物检查（无浏览器）
def static_checks() -> None:
    """有些事实在产物文本里就能判死，不必等浏览器 —— 也更容易定位。"""
    print("\n[构建产物]")
    html = (DIST / "index.html").read_text(encoding="utf8")
    engine = (DIST / "_nuxt" / "CbdjwYMp.js").read_text(encoding="utf8")

    # ---- 加载页：SSR 骨架必须已经在首帧的 HTML 里
    m = re.search(r'<div class="wrapper ns-pre"[^>]*>', html)
    check(bool(m), "SSR 首帧就带 .wrapper.ns-pre 骨架")
    if m:
        frag = balanced_div(html, m.start())
        check("data-v-724e2fc4" in m.group(0),
              "加载页根节点带上游 scope（否则注水时 class 不会重打）")
        kids = re.findall(r'<(div|p|span|img)\s[^>]*class="(ns-pre-[a-z]+)"', frag)
        names = [c for _, c in kids]
        check("ns-pre-num" in names and "ns-pre-bar" in names,
              "百分比与进度条节点都在", str(names))
        check(not re.search(r">\s+<", frag),
              "SSR 标记里没有标签间空白（Vue 会把它当成多余文本节点）")
        check(re.search(r'class="ns-pre-val"[^>]*>0<', frag) is not None,
              "百分比初值是 0")
    # ---- 子路径部署：Nuxt 运行时的 app.baseURL 必须等于 basePath
    # Vue Router 的 history base、app manifest 地址、publicAssetsURL() 都读它。
    # 留在上游的 "/" 上，站点部署到 user.github.io/repo/ 会匹配不到路由，首页
    # 直接渲染成错误组件（肉眼就是一片空白）。
    base_urls = re.findall(r'baseURL:"([^"]*)"', html)
    check(len(base_urls) == 1, "首帧 HTML 里 baseURL 恰好一处", str(base_urls))
    check(bool(base_urls) and base_urls[0] == BASE,
          "Nuxt 运行时 baseURL 等于部署子路径（否则路由 base 错，整页只剩错误组件）",
          f"实际 {base_urls[0]!r}  期望 {BASE!r}" if base_urls else "没找到")

    check("hideReadyPreloader" not in html,
          "克隆那段自己写的轮询卸载脚本已经拿掉")
    check("__nsPreBoot" in html,
          "引导脚本在（引擎包下载期间数字才不会卡在 0）")
    check(".remove()" not in html.split("__nsPreBoot")[-1][:4000],
          "兜底脚本只隐藏不摘节点（摘掉会让 Vue 往 null 父节点插）")

    # ---- 注入的主题样式
    style = html[html.index('<style id="ns-theme">'):]
    style = style[:style.index("</style>")]
    for frag_txt, label in [
        (".preloader.preloader{background:", "加载页背景被覆盖成品牌渐变"),
        (".mobile-menu.mobile-menu", "移动端菜单背景规则已注入"),
        (".ns-pre-bar", "进度条样式已注入"),
    ]:
        check(frag_txt in style, label)

    # ---- 水晶：只验参数，不验渲染
    check(engine.count("crystalHovers:[") == 1,
          "引擎里 crystalHovers 恰好一处",
          str(engine.count("crystalHovers:[")))
    lit = balanced(engine, engine.index("crystalHovers:[") + len("crystalHovers:"),
                   "[", "]")
    check(lit.count("baseColor:") == 7, "悬停态恰好 7 组（少一组引擎会读到 undefined）",
          str(lit.count("baseColor:")))
    ints = [int(x) for x in re.findall(r"baseColor:new Re\((\d+)\)", lit)]
    rgbs = [((v >> 16) & 255, (v >> 8) & 255, v & 255) for v in ints]
    check(len(set(ints)) == 7, "7 颗颜色互不相同", str(ints))
    hues = sorted(hue_of(c) for c in rgbs)
    gaps = [hue_gap(a, b) for a, b in zip(hues, hues[1:])]
    check(gaps and min(gaps) >= 25,
          "相邻两颗色相至少差 25°（上游有 4 颗挤在青绿一带）",
          f"最小间隔 {min(gaps):.0f}°  色相 {[round(h) for h in hues]}")
    check(engine.count("crystal:{") == 1, "静止态参数表恰好一处")


def balanced_div(src: str, start: int) -> str:
    """从 <div ...> 起切到它自己的 </div>（加载页骨架没有嵌套同名标签之外的坑）。"""
    i, depth = start, 0
    for m in re.finditer(r"</?div\b", src[start:]):
        depth += 1 if not m.group(0).startswith("</") else -1
        if depth == 0:
            end = start + m.end()
            return src[start:src.index(">", end) + 1]
    return src[start:start + 2000]


# ------------------------------------------------- 浏览器侧：加载页采样脚本
# 装在任何页面脚本之前：把百分比每一次变化都记下来，避免两次轮询之间漏掉一个
# 回退的帧。同时抓一份「首次看到骨架时」的快照，用来对照 SSR 结构。
INIT_SAMPLER = """
window.__seq = [];
window.__ssr = null;
const tap = () => {
  const v = document.querySelector('.ns-pre-val');
  const root = document.querySelector('.ns-pre');
  if (v && !window.__ssr) {
    const w = v.closest('.wrapper');
    window.__ssr = {
      cls: w ? w.className : '',
      scoped: w ? [...w.querySelectorAll('*')]
          .every(e => e.hasAttribute('data-v-724e2fc4')) : false,
      bg: getComputedStyle(document.querySelector('.preloader')).backgroundImage
          .slice(0, 40),
    };
  }
  if (v) {
    const p = root ? getComputedStyle(root).getPropertyValue('--ns-pre-p').trim() : '';
    const last = window.__seq[window.__seq.length - 1];
    if (!last || last[0] !== v.textContent || last[1] !== p) {
      window.__seq.push([v.textContent, p]);
    }
  }
  if (window.__seq.length < 4000) requestAnimationFrame(tap);
};
requestAnimationFrame(tap);
"""

DOM_PROBE = """() => {
  const t = (el) => el ? el.textContent.replace(/\\s+/g, '') : null;
  return {
    lang: document.documentElement.lang,
    title: document.title,
    heroH2: t(document.querySelector('.home-hero h2')),
    heroH1: t(document.querySelector('.home-hero h1')),
    footerTagline: t(document.querySelector('footer p.text-center')),
    email: t(document.querySelector('footer a[href^="mailto:"]')),
    emailHref: (document.querySelector('footer a[href^="mailto:"]') || {}).href,
    footerSocial: [...document.querySelectorAll('footer a[target=_blank]')]
        .map(a => [a.textContent.trim(), a.getAttribute('href')]),
    navLinks: [...document.querySelectorAll('header a')]
        .map(a => [a.textContent.trim(), a.getAttribute('href')]),
    blocks: [...document.querySelectorAll('.animated-text, .animated-text-big')]
        .map(n => n.textContent.replace(/\\s+/g, '')),
    cases: [...document.querySelectorAll('.case-debug')]
        .map(n => n.textContent.replace(/\\s+/g, '')),
    themeStyle: !!document.getElementById('ns-theme'),
    emphasisNodes: document.querySelectorAll('.ns-em').length,
  };
}"""

MENU_PROBE = """() => {
  const m = document.querySelector('.mobile-menu');
  if (!m) return null;
  const cs = getComputedStyle(m);
  const af = getComputedStyle(m, '::after');
  return {
    opacity: cs.opacity,
    bgImage: cs.backgroundImage,
    isolation: cs.isolation,
    animation: cs.animationName,
    afterZ: af.zIndex,
    linkOpacity: [...m.querySelectorAll('a')]
        .map(a => Number(getComputedStyle(a).opacity)),
  };
}"""

# 把截图丢回浏览器里解码 —— 免掉 Pillow 依赖，浏览器自己就是个 PNG 解码器。
DECODE_PIXELS = """async ([b64, pts]) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return pts.map(([fx, fy]) => {
    const d = g.getImageData(Math.min(c.width - 1, Math.floor(c.width * fx)),
                             Math.min(c.height - 1, Math.floor(c.height * fy)),
                             1, 1).data;
    return [d[0], d[1], d[2]];
  });
}"""

# 避开字形笔画，只采背景
SAMPLE_POINTS = [(0.08, 0.06), (0.5, 0.22), (0.12, 0.5), (0.85, 0.7), (0.5, 0.96)]


def sample_pixels(ctx, png: bytes, points):
    dec = ctx.new_page()
    dec.goto("about:blank")
    px = dec.evaluate(DECODE_PIXELS, [base64.b64encode(png).decode(), points])
    dec.close()
    return px


def preloader_checks(page, label: str) -> None:
    """加载页：结构 → 进度 → 揭幕。三段都要过。"""
    ssr = page.evaluate("() => window.__ssr")
    check(bool(ssr) and "ns-pre" in ssr.get("cls", ""),
          f"{label}：注水后骨架仍带 ns-pre（class 没被冲掉）", str(ssr))
    check(bool(ssr) and ssr.get("scoped"),
          f"{label}：骨架每个节点都带上游 scope", str(ssr))
    check(bool(ssr) and "gradient" in ssr.get("bg", ""),
          f"{label}：背景是自定义渐变，不是上游那片淡紫",
          str(ssr and ssr.get("bg")))

    try:
        page.wait_for_selector(".preloader", state="detached",
                               timeout=REVEAL_TIMEOUT)
        gone = True
    except Exception as e:  # noqa: BLE001
        gone = False
        check(False, f"{label}：揭幕后加载页离开 DOM", f"{type(e).__name__}")
    if gone:
        check(True, f"{label}：揭幕后加载页离开 DOM")

    seq = page.evaluate("() => window.__seq")
    nums = [int(v) for v, _ in seq if v.isdigit()]
    bars = [float(p) for _, p in seq if p]
    check(len(nums) >= 3, f"{label}：百分比确实在动", f"{len(nums)} 个采样")
    check(bool(nums) and nums[0] == 0, f"{label}：从 0 起步",
          str(nums[:3]))
    check(all(b >= a for a, b in zip(nums, nums[1:])),
          f"{label}：百分比单调不减",
          str([f"{a}->{b}" for a, b in zip(nums, nums[1:]) if b < a][:5]))
    check(all(b >= a - 1e-9 for a, b in zip(bars, bars[1:])),
          f"{label}：进度条单调不减")
    check(bool(nums) and max(nums) == 100, f"{label}：最终到 100",
          str(nums[-3:]))
    check(len(set(nums)) >= 8,
          f"{label}：不是几个硬编码的档位在跳", f"{len(set(nums))} 个不同值")


def menu_checks(ctx, page) -> None:
    """移动端菜单：真的有背景，而且白字压在上面读得清。"""
    print("\n[移动端菜单]")
    btn = page.query_selector(".mobile-menu-button")
    if not btn:
        check(False, "找得到菜单按钮")
        return
    page.click(".mobile-menu-button", timeout=8000)
    page.wait_for_timeout(2200)

    st = page.evaluate(MENU_PROBE)
    check(bool(st), "菜单节点在")
    if not st:
        return
    check(st["opacity"] == "1", "菜单已打开", st["opacity"])
    check(st["bgImage"] != "none",
          "菜单真有背景（上游那条规则被 Sass 注释废掉了，实测是完全透明）",
          st["bgImage"][:60])
    check(st["isolation"] == "isolate",
          "建了独立层叠上下文（噪点层的 z-index:-1 才不会捅穿父级）",
          st["isolation"])
    check(st["afterZ"] == "-1", "噪点层压在内容底下", st["afterZ"])
    check(all(o > 0.6 for o in st["linkOpacity"]) if st["linkOpacity"] else False,
          "菜单里的链接没有被压暗到读不清",
          str(st["linkOpacity"]))

    png = page.screenshot()
    px = sample_pixels(ctx, png, SAMPLE_POINTS)
    ratios = [contrast((255, 255, 255), c) for c in px]
    worst = min(ratios)
    check(worst >= 4.5,
          "实拍像素上白字对比度 ≥ 4.5:1（AA）",
          f"最差 {worst:.2f}:1  采样 {[f'{r:.1f}' for r in ratios]}")


def main() -> int:
    global BASE
    if not DIST.exists():
        print("dist/ 不存在，先跑 npm run build")
        return 2

    site = load_config("site.js")
    story = load_config("story.js")
    expected = story_texts()
    BASE = site["meta"].get("basePath", "/")

    static_checks()

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(
        ("127.0.0.1", PORT), functools.partial(Handler, directory=str(DIST)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{PORT}{BASE}"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=LAUNCH_ARGS)

        # 移动端必须带真实的 iPhone UA：站内的设备判定读的是 navigator.userAgent
        # 的正则，只把 viewport 改小、is_mobile 置 true 是骗不过它的，
        # 项目热区里的标题只在 isMobile||isRealTablet 时才渲染。
        iphone = {k: v for k, v in pw.devices["iPhone 13"].items()
                  if k != "default_browser_type"}

        for label, ctx_args, mobile in [
            ("桌面 1600x900",
             {"viewport": {"width": 1600, "height": 900}, "device_scale_factor": 1},
             False),
            (f"移动 {iphone['viewport']['width']}x{iphone['viewport']['height']}"
             " (iPhone 13 UA)", iphone, True),
        ]:
            print(f"\n[{label}]")
            ctx = browser.new_context(**ctx_args)
            ctx.add_init_script(INIT_SAMPLER)
            page = ctx.new_page()
            errors, missing = [], []
            page.on("console", lambda m: errors.append(m.text)
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("response", lambda r: missing.append(f"{r.status} {r.url}")
                    if r.status >= 400 else None)
            page.goto(url, wait_until="load", timeout=90_000)
            page.wait_for_selector(".animated-text-big", timeout=60_000)
            page.wait_for_timeout(3500)  # 让注水和 GSAP 初始化跑完

            d = page.evaluate(DOM_PROBE)

            # -------------------------------------------------- 1 外壳文案
            check(d["lang"] == site["meta"]["lang"], "html lang", d["lang"])
            check(d["title"] == site["meta"]["title"], "title", d["title"])
            hero = site["hero"]["headline"]
            want_h2 = (hero["before"] + hero["emphasis"] + hero["after"]).replace(" ", "")
            check(d["heroH2"] == want_h2, "首屏标题注水后未回退", f"{d['heroH2']!r}")
            check(d["heroH1"] == site["hero"]["title"], "首屏大字", f"{d['heroH1']!r}")
            check(d["footerTagline"] == site["footer"]["tagline"].replace(" ", ""),
                  "页脚 tagline", f"{d['footerTagline']!r}")
            check(d["email"] == site["contact"]["email"], "页脚邮箱", f"{d['email']!r}")
            want_social = [(s["label"], s["url"]) for s in site["social"]]
            got_social = [(a, b) for a, b in d["footerSocial"]]
            check(all(w in got_social for w in want_social),
                  "页脚社交链接", f"{got_social}")
            nav_labels = {a for a, _ in d["navLinks"]}
            want_nav = {site["nav"][k]["label"] for k in ("home", "agency", "labs", "contact")}
            check(want_nav <= nav_labels or (mobile and len(nav_labels) == 0),
                  "导航文案", f"got={sorted(nav_labels)} want={sorted(want_nav)}")
            check(d["themeStyle"], "注入了 ns-theme 样式")

            # -------------------------------------------------- 2 故事文字
            want_blocks = (expected["smallLight"] + expected["smallDark"]
                           + expected["big"] + expected["lines"])
            got = d["blocks"]
            check(len(got) == 17, "17 个文字块都渲染出来了", f"实际 {len(got)}")
            not_found = [w[:18] for w in want_blocks if w and w not in got]
            check(not not_found, "每个文字块的中文都出现在 DOM 里",
                  f"缺失 {not_found}")
            check(d["emphasisNodes"] > 0, "强调（.ns-em）已应用",
                  f"{d['emphasisNodes']} 个")

            # -------------------------------------------------- 项目热区
            check(len(d["cases"]) == 7, "7 个项目热区", f"实际 {len(d['cases'])}")
            if mobile:
                miss = [c["title"] for c in story["cases"]
                        if not any(c["title"].replace(" ", "") in x for x in d["cases"])]
                check(not miss, "移动端项目标题渲染", f"缺失 {miss}")

            # -------------------------------------------------- 3 外部链接
            nav_before = page.url
            opened = page.evaluate("""() => {
              window.__opened = [];
              const real = window.open;
              window.open = (u, t) => { window.__opened.push([u, t]); return null; };
              const el = document.querySelectorAll('.case-debug')[0];
              el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
              window.open = real;
              return window.__opened;
            }""")
            first_url = story["cases"][0].get("url", "")
            check(opened and opened[0][0] == first_url and opened[0][1] == "_blank",
                  "外部项目链接走新标签页", f"{opened}")
            check(page.url == nav_before, "没有触发前端路由", page.url)

            # -------------------------------------------------- 5 加载页
            preloader_checks(page, "加载页")

            # -------------------------------------------------- 6 移动端菜单
            if mobile:
                menu_checks(ctx, page)

            # -------------------------------------------------- 4/8 404 与控制台
            bad = [m for m in missing if not m.startswith("404 http://127.0.0.1:%d/favicon" % PORT)]
            check(not bad, "子路径部署下没有 404", "\n        ".join(bad[:8]))
            hard = [e for e in errors if "Hydration" not in e]
            check(not hard, "控制台无报错", "\n        ".join(hard[:5]))
            hyd = [e for e in errors if "Hydration" in e]
            check(not hyd, "无注水不匹配警告", "\n        ".join(hyd[:3]))

            ctx.close()

        # ------------------------------------------------------------ 404 页
        # 站内所有非首页路由都是死链，任何拼错的地址都会落到这里，所以它同样
        # 要是中文的、能自己站住的一页（不依赖 JS，不依赖站内的巨型 bundle）。
        print("\n[404 页]")
        ctx = browser.new_context(viewport={"width": 1280, "height": 800},
                                  java_script_enabled=False)
        page = ctx.new_page()
        missing404: list[str] = []
        page.on("response", lambda r: missing404.append(f"{r.status} {r.url}")
                if r.status >= 400 else None)
        page.goto(f"{url}404.html", wait_until="load", timeout=30_000)
        body = page.evaluate("document.body.innerText")
        ep = site["errorPage"]
        check(ep["message"] in body, "404 文案是配置里的中文", repr(body[:120]))
        check(ep["rights"] in body, "404 版权行", repr(body[:120]))
        check(page.get_attribute("a.home", "href") == site["meta"]["basePath"],
              "404 返回链接指向部署根路径",
              str(page.get_attribute("a.home", "href")))
        check(not missing404, "404 页自身没有坏引用", "\n        ".join(missing404[:5]))
        ctx.close()

        browser.close()
    httpd.shutdown()

    print(f"\n{checks - len(failures)}/{checks} 通过")
    if failures:
        print("\n失败项：")
        for f in failures:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
