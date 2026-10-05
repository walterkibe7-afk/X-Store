// Smoke test for the X-store auth flow (no browser needed).
// Run: node _tests/auth-flow-smoke-test.js
const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "..", "X-store");

function makeElement(id) {
    const el = {
        id,
        textContent: "",
        value: "",
        checked: false,
        innerHTML: "",
        _listeners: {},
        attributes: {},
        classList: {
            _s: new Set(),
            add(...c) { c.forEach((x) => this._s.add(x)); },
            remove(...c) { c.forEach((x) => this._s.delete(x)); },
            toggle(c, force) {
                const want = force === undefined ? !this._s.has(c) : !!force;
                want ? this._s.add(c) : this._s.delete(c);
                return want;
            },
            contains(c) { return this._s.has(c); }
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        removeAttribute(k) { delete this.attributes[k]; },
        closest() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        appendChild(child) { this._child = child; return child; },
        insertAdjacentHTML() { },
        focus() { },
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        remove() { },
        dispatch(type) {
            const event = {
                defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; },
                stopPropagation() { }
            };
            (this._listeners[type] || []).forEach((fn) => fn(event));
            return event;
        }
    };
    return el;
}

function makeDOM() {
    const byId = new Map();
    const bySelector = new Map();
    return {
        byId,
        bySelector,
        addEventListener() { },
        getElementById(id) {
            if (!byId.has(id)) byId.set(id, makeElement(id));
            return byId.get(id);
        },
        querySelector(sel) {
            if (!bySelector.has(sel)) bySelector.set(sel, makeElement(sel));
            return bySelector.get(sel);
        },
        querySelectorAll(sel) {
            if (sel === ".delivery-option") {
                if (!bySelector.has(".delivery-option")) {
                    const opt = makeElement(".delivery-option");
                    opt.textContent = "$5";
                    bySelector.set(".delivery-option", opt);
                }
                if (!bySelector.has(".delivery-option.selected b")) {
                    const cost = makeElement(".delivery-option.selected b");
                    cost.textContent = "$5";
                    bySelector.set(".delivery-option.selected b", cost);
                }
                return [bySelector.get(".delivery-option")];
            }
            return [];
        },
        // script.js injects the shared search panel at runtime.
        createElement(tag) {
            return makeElement(tag);
        }
    };
}

function makeLocalStorage() {
    const store = new Map();
    return {
        store,
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
    };
}

function makeWindow() {
    return { location: { href: "" }, addEventListener() { }, scrollY: 0 };
}

const results = [];
function check(name, ok, extra) {
    results.push({ name, ok });
    console.log((ok ? "PASS  " : "FAIL  ") + name + (extra !== undefined ? "  -> " + extra : ""));
}

function loadScript(file, dom, win, ls) {
    const src = fs.readFileSync(path.join(SITE, file), "utf8");
    const fn = new Function("document", "window", "localStorage", "setTimeout", "alert", src);
    fn(dom, win, ls, (cb) => cb(), (msg) => { win.lastAlert = msg; });
    // In a browser `window.X = ...` creates a global binding. Here `window` is a
    // plain object, so mirror anything it gained onto globalThis for later scripts.
    Object.keys(win).forEach((k) => {
        if (typeof win[k] === "function" || typeof win[k] === "object") globalThis[k] = win[k];
    });
}

// ---------- A) cart: not logged in -> login.html + xCheckoutRedirect ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xCart", JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]));
    loadScript("cart-store.js", dom, win, ls);
    loadScript("cart.js", dom, win, ls);
    const event = dom.getElementById("checkoutButton").dispatch("click");
    check("cart.js: click blocked when logged out", event.defaultPrevented === true);
    check("cart.js: redirect target is login.html", win.location.href === "login.html", win.location.href);
    check("cart.js: sets xCheckoutRedirect", ls.getItem("xCheckoutRedirect") === "checkout.html", ls.getItem("xCheckoutRedirect"));
}

