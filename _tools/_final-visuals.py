"""Final visuals + full-site overflow recheck."""
from playwright.sync_api import sync_playwright
import http.server, socketserver, threading, os

PORT = 8422
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"

with sync_playwright() as p:
    b = p.chromium.launch()
    # Proper 390px login shot
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    pg.goto(BASE + "/login.html", wait_until="networkidle")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(ROOT, "_tools/_shots/login-after-390-fixed.png"), full_page=True)
    ctx.close()

    # Shop visuals at 390 (with products) + desktop hover state
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    pg.goto(BASE + "/shop.html", wait_until="networkidle")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(ROOT, "_tools/_shots/shop-after-390-full.png"), full_page=True)
    ctx.close()

    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(BASE + "/shop.html", wait_until="networkidle")
    pg.wait_for_timeout(500)
    pg.locator(".shop-product .quick-add").first.hover()
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(ROOT, "_tools/_shots/shop-after-1440.png"))
    ctx.close()

    # Full-site overflow check
    PAGES = ["index.html", "shop.html", "cart.html", "checkout.html", "login.html",
             "signup.html", "product.html", "about.html", "help.html", "quiz.html",
             "order-confirmation.html", "privacy.html", "terms.html", "404.html"]
    bad = 0
    for page_path in PAGES:
        for w in (320, 375, 390, 430):
            ctx = b.new_context(viewport={"width": w, "height": 900})
            pg = ctx.new_page()
            try:
                pg.goto(BASE + "/" + page_path, wait_until="networkidle", timeout=15000)
            except Exception:
                pass
            pg.wait_for_timeout(600)
            sw = pg.evaluate("document.documentElement.scrollWidth")
            ok = sw <= w
            if not ok:
                bad += 1
            print(("ok " if ok else "OVERFLOW ") + page_path + " @" + str(w) + "px scrollW=" + str(sw))
            ctx.close()
    print("SITESCAN FAILS:", bad)
    b.close()
httpd.shutdown()
print("DONE")
