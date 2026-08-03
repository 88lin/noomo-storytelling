#!/usr/bin/env python3
"""shots.py — 把加载页与移动端菜单真的截下来看。

不是 e2e 断言，是「肉眼诊断」用的：只出图，不判定。
加载页和菜单都是纯 DOM/CSS，不走 WebGL，所以沙箱里的 SwiftShader
影响不到它们 —— 这两张图是可信的。首屏那两张只能看排版，
3D 场景在软件渲染下不可信。

    python3 tools/test/shots.py [outDir] [port]
"""
import functools
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / 'dist'
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'shots')
PORT = int(sys.argv[2] if len(sys.argv) > 2 else 8210)

# 产物里的静态引用是相对路径，可运行时由 publicAssetsURL() 拼出来的图标
# （关闭按钮那张）带 baseURL 前缀。挂在服务器根上截图，那些图标一律 404 ——
# 会看成「破图」的假阳性。所以这里跟 e2e 一样把站点挂在 basePath 下。
BASE = json.loads(subprocess.run(
    ['node', '-e',
     'process.stdout.write(JSON.stringify('
     f'require({str(ROOT / "config" / "site.js")!r}).meta.basePath || "/"))'],
    capture_output=True, text=True, check=True).stdout)

MOBILE = dict(width=390, height=844, scale=2)
DESKTOP = dict(width=1440, height=900, scale=1)
IPHONE_UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
             'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 '
             'Mobile/15E148 Safari/604.1')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?')[0]
        if path.startswith(BASE):
            path = '/' + path[len(BASE):]
        return super().translate_path(path)

    def log_message(self, *a):
        pass


def start_server():
    handler = functools.partial(Quiet, directory=str(DIST))
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def shot(browser, name, vp, prepare, ua=None):
    kw = dict(
        viewport={'width': vp['width'], 'height': vp['height']},
        device_scale_factor=vp['scale'],
        is_mobile=vp['width'] < 700,
        has_touch=vp['width'] < 700,
        locale='zh-CN',
    )
    # 站内的设备判定读的是 navigator.userAgent 的正则：只把 viewport 改小、
    # is_mobile 置 true 骗不过它，移动端菜单根本不会进移动模式。
    if ua:
        kw['user_agent'] = ua
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:160]))
    try:
        prepare(page)
        f = OUT / f'{name}.png'
        page.screenshot(path=str(f))
        kb = f.stat().st_size / 1024
        tail = f'  [{len(errs)} 个页面错误]' if errs else ''
        print(f'  ok   {name}.png  {kb:.0f} KB{tail}')
        for e in errs[:3]:
            print(f'         ! {e}')
    except Exception as e:  # noqa: BLE001
        print(f'  FAIL {name}: {str(e).splitlines()[0][:160]}')
    ctx.close()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    srv = start_server()
    base = f'http://127.0.0.1:{PORT}{BASE}'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=angle', '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader', '--disable-lcd-text',
        ])

        # 加载页：把 _nuxt 的 js 全掐掉，页面停在服务端渲染出来的初始态，
        # 也就是用户打开网页看到的第一帧。CSS 照常加载。
        def freeze_preloader(page):
            page.route('**/_nuxt/*.js', lambda r: r.abort())
            page.goto(base, wait_until='domcontentloaded')
            page.wait_for_timeout(1500)

        shot(browser, '01_加载页_移动', MOBILE, freeze_preloader)
        shot(browser, '02_加载页_桌面', DESKTOP, freeze_preloader)

        # 捆在产物里的 TheSeasons 是 FSP DEMO 试用版，4 号字形被换成了
        # 「花瓣 + DEMO」水印。进度停在 44% 是最直接的验收帧：数字换成
        # TTNeoris 之后这里必须是两个干净的 4。
        def freeze_at_44(page):
            freeze_preloader(page)
            page.evaluate("""() => {
              if (window.__nsPreBoot) window.__nsPreBoot.stop();
              const v = document.querySelector('.ns-pre-val');
              const root = document.querySelector('.ns-pre');
              if (v) v.textContent = '44';
              if (root) root.style.setProperty('--ns-pre-p', '0.44');
            }""")
            page.wait_for_timeout(400)

        shot(browser, '07_加载页_44_移动', MOBILE, freeze_at_44)
        shot(browser, '08_加载页_44_桌面', DESKTOP, freeze_at_44)

        def boot(page, wait=4000):
            page.goto(base, wait_until='domcontentloaded')
            # 让加载页自己走完揭幕，别硬摘节点 —— 那个节点归 Vue 管，
            # 手动 remove 之后 Vue 下一次更新就往 null 父节点里插东西。
            try:
                page.wait_for_selector('.preloader', state='detached',
                                       timeout=120_000)
            except Exception:  # noqa: BLE001
                page.evaluate("""() => {
                  const p = document.querySelector('.preloader');
                  if (p) p.style.display = 'none';
                }""")
            page.wait_for_timeout(wait)

        shot(browser, '03_首屏_移动', MOBILE, boot, ua=IPHONE_UA)
        shot(browser, '04_首屏_桌面', DESKTOP, boot)

        # 移动端菜单：真的去点汉堡按钮。子条目各自带 opacity-0 + delay，
        # 只强制父节点显示会截到「空菜单」的假象 —— 必须点，等过渡跑完。
        def open_menu(page):
            boot(page)
            page.click('.mobile-menu-button', timeout=8000)
            page.wait_for_timeout(2200)

        shot(browser, '05_移动菜单_展开', MOBILE, open_menu, ua=IPHONE_UA)

        # 汉堡按钮本体（收起态），只截头部那一条
        def header(page):
            boot(page)
            page.set_viewport_size({'width': 390, 'height': 220})
            page.wait_for_timeout(500)

        shot(browser, '06_菜单按钮_收起', MOBILE, header, ua=IPHONE_UA)

        browser.close()
    srv.shutdown()
    print(f'\n输出目录 {OUT}')


if __name__ == '__main__':
    os.chdir(ROOT)
    main()