// ---------- B) cart: logged in -> no interception ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xLoggedIn", "true");
    ls.setItem("xCheckoutRedirect", "true");
    ls.setItem("xCart", JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]));
    loadScript("cart-store.js", dom, win, ls);
    loadScript("cart.js", dom, win, ls);
    const event = dom.getElementById("checkoutButton").dispatch("click");
    check("cart.js: click allowed when logged in", event.defaultPrevented === false);
    check("cart.js: clears stale xCheckoutRedirect", ls.getItem("xCheckoutRedirect") === null);
    check("cart.js: no redirect when logged in", win.location.href === "", win.location.href);
}

// ---------- C) signup: validation + success + checkout redirect ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xCheckoutRedirect", "true");
    loadScript("signup.js", dom, win, ls);
    const form = dom.getElementById("signupForm");
    const msg = dom.getElementById("signupMessage");

    form.dispatch("submit");
    check("signup.js: empty form rejected", msg.textContent.length > 0 && msg.classList.contains("error"), msg.textContent);

    dom.getElementById("firstName").value = "Amina";
    dom.getElementById("lastName").value = "Oti";
    dom.getElementById("signupEmail").value = "AMINA@Example.com";
    dom.getElementById("signupPassword").value = "short";
    dom.getElementById("confirmPassword").value = "short";
    form.dispatch("submit");
    check("signup.js: short password rejected", msg.textContent.indexOf("8 characters") > -1, msg.textContent);

    dom.getElementById("signupPassword").value = "longenough";
    dom.getElementById("confirmPassword").value = "different1";
    form.dispatch("submit");
    check("signup.js: mismatched passwords rejected", msg.textContent === "The passwords do not match.", msg.textContent);

    dom.getElementById("confirmPassword").value = "longenough";
    form.dispatch("submit");
    check("signup.js: unchecked terms rejected", msg.textContent.indexOf("Terms") > -1, msg.textContent);
    check("signup.js: no account created without terms", ls.getItem("xUser") === null, ls.getItem("xUser"));

    dom.getElementById("terms").checked = true;
    form.dispatch("submit");
    const user = JSON.parse(ls.getItem("xUser") || "null");
    check("signup.js: user stored (lowercased email)", !!user && user.email === "amina@example.com", JSON.stringify(user));
    check("signup.js: logged in flag set", ls.getItem("xLoggedIn") === "true");
    check("signup.js: redirects to checkout.html", win.location.href === "checkout.html", win.location.href);
    check("signup.js: clears xCheckoutRedirect", ls.getItem("xCheckoutRedirect") === null);
}

// ---------- D) signup: duplicate email rejected ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xUser", JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }));
    loadScript("signup.js", dom, win, ls);
    dom.getElementById("firstName").value = "Amina";
    dom.getElementById("lastName").value = "Oti";
    dom.getElementById("signupEmail").value = "amina@example.com";
    dom.getElementById("signupPassword").value = "longenough";
    dom.getElementById("confirmPassword").value = "longenough";
    dom.getElementById("signupForm").dispatch("submit");
    const msg = dom.getElementById("signupMessage");
    check("signup.js: existing email rejected", msg.textContent.indexOf("already exists") > -1, msg.textContent);
}

// ---------- E) login: wrong creds, then success -> account.html ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xUser", JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }));
    loadScript("login.js", dom, win, ls);
    const form = dom.getElementById("loginForm");
    const msg = dom.getElementById("loginMessage");

    dom.getElementById("loginEmail").value = "amina@example.com";
    dom.getElementById("loginPassword").value = "wrongpass";
    form.dispatch("submit");
    check("login.js: wrong password rejected", msg.textContent.indexOf("incorrect") > -1 && msg.classList.contains("error"), msg.textContent);
    check("login.js: no login flag on failure", ls.getItem("xLoggedIn") === null);

    dom.getElementById("loginPassword").value = "longenough";
    dom.getElementById("rememberMe").checked = true;
    form.dispatch("submit");
    check("login.js: logged in on success", ls.getItem("xLoggedIn") === "true");
    check("login.js: remember-me stored", ls.getItem("xRememberLogin") === "true");
    check("login.js: redirects to account.html", win.location.href === "account.html", win.location.href);
}

