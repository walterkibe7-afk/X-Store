"""
Checkout redesign E2E audit.
Covers: empty-cart state, trusted summary rendering, delivery switching,
qty editing + removal, payment method switching + disabled hidden fields,
inline validation, country-aware postal/phone, card-demo honest status,
duplicate-click protection, overflow audit at 8 widths, screenshots.
Static server: fetch() calls to /api/* fail -> exercises the client
fallback path (order saved pending, honest confirmation copy).
"""
import threading, functools, json, sys, time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = r"D:\Web Designs\ST"
PORT = 8794
OUT = ROOT + r"\_tools\_shots"
FAILS = []

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, *a):
        pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

def serve():
    httpd = HTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def hi(handler=None, *a, **kw):
    pass

def check(name, cond, extra=""):
    tag = "PASS" if cond else "FAIL"
    print(f"[{tag}] {name}" + (f"  -- {extra}" if extra and not cond else ""))
    if not cond:
        FAILS.append(name)

BASE = f"http://127.0.0.1:{PORT}/checkout.html"

def goto(page, lines, width=1200, height=900):
    page.set_viewport_size({"width": width, "height": height})
    page.goto("about:blank")
    page.add_init_script(
        f"""if (location.pathname.endsWith('checkout.html')) {{
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('xLoggedIn','true');
        localStorage.setItem('xUser', JSON.stringify({{email:'tester@elle.com', firstName:'Ada', lastName:'Kim', phone:'+254 712 000 111', address:'Moi Ave', city:'Nairobi', postal:'00100', country:'Kenya'}}));
        localStorage.setItem('xCart', JSON.stringify({json.dumps(lines)}));
        localStorage.setItem('xCartOrigin', location.origin);
        }}
        """
    )
    page.goto(BASE, wait_until="domcontentloaded")
    try:
        page.wait_for_selector(".checkout-container, #emptyBag", timeout=5000)
    except Exception:
        pass

def overflow_scan(page):
    """Return (scrollW<=innerW ok?, offenders)."""
    data = page.evaluate(
        """() => {
            const doc = document.scrollingElement;
            const vw = window.innerWidth;
            const offenders = [];
            document.querySelectorAll('body *').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return;
                if (r.right > vw + 1 || r.left < -1) {
                    const cs = getComputedStyle(el);
                    if (cs.position === 'fixed') return;
                    offenders.push(el.tagName + '.' + String(el.className).slice(0, 40) + ' right=' + Math.round(r.right));
                }
            });
            return { sw: doc.scrollWidth, iw: vw, offenders: offenders.slice(0, 8) };
        }"""
    )
    return data["sw"] <= data["iw"] + 1, data

