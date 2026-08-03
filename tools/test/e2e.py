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
    6  移动端菜单：打开后真有背景，实拍像素上「实际文字色」对比度 ≥ 7:1
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


def parse_rgb(css: str):
    """把 computed style 的 rgb()/rgba() 拆成三元组。拆不出来返回 None。

    菜单从 frost 换成 paper 之后文字色不再恒是白的，实拍对比度必须按实际
    取到的文字色去算，写死 (255,255,255) 会让墨字方案永远挂在 1.2:1。
    """
    nums = re.findall(r"[\d.]+", css or "")
    if len(nums) < 3:
        return None
    return tuple(int(round(float(n))) for n in nums[:3])


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

    # ---- 字体预载：必须抢在 1.6 MB 的引擎包 modulepreload 之前
    # 两款字体的 @font-face 埋在 entry CSS 里，不预载的话浏览器要等引擎包和
    # CSS 都下完才去取，加载页那个巨大的衬线斜体数字整场都在用回落字体顶着。
    fonts = re.findall(r'<link rel="preload" as="font"[^>]*href="([^"]+)"[^>]*>', html)
    check(len(fonts) == 2, "两款自托管字体都预载了", str(fonts))
    for href in fonts:
        check('crossorigin' in html[html.index(href):html.index(href) + 80],
              f"{href.rsplit('/', 1)[-1]} 带 crossorigin（字体走 CORS，漏了会白下一遍）")
        check((DIST / href.lstrip("./")).exists(), f"{href} 真的在产物里")
    i_font = html.find('as="font"')
    i_mod = html.find('rel="modulepreload"')
    check(i_font != -1 and i_font < i_mod,
          "字体预载排在引擎包 modulepreload 前面（排后面等于没预载）",
          f"font@{i_font}  modulepreload@{i_mod}")

    # ---- 注入的主题样式
    style = html[html.index('<style id="ns-theme">'):]
    style = style[:style.index("</style>")]
    for frag_txt, label in [
        # editorial 铺的是 background-color + 两团 radial-gradient，progress/legacy
        # 走单条 background，所以这里只认前缀，不锁到冒号。
        (".preloader.preloader{background", "加载页背景被覆盖（上游那片淡紫没了）"),
        (".mobile-menu.mobile-menu", "移动端菜单背景规则已注入"),
        (".ns-pre-bar", "进度条样式已注入"),
    ]:
        check(frag_txt in style, label)

    cfg = load_config("site.js")
    pre_style = cfg.get("preloader", {}).get("style", "editorial")
    menu_mode = cfg.get("menu", {}).get("background", "frost")
    if pre_style == "editorial":
        # 数字本身就是进度条：墨色填到 --ns-pre-p，剩下的是淡墨。
        check("background-clip:text" in style,
              "editorial：数字用 background-clip 做填充式进度")
        check(style.count("--ns-pre-cut:") == 1
              and style.count("var(--ns-pre-cut)") == 2,
              "editorial：分界点收在 --ns-pre-cut，渐变两个断点都读它")
        # 斜体字形会挑到行盒外面，不补 padding 就会被 background-clip 削平；
        # 补完必须用等量负 margin 收回来，且分界点要把 padding 减掉。
        check("padding:.02em .18em 0 .08em" in style
              and "margin:-.02em -.18em 0 -.08em" in style,
              "editorial：数字四周补了挑出量，并用负 margin 抵回原位")
        check("100% - .26em" in style,
              "editorial：分界点把左右 padding 从映射里减了回去")
        # 捆在产物里的 TheSeasons 是「FSP DEMO」试用版：4 号字形被换成了花瓣 +
        # DEMO 水印（9 条轮廓 / 79 个点，其余数字都只有 1–3 条）。进度只要走到
        # 含 4 的值（4、14、24…94 共 19 个），那个巨大的数字上就会盖出水印。
        # 所以默认把数字换成 TTNeoris（sans）；要衬线斜体得显式写
        # numerals:'display'，构建期会另给一条试用版告警。
        numerals = cfg.get("preloader", {}).get("numerals", "sans")
        i_num = style.index(".ns-pre-num{")
        seg_num = style[i_num:style.index("}", i_num)]
        if numerals == "display":
            check("var(--font-serif)" in seg_num
                  and "font-style:italic" in seg_num,
                  "editorial：numerals=display 时数字回到衬线斜体", seg_num[:140])
        else:
            check("var(--font-sans-regular)" in seg_num
                  and "font-style:normal" in seg_num,
                  "editorial：数字走无衬线（捆的衬线体把 4 换成了 DEMO 水印）",
                  seg_num[:140])
        # 百分号原先被 space-between 甩到版心另一端，读数和单位断成两截。
        check("justify-content:flex-start" in seg_num,
              "editorial：百分号贴着数字排（不再 space-between）", seg_num[:140])
        i_pct = style.index(".ns-pre-pct{")
        seg_pct = style[i_pct:style.index("}", i_pct)]
        check("clamp(22px," in seg_pct,
              "editorial：百分号有下限字号（原先 2vw 在窄屏触底到 13px）",
              seg_pct[:140])
        # 标识在窄屏收一档，别压过唯一的读数。
        check("@media(max-width:640px){.ns-pre-mark{width:32px}}" in style,
              "editorial：标识在窄屏收到 32px")

    if menu_mode == "frost":
        # frost 的骨架：四团彩晕 + 暗网格 + 颗粒 + 上置序号。少一层就不是磨砂了。
        for frag_txt, label in [
            ("counter-reset:ns-menu", "frost：导航列建了计数器"),
            ("content:counter(ns-menu,decimal-leading-zero)",
             "frost：序号是计数器生成的，没跟条目数绑死"),
            ("--ns-menu-gut:max(24px,", "frost：量度变量在（导航左对齐收在量度内）"),
            ("radial-gradient(", "frost：彩晕层在"),
            ("feTurbulence", "frost：颗粒是 feTurbulence 现生成的，不是外链贴图"),
            ("isolation:isolate", "frost：建了独立层叠上下文（颗粒层 z-index:-1 才不捕穿）"),
            ("a:focus-visible{outline", "frost：补了键盘焦点框（上游整站一次没写过）"),
        ]:
            check(frag_txt in style, label)
        # 序号打在条目「上方」靠的是 ::before + display:block，不是 ::after。
        i_a = style.index(">a::before{")
        check("display:block" in style[i_a:i_a + 200],
              "frost：序号走 ::before 且是块级（打在条目上方，不是右侧）",
              style[i_a:i_a + 60])
        # 四角各一团，缺一角就成了斜向渐变。
        corners = ["at 0% 0%", "at 100% 0%", "at 0% 100%", "at 100% 100%"]
        check(all(c in style for c in corners),
              "frost：四个角都有彩晕（缺角就退化成斜向渐变）",
              str([c for c in corners if c not in style]))
        # 暗网格：黑线不吃亮度预算，白线会。写成白的等于把彩晕的色度砍掉一半。
        check("rgba(0,0,0,.14)" in style,
              "frost：网格是黑线（白线会占掉彩晕的亮度预算）")
        # 菜单背后是全屏 3D 场景，模糊它拿不到磨砂质感还白烧一帧 GPU。
        check("backdrop-filter" not in style,
              "frost：没有 backdrop-filter（背后是 3D 场景，模糊它纯亏）")
        check("transition-delay" not in style,
              "frost：错峰复用上游的 delay-200/250/300/350，没另起一套")

    if menu_mode == "paper":
        # paper 的骨架：一张象牙纸 + 四团极淡的水彩 + 暗网格 + 浅面颗粒，
        # 上面压墨字。少一层就退回「白底一堆链接」。
        for frag_txt, label in [
            ("background-color:#f2ede3", "paper：象牙纸是实底铺的，不是渐变"),
            ("counter-reset:ns-menu", "paper：导航列建了计数器"),
            ("content:counter(ns-menu,decimal-leading-zero)",
             "paper：序号是计数器生成的，没跟条目数绑死"),
            ("--ns-menu-gut:max(24px,", "paper：量度变量在（导航左对齐收在量度内）"),
            ("feTurbulence", "paper：颗粒是 feTurbulence 现生成的，不是外链贴图"),
            ("isolation:isolate", "paper：建了独立层叠上下文（颗粒层 z-index:-1 才不捕穿）"),
            ("a:focus-visible{outline", "paper：补了键盘焦点框（上游整站一次没写过）"),
        ]:
            check(frag_txt in style, label)
        # 白字是上游 .text-white 打的。注入规则的特异度 (0,2,1) 已经压过它，
        # 一行 color 就够，不需要 !important。
        check(".mobile-menu.mobile-menu a{color:#14120f}" in style,
              "paper：文字改成墨色，且没有靠 !important 硬压")
        check("!important" not in style.split(".mobile-menu.mobile-menu")[1][:3000],
              "paper：菜单这段一个 !important 都没用")
        # 四团水彩缺一角就退化成斜向渐变；两层网格是横竖两向。
        corners = ["at 0% 0%", "at 100% 0%", "at 0% 100%", "at 100% 100%"]
        check(all(c in style for c in corners),
              "paper：四个角都有水彩（缺角就退化成斜向渐变）",
              str([c for c in corners if c not in style]))
        check(style.count("radial-gradient(") >= 4, "paper：四团水彩都在",
              str(style.count("radial-gradient(")))
        # 序号与条目并排（grid 两列），不是 frost 那样打在上方。
        i_a = style.index(">a{")
        check("grid-template-columns:auto 1fr" in style[i_a:i_a + 260],
              "paper：序号与条目并排成两列（auto 1fr）", style[i_a:i_a + 80])
        # 关闭图标和 logo 是白色 SVG/PNG，压在纸上必须反色，否则整个不见了。
        check("filter:brightness(0)" in style,
              "paper：白色图标在纸底上反成黑色")
        check("@supports selector(:has(*))" in style,
              "paper：logo 反色裹在 :has() 特性检测里（老浏览器不至于变白丢字）")
        check("transition-delay" not in style,
              "paper：错峰复用上游的 delay-200/250/300/350，没另起一套")

    if menu_mode == "ink":
        # 这三条是 ink 版式的骨架，任何一条掉了都会退回「一堆居中链接」。
        for frag_txt, label in [
            ("counter-reset:ns-menu", "ink：导航列建了计数器"),
            ("content:counter(ns-menu,decimal-leading-zero)",
             "ink：序号是计数器生成的，没跟条目数绑死"),
            ("--ns-menu-gut:max(20px,", "ink：量度变量在（发丝线通栏、文字收在量度内）"),
            ("backdrop-filter:blur(", "ink：磨砂在"),
            ("@supports not ((-webkit-backdrop-filter",
             "ink：不支持磨砂时有实底兜底"),
            ("a:focus-visible{outline:", "ink：补了键盘焦点框（上游整站一次没写过）"),
        ]:
            check(frag_txt in style, label)
        check("transition-delay" not in style,
              "ink：错峰复用上游的 delay-200/250/300/350，没另起一套")

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

    # ---- 水晶静止态：上游 7 颗共用同一份 settings.crystal，所以只改那一份
    # 等于 7 颗一起变白。模板往引擎注入 crystalRests，并把两处读取改成先查
    # 逐颗表。没有这一步，「不悬停时也看得出七种颜色」根本做不到。
    rests = engine.count("crystalRests:{")
    if rests:
        check(rests == 1, "crystalRests 恰好一处", str(rests))
        lit_r = balanced(engine, engine.index("crystalRests:{") + len("crystalRests:"),
                         "{", "}")
        check(lit_r.count("baseColor:") == 7, "静止态逐颗 7 组",
              str(lit_r.count("baseColor:")))
        ints_r = [int(x) for x in re.findall(r"baseColor:new Re\((\d+)\)", lit_r)]
        check(len(set(ints_r)) == 7, "静止态 7 颗互不相同（这才是用户肉眼能看见的那一层）",
              str([f"#{v:06x}" for v in ints_r]))
        rgb_r = [((v >> 16) & 255, (v >> 8) & 255, v & 255) for v in ints_r]
        lums = [luminance(c) for c in rgb_r]
        check(min(lums) >= 0.3,
              "静止态每颗都够亮（玻璃壳厚度让明度低于 .55 的颜色发闷）",
              f"最暗 {min(lums):.2f}")
        hues_r = sorted(hue_of(c) for c in rgb_r)
        gaps_r = [hue_gap(a, b) for a, b in zip(hues_r, hues_r[1:])]
        check(gaps_r and min(gaps_r) >= 25, "静止态相邻色相也拉得开",
              f"最小间隔 {min(gaps_r):.0f}°")
        # 读取点也必须改掉，否则注入的表根本没人查
        check(engine.count("X.settings.crystalRests&&X.settings.crystalRests[this.id]") == 2,
              "引擎里两处静止态读取都改成先查逐颗表",
              str(engine.count("X.settings.crystalRests&&X.settings.crystalRests[this.id]")))


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
      bgColor: getComputedStyle(document.querySelector('.preloader')).backgroundColor,
      numFamily: getComputedStyle(v).fontFamily,
      numStyle: getComputedStyle(v).fontStyle,
      numJustify: (() => {
        const n = document.querySelector('.ns-pre-num');
        return n ? getComputedStyle(n).justifyContent : '';
      })(),
      // 百分号原先被 space-between 甩到版心另一端。这里量的是「%」左缘到
      // 数字盒右缘的距离；数字盒带 -.18em 负 margin，贴住时应当是负值。
      pctGap: (() => {
        const p = document.querySelector('.ns-pre-pct');
        if (!p) return null;
        return Math.round(p.getBoundingClientRect().left
                          - v.getBoundingClientRect().right);
      })(),
      numSize: parseFloat(getComputedStyle(v).fontSize),
      pctSize: parseFloat((document.querySelector('.ns-pre-pct')
          ? getComputedStyle(document.querySelector('.ns-pre-pct')).fontSize
          : '0')),
      markWidth: (() => {
        const m = document.querySelector('.ns-pre-mark');
        return m ? Math.round(m.getBoundingClientRect().width) : null;
      })(),
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
  const nav = m.children[1] || null;
  const links = nav ? [...nav.children].filter(e => e.tagName === 'A') : [];
  const a0 = links[0] || null;
  // backdrop-filter 在无 GPU 的软件渲染里会被整个算成 none（连上游自己带
  // Tailwind backdrop-blur 的汉堡按钮也一样），所以改从 CSSOM 读声明本身。
  let backdrop = '';
  let fallback = '';
  for (const sheet of document.styleSheets) {
    let rules = null;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules || []) {
      if (r.selectorText
          && r.selectorText.indexOf('.mobile-menu.mobile-menu.opacity-100') === 0
          && r.style.backdropFilter) backdrop = r.style.backdropFilter;
      // 实底兜底裹在 @supports not (...) 里：Chromium 认这个属性，所以规则
      // 不会命中，computed 上永远看不到它。只能从 CSSOM 里确认它写对了。
      if (r.conditionText && r.conditionText.indexOf('backdrop-filter') !== -1) {
        for (const inner of r.cssRules || []) {
          if (inner.style && inner.style.backgroundColor) {
            fallback = inner.style.backgroundColor;
          }
        }
      }
    }
  }
  return {
    opacity: cs.opacity,
    bgImage: cs.backgroundImage,
    bgColor: cs.backgroundColor,
    isolation: cs.isolation,
    animation: cs.animationName,
    afterZ: af.zIndex,
    gutter: cs.getPropertyValue('--ns-menu-gut').trim(),
    backdrop: backdrop,
    fallback: fallback,
    supportsBackdrop: CSS.supports('backdrop-filter', 'blur(1px)'),
    navCounterReset: nav ? getComputedStyle(nav).counterReset : '',
    linkCount: links.length,
    // ::after 里的 counter() 在 computed style 里不求值，拿到的是字面量，
    // 所以这里连同 counter-increment 一起看，三样对上才算序号真的接上了。
    numContent: a0 ? getComputedStyle(a0, '::after').content : '',
    // frost 把序号挪到条目上方，走的是 ::before。两个伪元素都取，按预设分别断言。
    numContentBefore: a0 ? getComputedStyle(a0, '::before').content : '',
    numDisplayBefore: a0 ? getComputedStyle(a0, '::before').display : '',
    numIncrement: a0 ? getComputedStyle(a0).counterIncrement : '',
    // 颗粒层：透明度和背景图都在 ::after 上，data URI 里应当是内联 SVG。
    afterOpacity: af.opacity,
    afterBgImage: af.backgroundImage,
    // frost 的下划线由 background-size 从 0 拉到满宽（不是 border，不占布局）。
    linkBgSize: a0 ? getComputedStyle(a0).backgroundSize : '',
    linkBorderTop: a0 ? getComputedStyle(a0).borderTopWidth : '',
    linkPadLeft: a0 ? getComputedStyle(a0).paddingLeft : '',
    linkTransform: a0 ? getComputedStyle(a0).transform : '',
    linkDelays: links.map(a => getComputedStyle(a).transitionDelay),
    linkOpacity: [...m.querySelectorAll('a')]
        .map(a => Number(getComputedStyle(a).opacity)),
    // 文字色不再恒是白的：paper 是墨字压纸底。实拍对比度按这个色去算。
    linkColor: a0 ? getComputedStyle(a0).color : '',
    linkDisplay: a0 ? getComputedStyle(a0).display : '',
    linkCols: a0 ? getComputedStyle(a0).gridTemplateColumns : '',
    // 关闭图标与 logo 都是白色位图，压在纸上必须反色。
    closeFilter: (() => {
      const e = document.querySelector('.mobile-menu-button img');
      return e ? getComputedStyle(e).filter : '';
    })(),
    logoFilter: (() => {
      const e = document.querySelector('.logo-wrapper img');
      return e ? getComputedStyle(e).filter : '';
    })(),
    socialColors: (() => {
      const row = m.children[2];
      return row ? [...row.querySelectorAll('a')]
          .map(a => getComputedStyle(a).color) : [];
    })(),
  };
}"""

# 把截图丢回浏览器里解码 —— 免掉 Pillow 依赖，浏览器自己就是个 PNG 解码器。
DECODE_PIXELS = """async ([b64, pts, r]) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  // 单点采样在版式一改就会误判 —— ink 版导航是左对齐的，原来那个 (0.12,0.5)
  // 正好压在白色笔画上，算出来 1.00:1。改成取 (2r+1)² 窗口里的众数色：字形
  // 笔画在背景窗口里永远是少数派。
  return pts.map(([fx, fy]) => {
    const cx = Math.min(c.width - 1, Math.floor(c.width * fx));
    const cy = Math.min(c.height - 1, Math.floor(c.height * fy));
    const x0 = Math.max(0, cx - r);
    const y0 = Math.max(0, cy - r);
    const w = Math.min(c.width, cx + r + 1) - x0;
    const h = Math.min(c.height, cy + r + 1) - y0;
    const d = g.getImageData(x0, y0, w, h).data;
    const tally = new Map();
    let best = 0;
    let win = 0;
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      const n = (tally.get(k) || 0) + 1;
      tally.set(k, n);
      if (n > best) { best = n; win = k; }
    }
    return [(win >> 16) & 255, (win >> 8) & 255, win & 255];
  });
}"""

# 避开字形笔画，只采背景
SAMPLE_POINTS = [(0.08, 0.06), (0.5, 0.22), (0.12, 0.5), (0.85, 0.7), (0.5, 0.96)]
SAMPLE_RADIUS = 10  # 21x21 窗口取众数


def sample_pixels(ctx, png: bytes, points, radius: int = SAMPLE_RADIUS):
    dec = ctx.new_page()
    dec.goto("about:blank")
    px = dec.evaluate(DECODE_PIXELS,
                      [base64.b64encode(png).decode(), points, radius])
    dec.close()
    return px


def preloader_checks(page, label: str, style: str, numerals: str = "sans") -> None:
    """加载页：结构 → 进度 → 揭幕。三段都要过。"""
    ssr = page.evaluate("() => window.__ssr")
    check(bool(ssr) and "ns-pre" in ssr.get("cls", ""),
          f"{label}：注水后骨架仍带 ns-pre（class 没被冲掉）", str(ssr))
    check(bool(ssr) and ssr.get("scoped"),
          f"{label}：骨架每个节点都带上游 scope", str(ssr))
    # 上游那片淡紫是 linear-gradient(45deg,#cebdf8,#e2dbf8)。不管换成哪种
    # 预设，它都必须消失；具体换成什么由 style 决定。
    check("206, 189, 248" not in str(ssr and ssr.get("bg")),
          f"{label}：上游那片淡紫已经被盖掉", str(ssr and ssr.get("bg")))
    if style == "editorial":
        check(bool(ssr) and ssr.get("bgColor") == "rgb(242, 237, 227)",
              f"{label}：象牙纸铺底（不是渐变，是一张纸）", str(ssr and ssr.get("bgColor")))
        fam = str(ssr and ssr.get("numFamily"))
        if numerals == "display":
            check(bool(ssr) and ssr.get("numStyle") == "italic",
                  f"{label}：numerals=display 时数字是斜体",
                  str(ssr and ssr.get("numStyle")))
            check("TheSeasons" in fam,
                  f"{label}：numerals=display 时数字落在衬线 TheSeasons 上", fam)
        else:
            # 那套衬线体是 FSP DEMO 试用版，4 号字形是水印图案，进度一到含 4
            # 的值就在最大的那个数字上盖出「花瓣 + DEMO」。默认换成 TTNeoris。
            check(bool(ssr) and ssr.get("numStyle") == "normal",
                  f"{label}：数字是正体（试用版衬线体的 4 是水印）",
                  str(ssr and ssr.get("numStyle")))
            check("TTNeoris" in fam and "TheSeasons" not in fam,
                  f"{label}：数字真的落在 TTNeoris 上，没回退到带水印的衬线体", fam)
        check(ssr and ssr.get("numJustify") == "flex-start",
              f"{label}：百分号贴着数字排（不再 space-between）",
              str(ssr and ssr.get("numJustify")))
        gap = ssr and ssr.get("pctGap")
        size = (ssr and ssr.get("numSize")) or 1
        check(gap is not None and gap < 0.15 * size,
              f"{label}：百分号没被甩到版心另一端",
              f"间距 {gap}px  数字字号 {size:.0f}px")
        check((ssr and ssr.get("pctSize") or 0) >= 20,
              f"{label}：百分号有下限字号（原先 2vw 在窄屏触底到 13px）",
              str(ssr and ssr.get("pctSize")))
        vw = page.viewport_size["width"]
        want_mark = 32 if vw <= 640 else 48
        check((ssr and ssr.get("markWidth")) == want_mark,
              f"{label}：标识在 {vw}px 宽下是 {want_mark}px（别压过唯一的读数）",
              str(ssr and ssr.get("markWidth")))
    else:
        check(bool(ssr) and "gradient" in ssr.get("bg", ""),
              f"{label}：背景是自定义渐变", str(ssr and ssr.get("bg")))

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


def menu_checks(ctx, page, mode: str) -> None:
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
          "建了独立层叠上下文（噪点层的 z-index:-1 才不会捕穿父级）",
          st["isolation"])
    check(all(o > 0.6 for o in st["linkOpacity"]) if st["linkOpacity"] else False,
          "菜单里的链接没有被压暗到读不清",
          str(st["linkOpacity"]))

    if mode == "ink":
        # 磨砂：软件渲染下 computed style 会给 none，所以看 CSSOM 里的声明。
        check("blur(" in st["backdrop"],
              "ink：CSSOM 里磨砂声明在（无 GPU 的沙箱里 computed 一律是 none，看不了实效)",
              st["backdrop"])
        # 兜底规则裹在 @supports not (...) 里。Chromium 认 backdrop-filter，
        # 规则不命中，computed 上永远是透明 —— 这是对的，别拿 computed 去验。
        check(st["fallback"] != "",
              "ink：CSSOM 里有不支持磨砂时的实底兜底规则", st["fallback"])
        if not st["supportsBackdrop"]:
            check(st["bgColor"] != "rgba(0, 0, 0, 0)",
                  "ink：这个浏览器不支持磨砂，实底必须已经顶上", st["bgColor"])
        check(st["linkCount"] == 4, "ink：四条导航都在索引表里", str(st["linkCount"]))
        check(st["navCounterReset"].startswith("ns-menu"),
              "ink：导航列建了计数器", st["navCounterReset"])
        check(st["numIncrement"].startswith("ns-menu"),
              "ink：链接自增计数器", st["numIncrement"])
        check("counter(ns-menu" in st["numContent"],
              "ink：序号由计数器生成（computed 里 counter() 不求值，只能比字面量）",
              st["numContent"])
        check(st["linkBorderTop"] == "1px", "ink：条目之间有发丝线", st["linkBorderTop"])
        check(st["gutter"] != "", "ink：量度变量算出来了", st["gutter"])
        # 上游给四条链接挂了 delay-200/250/300/350，我们只加 transform，
        # 错峰整个复用它们的。四个延迟各不相同 = 错峰还在。
        check(len(set(st["linkDelays"])) == 4,
              "ink：错峰入场还在（复用上游 delay-*，没被覆盖成同一个值）",
              str(st["linkDelays"]))
        check(st["linkTransform"] in ("none", "matrix(1, 0, 0, 1, 0, 0)"),
              "ink：菜单打开后条目已归位（没有卡在起始位移上）",
              st["linkTransform"])
    elif mode == "frost":
        check(st["afterZ"] == "-1", "frost：颗粒层压在内容底下", st["afterZ"])
        # 颗粒是内联 SVG data URI。外链贴图会多一次请求，而且离线就没了。
        check("data:image/svg+xml" in st["afterBgImage"],
              "frost：颗粒是内联 SVG data URI（不额外发请求）",
              st["afterBgImage"][:60])
        # 标定出来的暗面强度是 .179；跑偏了要么是雪花要么是看不见。
        op = float(st["afterOpacity"] or 0)
        check(0.10 <= op <= 0.30,
              "frost：颗粒强度落在标定区间内（太高是电视雪花，太低等于没有）",
              st["afterOpacity"])
        # 四团彩晕 + 两层网格 = 六层背景图。computed 里能直接数。
        check(st["bgImage"].count("radial-gradient") == 4,
              "frost：四团彩晕都进了 computed 背景",
              str(st["bgImage"].count("radial-gradient")))
        check(st["bgImage"].count("linear-gradient") >= 2,
              "frost：横竖两向网格都在",
              str(st["bgImage"].count("linear-gradient")))
        check(st["linkCount"] == 4, "frost：四条导航都在索引表里", str(st["linkCount"]))
        check(st["navCounterReset"].startswith("ns-menu"),
              "frost：导航列建了计数器", st["navCounterReset"])
        check(st["numIncrement"].startswith("ns-menu"),
              "frost：链接自增计数器", st["numIncrement"])
        check("counter(ns-menu" in st["numContentBefore"],
              "frost：序号由 ::before 的计数器生成（computed 里 counter() 不求值）",
              st["numContentBefore"])
        check(st["numDisplayBefore"] == "block",
              "frost：序号是块级，落在条目上方", st["numDisplayBefore"])
        # 菜单打开态下划线应当已经拉满；宽度是 100% 而不是 0。
        check(st["linkBgSize"].startswith("100%"),
              "frost：菜单打开后下划线已拉到满宽", st["linkBgSize"])
        check(st["backdrop"] == "",
              "frost：CSSOM 里没有 backdrop-filter 声明（背后是 3D 场景，模糊它纯亏）",
              st["backdrop"])
        check(len(set(st["linkDelays"])) == 4,
              "frost：错峰入场还在（复用上游 delay-*，没被覆盖成同一个值）",
              str(st["linkDelays"]))
    elif mode == "paper":
        check(st["afterZ"] == "-1", "paper：颗粒层压在内容底下", st["afterZ"])
        check("data:image/svg+xml" in st["afterBgImage"],
              "paper：颗粒是内联 SVG data URI（不额外发请求）",
              st["afterBgImage"][:60])
        # 浅面颗粒标定在 .34：比暗面高，因为浅底上人眼对颗粒没那么敏感。
        op = float(st["afterOpacity"] or 0)
        check(0.20 <= op <= 0.45,
              "paper：浅面颗粒强度落在标定区间内", st["afterOpacity"])
        check(st["bgImage"].count("radial-gradient") == 4,
              "paper：四团水彩都进了 computed 背景",
              str(st["bgImage"].count("radial-gradient")))
        check(st["bgImage"].count("linear-gradient") >= 2,
              "paper：横竖两向网格都在",
              str(st["bgImage"].count("linear-gradient")))
        check(parse_rgb(st["bgColor"]) == (242, 237, 227),
              "paper：底色就是那张象牙纸", st["bgColor"])
        check(parse_rgb(st["linkColor"]) == (20, 18, 15),
              "paper：导航是墨字（上游的 .text-white 已被压过）", st["linkColor"])
        check(st["linkCount"] == 4, "paper：四条导航都在索引表里", str(st["linkCount"]))
        check(st["navCounterReset"].startswith("ns-menu"),
              "paper：导航列建了计数器", st["navCounterReset"])
        check("counter(ns-menu" in st["numContentBefore"],
              "paper：序号由 ::before 的计数器生成（computed 里 counter() 不求值）",
              st["numContentBefore"])
        check(st["linkDisplay"] == "grid" and len(st["linkCols"].split()) == 2,
              "paper：序号与条目并排成两列", f'{st["linkDisplay"]} / {st["linkCols"]}')
        # 白色位图压在纸上不反色等于整个消失。
        check("brightness(0)" in st["closeFilter"],
              "paper：关闭图标反成黑色（白 SVG 压在纸上会消失）", st["closeFilter"])
        check("brightness(0)" in st["logoFilter"],
              "paper：菜单打开时 logo 跟着反色（:has() 命中）", st["logoFilter"])
        # 社交行原来是 opacity-61 的白字压纸底 ≈ 1.6:1。改成实色淡墨。
        socials = [parse_rgb(c) for c in st["socialColors"]]
        worst_social = min((contrast(c, (242, 237, 227))
                            for c in socials if c), default=0)
        check(worst_social >= 4.5,
              "paper：社交行那排淡字在纸上仍到 AA",
              f"最差 {worst_social:.2f}:1  {st['socialColors']}")
        check(len(set(st["linkDelays"])) == 4,
              "paper：错峰入场还在（复用上游 delay-*，没被覆盖成同一个值）",
              str(st["linkDelays"]))
    else:
        check(st["afterZ"] == "-1", "噪点层压在内容底下", st["afterZ"])

    # 自家三套预设都是构建期压着实际文字色算过对比度的（低于 7:1 直接报错），
    # 实拍也按 7 收；其余预设只守 AA。文字色不写死 —— paper 是墨字压纸底，
    # 按白字采样会永远得到 1.2:1。
    ink = parse_rgb(st["linkColor"]) or (255, 255, 255)
    floor = 7.0 if mode in ("frost", "ink", "paper") else 4.5
    png = page.screenshot()
    px = sample_pixels(ctx, png, SAMPLE_POINTS)
    ratios = [contrast(ink, c) for c in px]
    worst = min(ratios)
    check(worst >= floor,
          f"实拍像素上文字色 rgb{ink} 对比度 ≥ {floor:g}:1",
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
    pre_style = site.get("preloader", {}).get("style", "editorial")
    pre_numerals = site.get("preloader", {}).get("numerals", "sans")
    menu_mode = site.get("menu", {}).get("background", "frost")

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
            preloader_checks(page, "加载页", pre_style, pre_numerals)

            # -------------------------------------------------- 6 移动端菜单
            if mobile:
                menu_checks(ctx, page, menu_mode)

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
