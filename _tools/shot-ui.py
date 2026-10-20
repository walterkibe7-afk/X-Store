"""Capture real Elle UI screenshots with Playwright for the motion video.
Serves workspace root, screenshots live pages at desktop + mobile.
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8377"
SHOTS = [
    ("index.html", 1440, 2400, "_tools/elle-motion/ui-home.png", 2500),
    ("quiz.html", 1440, 2400, "_tools/elle-motion/ui-quiz.png", 2000),
    ("shop.html", 1440, 2400, "_tools/elle-motion/ui-shop.png", 2000),
    ("index.html", 390, 844, "_tools/elle-motion/ui-home-mobile.png", 2500),
    ("quiz.html", 390, 844, "_tools/elle-motion/ui-quiz-mobile.png", 2000),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    for page, w, h, out, wait in SHOTS:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(f"{BASE}/{page}", wait_until="networkidle")
        pg.wait_for_timeout(wait)
        pg.screenshot(path=out, full_page=False)
        print(f"saved {out}", flush=True)
        pg.close()
    b.close()
print("DONE")