// ---------- F) login: no account yet ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    loadScript("login.js", dom, win, ls);
    dom.getElementById("loginEmail").value = "someone@example.com";
    dom.getElementById("loginPassword").value = "whatever1";
    dom.getElementById("loginForm").dispatch("submit");
    const msg = dom.getElementById("loginMessage");
    check("login.js: missing account message", msg.textContent.indexOf("No account") > -1, msg.textContent);
}

// ---------- G) login: checkout redirect honoured ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xUser", JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }));
    ls.setItem("xCheckoutRedirect", "true");
    loadScript("login.js", dom, win, ls);
    dom.getElementById("loginEmail").value = "amina@example.com";
    dom.getElementById("loginPassword").value = "longenough";
    dom.getElementById("loginForm").dispatch("submit");
    check("login.js: checkout redirect reached checkout.html", win.location.href === "checkout.html", win.location.href);
    check("login.js: checkout flag consumed", ls.getItem("xCheckoutRedirect") === null);
}

// ---------- H) account page guard ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    loadScript("account.js", dom, win, ls);
    check("account.js: guests redirected to login.html", win.location.href === "login.html", win.location.href);
}
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xLoggedIn", "true");
    ls.setItem("xUser", JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }));
    loadScript("account.js", dom, win, ls);
    check("account.js: greets signed-in user", dom.getElementById("customerName").textContent === "Amina", dom.getElementById("customerName").textContent);
    check("account.js: no redirect when logged in", win.location.href === "", win.location.href);
    dom.getElementById("logoutButton").dispatch("click");
    check("account.js: logout clears flag", ls.getItem("xLoggedIn") === null);
    check("account.js: logout goes home", win.location.href === "index.html", win.location.href);
}

// ---------- I) checkout page guard + email prefill ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    loadScript("checkout.js", dom, win, ls);
    check("checkout.js: guests bounced to login.html", win.location.href === "login.html", win.location.href);
    check("checkout.js: sets xCheckoutRedirect for guests", ls.getItem("xCheckoutRedirect") === "checkout.html", ls.getItem("xCheckoutRedirect"));
}
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xLoggedIn", "true");
    ls.setItem("xUser", JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }));
    loadScript("checkout.js", dom, win, ls);
    check("checkout.js: no redirect for members", win.location.href === "", win.location.href);
    check("checkout.js: email prefilled", dom.getElementById("email").value === "amina@example.com", dom.getElementById("email").value);
    check(
        "checkout.js: login link becomes account link",
        dom.querySelector(".section-title a[href='login.html']").getAttribute("href") === "account.html",
        dom.querySelector(".section-title a[href='login.html']").getAttribute("href")
    );
}

function loadCheckoutHarness(storage, cart) {
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    Object.keys(storage || {}).forEach((k) => ls.setItem(k, storage[k]));
    loadScript("cart-store.js", dom, win, ls);
    if (cart !== undefined) ls.setItem("xCart", JSON.stringify(cart));
    const checkoutSrc = fs.readFileSync(path.join(SITE, "checkout.js"), "utf8");
    const placeOrderFn = new Function(
        "document",
        "window",
        "localStorage",
        "CartStore",
        "PRODUCTS",
        checkoutSrc +
        "\nreturn { cartLines, cartSubtotal, selectedDelivery, buildOrder, generateOrderNumber, saveOrder, saveAccountPreferences, isChecked, showCheckoutError, fieldValue };"
    );
    const harness = placeOrderFn(dom, win, ls, win.CartStore || globalThis.CartStore, [{ id: "silk-touch", name: "Silk Touch", price: 59, category: "Intimate wellness" }]);
    return { dom, win, ls, harness };
}

