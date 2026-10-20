#!/usr/bin/env python3
"""QA gates for the word-locked Elle explainer render.

Gate 1 — blank-frame uniformity scan: every captured frame (9x16 + 16x9) must
         show real content. Grayscale std-dev < 6 (or mean > 225) = near-blank.
Gate 2 — word-sync spot checks: for a sample of locked words, the element
         must be invisible at word-0.15s and settled (opacity >= .9) at
         word+0.4s. Uses the same paused-timeline seek() the render uses.
"""
import os
import sys

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

ROOT = r"d:\Web Designs\ST"
OUT = os.path.join(ROOT, "assets", "promo")
FRAMES = {"9x16": os.path.join(OUT, "_frames_9x16"),
          "16x9": os.path.join(OUT, "_frames_16x9")}
PORT = 8871

STD_FLOOR = 6.0     # below = uniform/blank
MEAN_CEIL = 225.0   # above = blown-out white

# (selector, measured word start) — subset covering every scene & element type
WORD_CHECKS = [
    ("#t-l2", 0.44), ("#t-s1", 1.52), ("#t-s2", 2.60),
    ("#p-c1", 5.86), ("#p-c2", 6.98), ("#p-c3", 8.22), ("#p-pivot", 10.18),
    ("#g-h", 11.86), ("#g-phone", 12.54),
    ("#g-w1", 13.28), ("#g-w2", 14.10), ("#g-w3", 15.12),
    ("#m-h", 16.74), ("#m-l1", 18.26), ("#m-l2", 19.40), ("#m-phone", 19.74),
    ("#m-w1", 22.38), ("#m-w2", 23.52),
    ("#e-l1", 24.10), ("#e-logo", 25.04), ("#e-btn", 25.52),
    ("#e-l2", 26.22), ("#e-l3", 27.60),
]


def gate_uniformity():
    bad = []
    total = 0
    for tag, d in FRAMES.items():
        if not os.path.isdir(d):
            print(f"  ! missing {d}")
            continue
        for name in sorted(os.listdir(d)):
            if not name.endswith(".png"):
                continue
            total += 1
            im = Image.open(os.path.join(d, name)).convert("L")
            stat = ImageStat.Stat(im)
            if stat.stddev[0] < STD_FLOOR or stat.mean[0] > MEAN_CEIL:
                bad.append((tag, name, round(stat.mean[0], 1), round(stat.stddev[0], 1)))
    print(f"Gate 1 uniformity: {total} frames scanned, {len(bad)} flagged")
    for b in bad[:20]:
        print(f"  BLANK? {b[0]}/{b[1]}  mean={b[2]} std={b[3]}")
    return len(bad) == 0


def gate_word_sync(dist_url):
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = browser.new_page(viewport={"width": 1080, "height": 1920},
                                device_scale_factor=1)
        page.add_init_script("window.__CAPTURE__ = true")
        page.goto(dist_url, wait_until="load")
        page.wait_for_function("window.__ELLE__ && window.__ELLE__.ready === true",
                               timeout=20000)

        def opacity(sel):
            return page.evaluate(
                f"getComputedStyle(document.querySelector('{sel}')).opacity")

        for sel, w in WORD_CHECKS:
            page.evaluate(f"window.__ELLE__.seek({w - 0.15:.3f})")
            before = float(opacity(sel))
            page.evaluate(f"window.__ELLE__.seek({w + 0.40:.3f})")
            after = float(opacity(sel))
            ok = before < 0.12 and after >= 0.9
            status = "ok " if ok else "FAIL"
            print(f"  {status} {sel:10s} word={w:5.2f}  before={before:.2f} after={after:.2f}")
            if not ok:
                failures.append((sel, w, before, after))
        browser.close()
    print(f"Gate 2 word-sync: {len(WORD_CHECKS)} checks, {len(failures)} failed")
    return len(failures) == 0


def main():
    ok1 = gate_uniformity()
    # serve dist on a tiny thread for the sync gate
    import http.server, socketserver, threading
    dist = os.path.join(ROOT, "_tools", "elle-motion", "dist")
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=dist, **k)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        ok2 = gate_word_sync(f"http://127.0.0.1:{PORT}/index.html")
    finally:
        httpd.shutdown()
    if ok1 and ok2:
        print("ALL QA GATES PASSED")
    else:
        print("QA GATES FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
