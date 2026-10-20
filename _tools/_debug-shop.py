"""Debug: why is the shop grid empty on a plain load?"""
from playwright.sync_api import sync_playwright
import http.server, socketserver, threading, os

PORT = 8396
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 390, "height": 844})
    page.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]))
    page.on("pageerror", lambda e: print("PAGEERROR", str(e)[:300]))
    page.on("requestfailed", lambda r: print("REQFAIL", r.url[:120]))
    page.goto(f"http://127.0.0.1:{PORT}/shop.html", wait_until="networkidle")
    page.wait_for_timeout(1500)
    print("grid html head:", (page.evaluate("document.querySelector('.shop-grid').innerHTML") or "")[:200])
    print("PRODUCTS len:", page.evaluate("(window.PRODUCTS||[]).length"))
    print("CartStoreOk:", page.evaluate("typeof window.CartStore"))
    b.close()
httpd.shutdown()