// ---------- K) checkout order summary comes from xCart + products.js ----------
{
    const cart = [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 2 }, { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 1 }];
    const t = loadCheckoutHarness({ xLoggedIn: "true", xUser: JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }) }, cart);
    const lines = t.harness.cartLines();
    check("checkout.js: summary built from xCart lines", lines.length === 2, JSON.stringify(lines));
    check("checkout.js: dynamic subtotal from cart", t.harness.cartSubtotal() === 146, String(t.harness.cartSubtotal()));
    check("checkout.js: default $5 shipping", t.harness.selectedDelivery().cost === 5, String(t.harness.selectedDelivery().cost));
    check("checkout.js: dynamic total adds shipping", t.harness.cartSubtotal() + t.harness.selectedDelivery().cost === 151, String(t.harness.cartSubtotal() + t.harness.selectedDelivery().cost));
    const order = t.harness.buildOrder("amina@example.com", [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 2 }, { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 1 }]);
    check("checkout.js: order carries quantities + unit prices + line totals", order.items[0].quantity === 2 && order.items[0].unitPrice === 59 && order.items[0].lineTotal === 118, JSON.stringify(order.items[0]));
    check("checkout.js: order carries subtotal/shipping/total + delivery + date", order.subtotal === 146 && order.shipping === 5 && order.total === 151 && !!order.delivery && !!order.orderDate, JSON.stringify({ subtotal: order.subtotal, shipping: order.shipping, total: order.total }));
    check("checkout.js: customer info on order", order.customer.email === "amina@example.com" && !!order.address, JSON.stringify(order.customer));
    const second = t.harness.buildOrder("amina@example.com", [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]);
    check("checkout.js: unique order numbers", order.number !== second.number, order.number + " vs " + second.number);
    t.harness.saveOrder(order);
    check("checkout.js: xLastOrder saved", t.ls.getItem("xLastOrder") !== null);
    check("checkout.js: xOrders array saved", Array.isArray(JSON.parse(t.ls.getItem("xOrders"))) && JSON.parse(t.ls.getItem("xOrders")).length === 1, t.ls.getItem("xOrders"));
}

// ---------- L) required-field validation blocks orders without reload ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xLoggedIn", "true");
    ls.setItem("xUser", JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }));
    loadScript("checkout.js", dom, win, ls);
    const before = ls.getItem("xCart");
    dom.getElementById("email").value = "";
    dom.getElementById("firstName").value = "";
    const btn = dom.querySelector(".place-order");
    (btn._listeners.click || []).forEach((fn) => fn());
    check("checkout.js: required fields flagged inline", dom.getElementById("email").classList.contains("input-error") && dom.getElementById("firstName").classList.contains("input-error"));
    const err = dom.getElementById("checkoutError");
    check("checkout.js: inline error shown without reload", !!err && err.hidden === false && /required/i.test(err.textContent), err && err.textContent);
    check("checkout.js: cart kept when validation fails", ls.getItem("xCart") === before, String(ls.getItem("xCart")));
    check("checkout.js: no order when validation fails", ls.getItem("xLastOrder") === null, String(ls.getItem("xLastOrder")));
    check("checkout.js: no navigation when validation fails", win.location.href === "", win.location.href);
}