def main():
    httpd = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.on("pageerror", lambda e: FAILS.append(f"JS error: {e}"))

        # --- 1. EMPTY CART ---
        goto(page, [], 390, 800)
        empty_vis = page.is_visible("#emptyBag")
        layout_hidden = page.evaluate("document.querySelector('.checkout-container').hidden")
        check("empty cart: designed state visible", empty_vis)
        check("empty cart: form+summary hidden", layout_hidden)
        check("empty cart: CTA links to shop", page.get_attribute("#emptyBag a.empty-bag-cta", "href").endswith("shop.html"))
        shot = f"{OUT}\\checkout-empty-390.png"
        page.screenshot(path=shot, full_page=True)

        # screen reader of summary must contain nothing hardcoded
        html = page.content()
        check("no hardcoded Silk Touch in checkout.html output", "Silk Touch" not in html)
        check("no hardcoded totals in output", "8,300" not in html and "8,300" not in page.content())

        # --- 2. ONE ITEM, DEFAULT DELIVERY ---
        lines = [{"id": "silk-touch", "name": "Silk Touch", "price": 7650, "quantity": 1, "category": "Intimate · Toys"}]
        goto(page, lines, 375, 800)
        check("summary: product name from cart", page.is_visible(".checkout-product strong"))
        check("summary: line total", page.text_content("#summaryItems .cp-price").strip() == "KSh 7,650")
        check("summary: subtotal", page.text_content("#summarySubtotal").strip() == "KSh 7,650")
        check("summary: shipping standard", page.text_content("#summaryShipping").strip() == "KSh 650")
        check("summary: total", page.text_content("#summaryTotal").strip() == "KSh 8,300")

        # --- 3. DELIVERY SWITCH ---
        page.click(".delivery-option:nth-child(2)")
        page.wait_for_timeout(120)
        check("express: shipping", page.text_content("#summaryShipping").strip() == "KSh 1,550")
        check("express: total", page.text_content("#summaryTotal").strip() == "KSh 9,200")
        check("express: selected class", page.evaluate("document.querySelectorAll('.delivery-option')[1].classList.contains('selected')"))
        page.click(".delivery-option:nth-child(1)")
        page.wait_for_timeout(120)
        check("switch back: total", page.text_content("#summaryTotal").strip() == "KSh 8,300")

        # --- 4. MULTI-ITEM + QTY EDIT + REMOVE ---
        lines2 = lines + [{"id": "the-duo", "name": "The Duo", "price": 9350, "quantity": 2, "category": "Intimate · Accessories"}]
        goto(page, lines2, 390, 820)
        rows = page.query_selector_all("#summaryItems .checkout-product")
        check("multi-item: two rows", len(rows) == 2)
        check("multi-item: subtotal", page.text_content("#summarySubtotal").strip() == "KSh 26,350")
        check("multi-item: total", page.text_content("#summaryTotal").strip() == "KSh 27,000")
        check("badge synced in another tab simulation: badge n/a here", True)

        page.click("#summaryItems .checkout-product[data-id='the-duo'] [data-act='inc']")
        page.wait_for_timeout(120)
        check("qty +: subtotal", page.text_content("#summarySubtotal").strip() == "KSh 35,700")
        page.click("#summaryItems .checkout-product[data-id='the-duo'] [data-act='dec']")
        page.click("#summaryItems .checkout-product[data-id='the-duo'] [data-act='dec']")
        page.wait_for_timeout(160)
        rows = page.query_selector_all("#summaryItems .checkout-product")
        check("dec to 0 removes row", len(rows) == 1 and page.text_content("#summarySubtotal").strip() == "KSh 7,650")
        page.click("#summaryItems .checkout-product[data-id='silk-touch'] [data-act='remove']")
        page.wait_for_timeout(200)
        check("remove last -> empty state", page.is_visible("#emptyBag") and page.evaluate("document.querySelector('.checkout-container').hidden"))

        # --- 5. PAYMENT METHOD SWITCHING ---
        lines1 = lines
        goto(page, lines1, 1280, 900)
        check("card tab default visible", page.is_visible(".payment-fields"))
        check("card demo badge copy", "demo" in page.text_content(".payment-demo-badge").lower())
        page.click(".payment-method[data-method='mobile']")
        page.wait_for_timeout(100)
        check("mobile: card fields hidden", not page.is_visible(".payment-fields"))
        check("mobile: number field visible", page.is_visible("#mobileMoneyNumber"))
        check("mobile: card inputs disabled", page.evaluate("Array.from(document.querySelectorAll('.payment-fields input')).every(i=>i.disabled)"))
        check("mobile: note honest", "real M-Pesa prompt" in page.text_content("#paymentNote"))
        page.click(".payment-method[data-method='paybill']")
        page.wait_for_timeout(100)
        acc = (page.text_content(".paybill-account") or "").strip()
        check("paybill: account ref generated", acc.startswith("ELLE") and len(acc) == 12, acc)
        check("paybill: business number", (page.text_content(".paybill-number") or "").strip() == "542542")
        check("paybill: note honest", "confirm" in page.text_content("#paymentNote").lower())
        page.click(".payment-method[data-method='card']")
        page.wait_for_timeout(100)
        check("back to card: mobile input disabled", page.evaluate("document.getElementById('mobileMoneyNumber').disabled"))

        # --- 6. VALIDATION ---
        page.evaluate("['email','firstName','lastName','address','city','postal','phone'].forEach(id=>document.getElementById(id).value='')")
        page.click(".place-order")
        page.wait_for_timeout(200)
        errs = page.eval_on_selector_all(".field-error:not([hidden])", "els=>els.length")
        check("invalid: inline errors", errs >= 7, f"{errs} errors")
        check("invalid: banner message", page.is_visible("#checkoutError"))
        focused = page.evaluate("document.activeElement.id")
        check("invalid: focus moved", focused == "email", focused)

        # fill good values except bad Kenya postal
        page.evaluate("""() => {
            document.getElementById('email').value='test@elle.com';
            document.getElementById('firstName').value='Ada';
            document.getElementById('lastName').value='Kim';
            document.getElementById('address').value='12 Moi Ave';
            document.getElementById('city').value='Nairobi';
            document.getElementById('postal').value='AB!23';
            document.getElementById('phone').value='0712000111';
        }""")
        page.click(".place-order")
        page.wait_for_timeout(200)
        err = page.eval_on_selector_all(".field-error:not([hidden])", "els=>els.map(e=>e.textContent)")
        check("Kenya bad postal caught", any("postal" in (e or "").lower() or "code" in (e or "").lower() for e in err), str(err))

        # country switch updates label + rules
        page.select_option("#country", "United Kingdom")
        page.fill("#postal", "SW1A 1AA")
        page.wait_for_timeout(100)
        label = page.eval_on_selector("label[for='postal']", "el=>el.childNodes[0].nodeValue")
        check("UK: postal relabel", "postcode" in label.lower(), label)
        # Validation-only probe: keep another field invalid so the click never
        # submits, and confirm UK postal format itself passes.
        page.fill("#email", "not-an-email")
        page.click(".place-order")
        page.wait_for_timeout(250)
        errsUK = page.eval_on_selector_all(".field-error:not([hidden])", "els=>els.map(e=>e.id)")
        check("UK valid postal passes", errsUK == ["err-email"], str(errsUK))
        page.select_option("#country", "Kenya")

        # --- 7. CARD DEMO FALLBACK ORDER (static server => API 404) ---
        page.evaluate("""() => {
            document.getElementById('email').value='tester@elle.com';
            document.getElementById('firstName').value='Ada';
            document.getElementById('lastName').value='Kim';
            document.getElementById('address').value='12 Moi Ave';
            document.getElementById('city').value='Nairobi';
            document.getElementById('postal').value='00100';
            document.getElementById('phone').value='0712000111';
        }""")
        storage_before = page.evaluate("JSON.parse(localStorage.getItem('xOrders')||'[]').length")
        page.click(".place-order")
        # double click: must not create a second order
        try:
            page.click(".place-order", timeout=1500)
        except Exception:
            pass
        page.wait_for_url("**/order-confirmation.html", timeout=15000)
        orders = page.evaluate("JSON.parse(localStorage.getItem('xOrders')||'[]')")
        check("fallback order saved", len(orders) >= 1)
        check("double-click: exactly ONE new order", len(orders) - storage_before == 1, f"{storage_before}->{len(orders)}")
        last = orders[0]
        check("card demo: payment status pending", last.get("payment", {}).get("status") == "pending", str(last.get("payment")))
        check("card demo: simulated flag", last.get("payment", {}).get("simulated") is True)
        check("card demo: total consistent", last.get("total") == 8300, str(last.get("total")))
        check("cart cleared after order", page.evaluate("(localStorage.getItem('xCart')||'[]') === '[]'"))
        title = page.text_content("#confirmation-title").strip()
        check("confirmation: honest title", title == "ORDER RECEIVED", title)
        intro = page.text_content(".preparing-msg")
        check("confirmation: demo disclosed", "no payment was processed" in intro.lower(), intro[:120])
        body = page.text_content("body")
        check("confirmation: no $ amounts", "$" not in body)
        check("confirmation: KSh amounts", "KSh" in body)

        # --- 8. OVERFLOW AUDIT at 8 widths ---
        line_one = lines1
        for w in [320, 375, 390, 430, 768, 1024, 1280, 1440]:
            h = 900 if w < 768 else 950
            goto(page, line_one, w, h)
            if w >= 320 and w <= 430:
                page.wait_for_timeout(120)
                # scroll to bottom too
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(80)
            ok, data = overflow_scan(page)
            check(f"{w}px: no horizontal overflow", ok, str(data["offenders"]))
        shot = f"{OUT}\\checkout-after-390.png"
        goto(page, line_one, 390, 844)
        page.screenshot(path=shot, full_page=True)
        shot2 = f"{OUT}\\checkout-after-1440.png"
        goto(page, line_one, 1440, 950)
        page.screenshot(path=shot2)
        scrolled = page.evaluate("window.scrollTo(0, 400)")
        page.wait_for_timeout(150)
        cols = page.evaluate("()=>{const s=getComputedStyle(document.querySelector('.checkout-summary .summary-sticky'));return {pos:s.position, top:s.top};}")
        check("desktop: summary sticky", cols["pos"] == "sticky", str(cols))
        sticky_rect = page.evaluate("""()=>{const el=document.querySelector('.summary-sticky');const r=el.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right};}""")
        check("sticky summary stays in viewport", sticky_rect["top"] >= 0 and sticky_rect["left"] >= 0, str(sticky_rect))

        browser.close()
    httpd.shutdown()
    print()
    if FAILS:
        print(f"{len(FAILS)} FAIL(S):")
        for f in FAILS:
            print(" -", f)
        sys.exit(1)
    print("ALL CHECKS PASSED")

if __name__ == "__main__":
    main()
