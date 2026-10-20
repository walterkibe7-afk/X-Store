"""Baseline screenshots for Elle UI work."""
from playwright.sync_api import sync_playwright
import http.server, socketserver, threading, functools, os

PORT = 8393
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import io
class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

BASE = f"http://127.0.0.1:{PORT}"
SHOTS = [
    ("shop.html", 375, 812, "_tools/_shots/shop-375.png", 1500),
    ("shop.html", 768, 1024, "_tools/_shots/shop-768.png", 1500),
    ("shop.html", 1440, 900, "_tools/_shots/shop-1440.png", 1500),
    ("login.html", 390, 844, "_tools/_shots/login-390.png", 2500),
    ("login.html", 1440, 900, "_tools/_shots/login-1440.png", 2500),
    ("index.html", 375, 812, "_tools/_shots/index-375.png", 3000),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    for page, w, h, out, wait in SHOTS:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(f"{BASE}/{page}", wait_until="networkidle")
        pg.wait_for_timeout(wait)
        pg.screenshot(path=os.path.join(ROOT, out), full_page=(w == 375))
        print("saved", out)
        pg.close()
    b.close()
httpd.shutdown()
print("DONE")