// ---------- L2) a valid checkout creates the order, then and only then empties the bag ----------
{
    const t = loadCheckoutHarness(
        { xLoggedIn: "true", xUser: JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" }), xCheckoutRedirect: "checkout.html" },
        [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 2 }]
    );
    // Loading the page must not touch the bag.
    check("checkout.js: loading the page keeps the cart", t.ls.getItem("xCart") !== null, String(t.ls.getItem("xCart")));
    check("checkout.js: loading the page creates no order", t.ls.getItem("xLastOrder") === null, String(t.ls.getItem("xLastOrder")));

    t.dom.getElementById("email").value = "amina@example.com";
    t.dom.getElementById("firstName").value = "Amina";
    t.dom.getElementById("lastName").value = "Oti";
    t.dom.getElementById("address").value = "12 Riverside Drive";
    t.dom.getElementById("city").value = "Nairobi";
    t.dom.getElementById("postal").value = "00100";
    t.dom.getElementById("phone").value = "+254700000000";
    const btn = t.dom.querySelector(".place-order");
    (btn._listeners.click || []).forEach((fn) => fn());

    const placed = JSON.parse(t.ls.getItem("xLastOrder"));
    check("checkout.js: successful checkout stores an order", !!placed && placed.items.length === 1, t.ls.getItem("xLastOrder"));
    check("checkout.js: order number is shared by number/orderNumber/id", placed.number === placed.orderNumber && placed.number === placed.id && placed.number.length > 2, JSON.stringify({ number: placed.number, orderNumber: placed.orderNumber, id: placed.id }));
    check("checkout.js: order totals", placed.subtotal === 118 && placed.shipping === 5 && placed.total === 123, JSON.stringify({ s: placed.subtotal, sh: placed.shipping, t: placed.total }));
    check("checkout.js: order keeps the delivery address", placed.address.address === "12 Riverside Drive" && placed.address.city === "Nairobi" && placed.address.postal === "00100" && placed.address.phone === "+254700000000", JSON.stringify(placed.address));
    check("checkout.js: order date recorded", !!placed.orderDate && !isNaN(Date.parse(placed.orderDate)), placed.orderDate);
    check("checkout.js: xOrders is an array holding the order", Array.isArray(JSON.parse(t.ls.getItem("xOrders"))) && JSON.parse(t.ls.getItem("xOrders")).length === 1, t.ls.getItem("xOrders"));
    check("checkout.js: cart cleared only after the order", t.ls.getItem("xCart") === null, String(t.ls.getItem("xCart")));
    check("checkout.js: checkout intent flag removed", t.ls.getItem("xCheckoutRedirect") === null, String(t.ls.getItem("xCheckoutRedirect")));
    check("checkout.js: navigates to order-confirmation.html", t.win.location.href === "order-confirmation.html", t.win.location.href);

    // A second order appends instead of replacing.
    const second = t.harness.buildOrder("amina@example.com", [{ id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 1 }]);
    t.harness.saveOrder(second);
    const history = JSON.parse(t.ls.getItem("xOrders"));
    check("checkout.js: xOrders keeps both orders", history.length === 2 && history[0].number === second.number && history[0].number !== placed.number, JSON.stringify(history.map((o) => o.number)));
    check("checkout.js: orders persist in localStorage", t.ls.getItem("xOrders") !== null && JSON.parse(t.ls.getItem("xOrders")).length === 2, t.ls.getItem("xOrders"));
}

