"""Focused re-checks: load-more pagination, cart math, and loading state."""
from playwright.sync_api import sync_playwright
import http.server, socketserver, threading, os

PORT = 8397
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"

def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(detail)) if detail else ""))

with sync_playwright() as p:
    b = p.chromium.launch()

    # Load more reveals the rest of the catalogue
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.goto(BASE + "/shop.html", wait_until="networkidle")
    page.wait_for_timeout(400)
    check("initial page shows 4 of 8", page.locator(".shop-product").count() == 4)
    page.click(".load-more button")
    page.wait_for_timeout(400)
    total = page.locator(".shop-product").count()
    check("after Load more: all 8 cards", total == 8, total)
    check("all 8 have Add to cart", page.locator(".shop-product .quick-add:not([disabled])").count() == 8 or page.locator(".shop-product .quick-add").count() == 8)
    b1 = page.locator(".cart-count").first.text_content()
    check("badge still 0 before adds", b1.strip() == "0")
    ctx.close()

    # Cart math check with the actual rendered cards
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.goto(BASE + "/shop.html", wait_until="networkidle")
    page.wait_for_timeout(400)
    p1 = page.locator(".shop-product").nth(0).get_attribute("data-name")
    p2 = page.locator(".shop-product").nth(1).get_attribute("data-name")
    page.locator(".shop-product .quick-add").nth(0).click()
    page.locator(".shop-product .quick-add").nth(1).click()
    page.wait_for_timeout(300)
    page.goto(BASE + "/cart.html", wait_until="networkidle")
    subtotal = page.locator(".summary-subtotal").text_content()
    check(f"cart math for {p1}+{p2} -> KSh 13,500", subtotal == "KSh 13,500", subtotal)
    ctx.close()

    # Loading state during a slow API round-trip
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()

    def slow_route(route):
        import time
        time.sleep(2)
        route.abort()
    page.route("**/api/auth/login", slow_route)
    page.goto(BASE + "/login.html", wait_until="networkidle")
    page.wait_for_timeout(2000)
    # Intercept: respond after a real delay instead
    page.unroute("**/api/auth/login")
    import time
    def delay_route(route):
        time.sleep(1.2)
        route.fulfill(status=200, content_type="application/json", body='{"ok":true,"customer":{"firstName":"Ann","lastName":"Test","email":"test@example.com"}}')
    page.route("**/api/auth/login", delay_route)
    page.fill("#loginEmail", "test@example.com")
    page.fill("#loginPassword", "password123")
    page.click(".auth-button")
    page.wait_for_timeout(200)
    busy = page.get_attribute(".auth-button", "aria-busy")
    spinning = page.evaluate("!!document.querySelector('.auth-button.is-loading')")
    check("submit button shows loading state during API wait", busy == "true" and spinning, (busy, spinning))
    page.wait_for_timeout(1500)
    check("login succeeds and redirects", "account.html" in page.url, page.url)
    page.screenshot(path=os.path.join(ROOT, "_tools/_shots/account-after-login.png"))

    # Visual shots of the redesigned login button
    lg = ctx.new_page()
    lg.goto(BASE + "/login.html", wait_until="networkidle")
    lg.wait_for_timeout(2200)
    lg.screenshot(path=os.path.join(ROOT, "_tools/_shots/login-after-1440.png"))
    mob = ctx.new_page()
    mob.goto(BASE + "/login.html", wait_until="networkidle")
    mob.wait_for_timeout(2200)
    mob.screenshot(path=os.path.join(ROOT, "_tools/_shots/login-after-390.png"))
    # hover state
    dsk = ctx.new_page()
    dsk.goto(BASE + "/login.html", wait_until="networkidle")
    dsk.wait_for_timeout(2200)
    dsk.hover(".auth-button")
    dsk.wait_for_timeout(400)
    dsk.screenshot(path=os.path.join(ROOT, "_tools/_shots/login-hover-1440.png"))
    ctx.close()
    b.close()
httpd.shutdown()
print("FOCUSED DONE")