// ---------- L3) consent checkboxes write to xUser, and only on a placed order ----------
{
    const ACCOUNT = { firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" };
    const fillCheckout = (t) => {
        t.dom.getElementById("email").value = "amina@example.com";
        t.dom.getElementById("firstName").value = "Amina";
        t.dom.getElementById("lastName").value = "Oti";
        t.dom.getElementById("address").value = "12 Riverside Drive";
        t.dom.getElementById("apartment").value = "Apt 4B";
        t.dom.getElementById("city").value = "Nairobi";
        t.dom.getElementById("postal").value = "00100";
        t.dom.getElementById("phone").value = "+254700000000";
    };
    const placeOrder = (t) => {
        const btn = t.dom.querySelector(".place-order");
        (btn._listeners.click || []).forEach((fn) => fn());
    };

    // saveInfo checked -> delivery details land on the account, identity intact.
    {
        const t = loadCheckoutHarness({ xLoggedIn: "true", xUser: JSON.stringify(ACCOUNT) }, [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]);
        fillCheckout(t);
        t.dom.getElementById("saveInfo").checked = true;
        t.dom.getElementById("marketingOptIn").checked = true;
        placeOrder(t);
        const user = JSON.parse(t.ls.getItem("xUser"));
        check("checkout.js: saveInfo checked saves the address", user.address === "12 Riverside Drive" && user.apartment === "Apt 4B" && user.city === "Nairobi" && user.postal === "00100" && user.phone === "+254700000000", JSON.stringify(user));
        check("checkout.js: saveInfo checked preserves password and identity", user.password === "longenough" && user.email === "amina@example.com" && user.firstName === "Amina" && user.lastName === "Oti", JSON.stringify(user));
        check("checkout.js: marketingOptIn checked stores true", user.marketingOptIn === true, JSON.stringify(user));
        check("checkout.js: no order data leaks into xUser", !("total" in user) && !("items" in user) && !("subtotal" in user), Object.keys(user).join(","));
        check("checkout.js: checkout still created the order", !!t.ls.getItem("xLastOrder") && JSON.parse(t.ls.getItem("xLastOrder")).total === 64, t.ls.getItem("xLastOrder"));
    }

    // saveInfo unchecked -> no delivery details written.
    {
        const t = loadCheckoutHarness({ xLoggedIn: "true", xUser: JSON.stringify(ACCOUNT) }, [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]);
        fillCheckout(t);
        t.dom.getElementById("saveInfo").checked = false;
        t.dom.getElementById("marketingOptIn").checked = false;
        placeOrder(t);
        const user = JSON.parse(t.ls.getItem("xUser"));
        check("checkout.js: saveInfo unchecked writes no address", user.address === undefined && user.city === undefined && user.postal === undefined && user.phone === undefined, JSON.stringify(user));
        check("checkout.js: saveInfo unchecked preserves the account", user.firstName === "Amina" && user.lastName === "Oti" && user.email === "amina@example.com" && user.password === "longenough", JSON.stringify(user));
        check("checkout.js: marketingOptIn unchecked stores false", user.marketingOptIn === false, JSON.stringify(user));
        check("checkout.js: checkout still created the order", !!t.ls.getItem("xLastOrder"), t.ls.getItem("xLastOrder"));
    }

    // A blocked order must not touch xUser at all.
    {
        const t = loadCheckoutHarness({ xLoggedIn: "true", xUser: JSON.stringify(ACCOUNT) }, [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]);
        fillCheckout(t);
        t.dom.getElementById("city").value = "";
        t.dom.getElementById("saveInfo").checked = true;
        t.dom.getElementById("marketingOptIn").checked = true;
        placeOrder(t);
        check("checkout.js: a blocked order leaves xUser untouched", t.ls.getItem("xUser") === JSON.stringify(ACCOUNT), t.ls.getItem("xUser"));
    }
}

// ---------- L4) xOrders is never trimmed ----------
{
    const t = loadCheckoutHarness({ xLoggedIn: "true", xUser: JSON.stringify({ firstName: "Amina", lastName: "Oti", email: "amina@example.com" }) }, [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]);
    const total = 27;
    for (let i = 0; i < total; i++) {
        t.harness.saveOrder(t.harness.buildOrder("amina@example.com", [{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]));
    }
    const history = JSON.parse(t.ls.getItem("xOrders"));
    check("checkout.js: xOrders keeps every order past 20", history.length === total, String(history.length));
    check("checkout.js: no duplicate entries introduced", new Set(history.map((o) => o.number)).size === total, String(new Set(history.map((o) => o.number)).size));
    check("checkout.js: stored orders stay well formed", history.every((o) => o && o.number && Array.isArray(o.items) && o.total === 64), "malformed entry");
    check("checkout.js: newest order first", history[0].number === JSON.parse(t.ls.getItem("xLastOrder")).number, JSON.stringify(history[0].number));
}

// ---------- J) shared navbar account icon ----------
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    const link = dom.querySelector('a.icon-button[aria-label="Account"]');
    link.setAttribute("href", "login.html");
    loadScript("script.js", dom, win, ls);
    check("script.js: guest account icon -> login.html", link.getAttribute("href") === "login.html", link.getAttribute("href"));
}
{
    const dom = makeDOM();
    const win = makeWindow();
    const ls = makeLocalStorage();
    ls.setItem("xLoggedIn", "true");
    const link = dom.querySelector('a.icon-button[aria-label="Account"]');
    link.setAttribute("href", "login.html");
    loadScript("script.js", dom, win, ls);
    check("script.js: member account icon -> account.html", link.getAttribute("href") === "account.html", link.getAttribute("href"));
    check("script.js: member label updated", link.getAttribute("aria-label") === "My account", link.getAttribute("aria-label"));
}

const failed = results.filter((r) => !r.ok);
console.log("\n" + (results.length - failed.length) + "/" + results.length + " checks passed");
if (failed.length) {
    console.log("FAILED:");
    failed.forEach((f) => console.log("  - " + f.name));
}
process.exit(failed.length === 0 ? 0 : 1);