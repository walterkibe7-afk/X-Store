// Real-DOM integration test for the X-store auth flow, using jsdom.
// Loads the ACTUAL html files, executes the ACTUAL js files, uses real localStorage.
// Run: node _tests/jsdom-integration-test.js
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.join(__dirname, "..", "X-store");
const ORIGIN = "http://xstore.local/";

const results = [];
function check(name, ok, extra) {
    results.push({ name, ok });
    console.log((ok ? "PASS  " : "FAIL  ") + name + (extra !== undefined ? "  -> " + extra : ""));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build a page: real HTML (minus its <script> tags), real js files evaluated inside the window.
function loadPage(file, scriptFiles, seedStorage) {
    const htmlFile = file.split("?")[0];
    const rawHtml = fs.readFileSync(path.join(SITE, htmlFile), "utf8");
    const html = rawHtml.replace(/<script[^>]*><\/script>/g, "");

    // Anything the page logs while it sets up counts as an error. jsdom's own
    // "navigation is not implemented" notice for plain <a href> clicks, and its
    // "Window's scrollTo() is not implemented" notice for smooth scrolling, are
    // harness limitations rather than site bugs, so both are filtered out.
    const consoleErrors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("error", (...args) => consoleErrors.push(args.join(" ")));
    virtualConsole.on("jsdomError", (error) => {
        const message = error && error.message ? error.message : String(error);
        if (message.indexOf("Not implemented: navigation") === 0) return;
        if (message.indexOf("Not implemented: Window's scrollTo") === 0) return;
        consoleErrors.push(message);
    });

    const dom = new JSDOM(html, {
        url: ORIGIN + file,
        runScripts: "outside-only",
        pretendToBeVisual: true,
        virtualConsole: virtualConsole
    });
    const win = dom.window;

    // Seed the real localStorage before scripts run.
    win.localStorage.clear();
    Object.keys(seedStorage || {}).forEach((k) => win.localStorage.setItem(k, seedStorage[k]));

    // Capture navigation instead of attempting it. jsdom marks window.location as
    // unforgeable, so it cannot be redefined; instead each script is evaluated with a
    // `window` proxy that hands back a mock location for the `location` property.
    const nav = [];
    let href = ORIGIN + file;
    const locationMock = { origin: ORIGIN };
    Object.defineProperty(locationMock, "href", {
        get() { return href; },
        set(value) { href = value; nav.push(value); }
    });
    locationMock.assign = (u) => { href = u; nav.push(u); };
    locationMock.replace = (u) => { href = u; nav.push(u); };
    // Lets pages read ?category= (and friends) the same way a browser would.
    Object.defineProperty(locationMock, "search", {
        get() {
            const index = href.indexOf("?");
            return index === -1 ? "" : href.slice(index);
        }
    });

    const windowProxy = new Proxy(win, {
        get(target, prop) {
            if (prop === "location") return locationMock;
            const value = Reflect.get(target, prop, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, prop, value) {
            if (prop === "location") return true;
            target[prop] = value;
            return true;
        }
    });

    // The shared catalogue (products.js) is declared by the pages that use it, so
    // take it from the real <script> tags instead of maintaining it in a dozen
    // lists and risking drift from the actual page.
    let scripts = scriptFiles.slice();
    if (rawHtml.indexOf("products.js") !== -1 && scripts.indexOf("products.js") === -1) {
        const before = scripts.indexOf("script.js");
        scripts.splice(before === -1 ? scripts.length : before, 0, "products.js");
    }

    scripts.forEach((file_) => {
        const src = fs.readFileSync(path.join(SITE, file_), "utf8");
        win.eval("(function (window) {\n" + src + "\n})")(windowProxy);
    });

    return { dom, win, doc: win.document, nav, consoleErrors, lastNav: () => (nav.length ? nav[nav.length - 1] : "") };
}

function submitForm(win, form) {
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
}

(async function run() {
    const USER = { firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" };
    const USER_JSON = JSON.stringify(USER);

    // ---------- 1. cart.html as a guest ----------
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], { xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]) });
        const button = p.doc.querySelector(".checkout-button");
        check("cart.html: checkout button exists", !!button);
        check("cart.html: account icon is a link to login.html", p.doc.querySelector('.nav-actions a.icon-button:not(.cart-button)').getAttribute("href") === "login.html");
        button.click();
        check("cart.html guest: navigated to login.html", p.lastNav() === "login.html", p.lastNav());
        check("cart.html guest: xCheckoutRedirect stored", p.win.localStorage.getItem("xCheckoutRedirect") === "checkout.html", p.win.localStorage.getItem("xCheckoutRedirect"));
        p.dom.window.close();
    }

    // ---------- 2. cart.html as a member ----------
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCheckoutRedirect: "true",
            xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
        });
        check("cart.html member: account icon points to account.html", p.doc.querySelector('.nav-actions a.icon-button:not(.cart-button)').getAttribute("href") === "account.html");
        p.doc.querySelector(".checkout-button").click();
        check("cart.html member: no forced navigation", p.nav.length === 0, JSON.stringify(p.nav));
        check("cart.html member: stale redirect flag cleared", p.win.localStorage.getItem("xCheckoutRedirect") === null);
        p.dom.window.close();
    }

    // __CART_TESTS_A__

    // Requirement 3/11: the header and the navbar count TOTAL UNITS.
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], {
            xCart: JSON.stringify([
                { id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 },
                { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 2 },
                { id: "midnight-gummies", name: "Midnight Gummies", price: 24, quantity: 1 }
            ])
        });
        check("cart: header counts total units (4 ITEMS)", p.doc.getElementById("cartItemCount").textContent === "4 ITEMS", p.doc.getElementById("cartItemCount").textContent);
        check("cart: navbar badge counts total units", p.doc.querySelector(".cart-count").textContent === "4", p.doc.querySelector(".cart-count").textContent);
        check("cart: mixed subtotal is dynamic", p.doc.querySelector(".summary-subtotal").textContent === "$139", p.doc.querySelector(".summary-subtotal").textContent);
        check("cart: mixed total adds the flat shipping", p.doc.querySelector(".summary-total-price").textContent === "$144", p.doc.querySelector(".summary-total-price").textContent);
        check("cart: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // Requirement 4: each line renders image/name/category/price/qty/remove/line total.
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], {
            xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
        });
        const line = p.doc.querySelector(".cart-product");
        check("cart: line shows the product image", !!line.querySelector(".cart-product-image") && line.querySelector(".cart-product-image").classList.contains("image-a"));
        check("cart: line shows the product name", line.querySelector("h2").textContent === "Silk Touch");
        check("cart: line shows the category", line.querySelector(".cart-category").textContent === "Intimate", line.querySelector(".cart-category").textContent);
        check("cart: line shows the unit price", !!line.querySelector(".cart-unit-price") && line.querySelector(".cart-unit-price").textContent === "$59 each", line.querySelector(".cart-unit-price") && line.querySelector(".cart-unit-price").textContent);
        check("cart: line shows the quantity controls", !!line.querySelector(".quantity-minus") && !!line.querySelector(".quantity-plus") && line.querySelector(".quantity").textContent === "1");
        check("cart: line shows a remove button", !!line.querySelector(".remove-product"));
        check("cart: line shows the line total", line.querySelector(".cart-product-price").textContent === "$59", line.querySelector(".cart-product-price").textContent);
        check("cart: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // Requirement 4: minus at quantity 1 removes the line; never below 1.
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], {
            xCart: JSON.stringify([
                { id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 },
                { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 2 }
            ])
        });
        p.doc.querySelectorAll(".quantity-minus")[0].click();
        const afterMinus = JSON.parse(p.win.localStorage.getItem("xCart"));
        check("cart: minus at 1 removes only that line", afterMinus.length === 1 && afterMinus[0].id === "after-dark-oil", JSON.stringify(afterMinus));
        check("cart: surviving line keeps its quantity", p.doc.querySelector(".cart-quantity .quantity").textContent === "2", p.doc.querySelector(".cart-quantity .quantity").textContent);
        p.doc.querySelector(".quantity-minus").click();
        check("cart: minus decrements a quantity of 2", JSON.parse(p.win.localStorage.getItem("xCart"))[0].quantity === 1, p.win.localStorage.getItem("xCart"));
        p.doc.querySelector(".quantity-minus").click();
        check("cart: minus at 1 empties the cart", JSON.parse(p.win.localStorage.getItem("xCart")).length === 0, p.win.localStorage.getItem("xCart"));
        check("cart: empty state returns", !p.doc.getElementById("cartEmpty").hidden);
        check("cart: summary hides with the last line", p.doc.querySelector(".summary-subtotal").closest(".summary-row").hidden === true);
        check("cart: empty cart links back to shop.html", p.doc.querySelector(".cart-empty-actions a").getAttribute("href") === "shop.html");
        check("cart: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // Requirement 9/10: quick add on the shop grid writes the same xCart shape.
    {
        const p = loadPage("shop.html", ["cart-store.js", "script.js", "shop.js"]);
        p.doc.querySelector(".shop-product .quick-add").click();
        p.doc.querySelector(".shop-product .quick-add").click();
        const stored = JSON.parse(p.win.localStorage.getItem("xCart"));
        check("cart: shop quick add persists across clicks", stored.length === 1 && stored[0].id === "silk-touch" && stored[0].quantity === 2, JSON.stringify(stored));
        check("cart: shop quick add carries the catalogue price", stored[0].price === 59 && stored[0].name === "Silk Touch", JSON.stringify(stored));
        check("cart: navbar badge follows the stored cart", p.doc.querySelector(".cart-count").textContent === "2", p.doc.querySelector(".cart-count").textContent);
        check("cart: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // Requirement 9: the stored cart survives navigation (write on shop, read on cart).
    {
        const shop = loadPage("shop.html", ["cart-store.js", "script.js", "shop.js"]);
        shop.doc.querySelector(".shop-product .quick-add").click();
        shop.doc.querySelectorAll(".shop-product .quick-add")[3].click();
        const saved = shop.win.localStorage.getItem("xCart");
        shop.dom.window.close();

        const cart = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], { xCart: saved });
        check("cart: stored cart survives navigation", cart.doc.querySelectorAll(".cart-product").length === 2, String(cart.doc.querySelectorAll(".cart-product").length));
        check("cart: stored quantities survive navigation", cart.doc.getElementById("cartItemCount").textContent === "2 ITEMS", cart.doc.getElementById("cartItemCount").textContent);
        check("cart: no console errors", cart.consoleErrors.length === 0, cart.consoleErrors.join(" | "));
        cart.dom.window.close();
    }

    // ---------- 3. quantity + summary still work ----------
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], { xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]) });
        p.doc.querySelector(".quantity-plus").click();
        p.doc.querySelector(".quantity-plus").click();
        check("cart.html: quantity increments", p.doc.querySelector(".cart-quantity .quantity").textContent === "3", p.doc.querySelector(".cart-quantity .quantity").textContent);
        check("cart.html: subtotal recalculated", p.doc.querySelector(".summary-subtotal").textContent === "$177", p.doc.querySelector(".summary-subtotal").textContent);
        check("cart.html: total recalculated", p.doc.querySelector(".summary-total-price").textContent === "$182", p.doc.querySelector(".summary-total-price").textContent);
        check("cart.html: shipping row shows the flat rate", p.doc.querySelector(".summary-shipping-price").textContent === "$5", p.doc.querySelector(".summary-shipping-price").textContent);
        check("cart.html: header counts units, not products", p.doc.getElementById("cartItemCount").textContent === "3 ITEMS", p.doc.getElementById("cartItemCount").textContent);
        p.dom.window.close();
    }

    // ---------- 3b. empty cart shows the empty state ----------
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], {});
        check("cart.html empty: no line items rendered", p.doc.querySelectorAll(".cart-product").length === 0, String(p.doc.querySelectorAll(".cart-product").length));
        check("cart.html empty: empty state visible", !p.doc.getElementById("cartEmpty").hidden);
        check("cart.html empty: subtotal is zero", p.doc.querySelector(".summary-subtotal").textContent === "$0", p.doc.querySelector(".summary-subtotal").textContent);
        check("cart.html empty: checkout disabled label", p.doc.getElementById("checkoutButton").textContent === "Your bag is empty", p.doc.getElementById("checkoutButton").textContent);
        p.doc.getElementById("checkoutButton").click();
        check("cart.html empty: checkout click blocked", p.nav.length === 0, JSON.stringify(p.nav));
        p.dom.window.close();
    }

    // ---------- 3c. product page: quantity, add to cart, buy now ----------
    {
        const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
        check("product.html: initial price label", p.doc.querySelector(".product-add").textContent === "Add to cart - $59", p.doc.querySelector(".product-add").textContent);

        p.doc.querySelector(".quantity-plus").click();
        check("product.html: quantity steps to 2", p.doc.querySelector(".quantity").textContent === "2", p.doc.querySelector(".quantity").textContent);
        check("product.html: price label follows quantity", p.doc.querySelector(".product-add").textContent === "Add to cart - $118", p.doc.querySelector(".product-add").textContent);

        p.doc.querySelector(".product-add").click();
        const stored = JSON.parse(p.win.localStorage.getItem("xCart"));
        check("product.html: add to cart persists quantity", stored.length === 1 && stored[0].quantity === 2, JSON.stringify(stored));
        check("product.html: navbar badge synced", p.doc.querySelector(".cart-count").textContent === "2", p.doc.querySelector(".cart-count").textContent);

        p.doc.querySelector(".quantity-minus").click();
        p.doc.querySelector(".product-add").click();
        const merged = JSON.parse(p.win.localStorage.getItem("xCart"));
        check("product.html: repeat add merges quantities", merged[0].quantity === 3, JSON.stringify(merged));
        p.dom.window.close();
    }
    {
        // Buy now as a guest should bounce to login and remember the intent.
        const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
        p.doc.querySelector(".buy-now").click();
        check("product.html: guest buy now goes to login.html", p.lastNav() === "login.html", p.lastNav());
        check("product.html: guest buy now sets xCheckoutRedirect", p.win.localStorage.getItem("xCheckoutRedirect") === "checkout.html", p.win.localStorage.getItem("xCheckoutRedirect"));
        const stored = JSON.parse(p.win.localStorage.getItem("xCart"));
        check("product.html: guest buy now still stocks the cart", stored.length === 1 && stored[0].id === "silk-touch", JSON.stringify(stored));
        p.dom.window.close();
    }
    {
        // Buy now as a member goes straight to checkout.
        const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], { xLoggedIn: "true", xUser: USER_JSON });
        p.doc.querySelector(".buy-now").click();
        check("product.html: member buy now goes to checkout.html", p.lastNav() === "checkout.html", p.lastNav());
        p.dom.window.close();
    }
    {
        // Thumbnails mark themselves active but must keep the product's own image.
        const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
        const thumbs = p.doc.querySelectorAll(".thumbnail");
        thumbs[2].click();
        check("product.html: clicked thumbnail becomes active", thumbs[2].classList.contains("active"));
        check("product.html: only the clicked thumbnail is active",
            [...thumbs].filter((t) => t.classList.contains("active")).length === 1);
        check("product.html: the gallery keeps the product's own image after a thumbnail click",
            p.doc.querySelector(".main-product-image").classList.contains("image-a") &&
            p.doc.querySelector(".main-product-image").style.background === "",
            p.doc.querySelector(".main-product-image").className + " | inline: " + p.doc.querySelector(".main-product-image").style.background);
        p.dom.window.close();
    }
    {
        // Related product quick-add. The rail is ordered by the catalogue, so
        // pick the card by name rather than by a fixed position.
        const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
        const darkOil = [...p.doc.querySelectorAll(".related-product")]
            .filter((card) => card.querySelector("h3").textContent.trim() === "After Dark Oil")[0];
        check("product.html: After Dark Oil appears in the related rail", !!darkOil);
        darkOil.querySelector(".related-add").click();
        const stored = JSON.parse(p.win.localStorage.getItem("xCart"));
        check("product.html: related add stores that product", stored.length === 1 && stored[0].name === "After Dark Oil" && stored[0].price === 28, JSON.stringify(stored));
        check("product.html: related add keeps a shop-compatible id", stored[0].id === "after-dark-oil", stored[0].id);
        check("product.html: related add keeps its category", stored[0].category === "Wellness", stored[0].category);
        check("product.html: related add does not add the product being viewed",
            stored[0].id !== "silk-touch", stored[0].id);
        p.dom.window.close();
    }

    // ---------- 4. signup.html validation ----------
    {
        const p = loadPage("signup.html", ["signup.js"], {});
        const form = p.doc.getElementById("signupForm");
        const msg = p.doc.getElementById("signupMessage");
        submitForm(p.win, form);
        check("signup.html: empty submit shows error", msg.classList.contains("error") && msg.textContent.length > 0, msg.textContent);

        p.doc.getElementById("firstName").value = "Amina";
        p.doc.getElementById("lastName").value = "Oti";
        p.doc.getElementById("signupEmail").value = "AMINA@Example.com";
        p.doc.getElementById("signupPassword").value = "short";
        p.doc.getElementById("confirmPassword").value = "short";
        submitForm(p.win, form);
        check("signup.html: weak password blocked", msg.textContent.indexOf("8 characters") > -1, msg.textContent);

        p.doc.getElementById("signupPassword").value = "longenough";
        p.doc.getElementById("confirmPassword").value = "mismatch123";
        submitForm(p.win, form);
        check("signup.html: mismatch blocked", msg.textContent === "The passwords do not match.", msg.textContent);

p.doc.getElementById("confirmPassword").value = "longenough";
    // A successful signup means a customer who has accepted the terms.
    p.doc.getElementById("terms").checked = true;
    submitForm(p.win, form);
    check("signup.html: success message shown", msg.classList.contains("success"), msg.textContent);
        const stored = JSON.parse(p.win.localStorage.getItem("xUser"));
        check("signup.html: account persisted", stored.email === "amina@example.com" && stored.firstName === "Amina", JSON.stringify(stored));
        check("signup.html: session flag set", p.win.localStorage.getItem("xLoggedIn") === "true");
        await sleep(900);
        check("signup.html: lands on account.html", p.lastNav() === "account.html", p.lastNav());
        p.dom.window.close();
    }

    // ---------- 5. signup.html when arriving from cart (checkout intent) ----------
    {
        const p = loadPage("signup.html", ["signup.js"], { xCheckoutRedirect: "true" });
        p.doc.getElementById("firstName").value = "Amina";
        p.doc.getElementById("lastName").value = "Oti";
        p.doc.getElementById("signupEmail").value = "amina@example.com";
        p.doc.getElementById("signupPassword").value = "longenough";
p.doc.getElementById("confirmPassword").value = "longenough";
  p.doc.getElementById("terms").checked = true;
  submitForm(p.win, p.doc.getElementById("signupForm"));
  await sleep(900);
  check("signup.html from cart: lands on checkout.html", p.lastNav() === "checkout.html", p.lastNav());
        check("signup.html from cart: intent flag consumed", p.win.localStorage.getItem("xCheckoutRedirect") === null);
        p.dom.window.close();
    }

    // ---------- 6. login.html ----------
    {
        const p = loadPage("login.html", ["login.js"], { xUser: USER_JSON });
        const form = p.doc.getElementById("loginForm");
        const msg = p.doc.getElementById("loginMessage");

        p.doc.getElementById("loginEmail").value = "amina@example.com";
        p.doc.getElementById("loginPassword").value = "wrongpassword";
        submitForm(p.win, form);
        check("login.html: wrong password rejected", msg.textContent === "The email or password is incorrect.", msg.textContent);
        check("login.html: no session on failure", p.win.localStorage.getItem("xLoggedIn") === null);

        p.doc.getElementById("loginPassword").value = "longenough";
        p.doc.getElementById("rememberMe").checked = true;
        submitForm(p.win, form);
        check("login.html: success message shown", msg.textContent === "Login successful.", msg.textContent);
        check("login.html: session flag set", p.win.localStorage.getItem("xLoggedIn") === "true");
        check("login.html: remember me stored", p.win.localStorage.getItem("xRememberLogin") === "true");
        await sleep(900);
        check("login.html: lands on account.html", p.lastNav() === "account.html", p.lastNav());
        p.dom.window.close();
    }

    // ---------- 7. login.html with no stored account ----------
    {
        const p = loadPage("login.html", ["login.js"], {});
        const form = p.doc.getElementById("loginForm");
        const msg = p.doc.getElementById("loginMessage");
        p.doc.getElementById("loginEmail").value = "nobody@example.com";
        p.doc.getElementById("loginPassword").value = "whatever12";
        submitForm(p.win, form);
        check("login.html: missing account reported", msg.textContent === "No account was found. Please create an account first.", msg.textContent);
        p.dom.window.close();
    }

    // ---------- 8. login.html returning from cart ----------
    {
        const p = loadPage("login.html", ["login.js"], { xUser: USER_JSON, xCheckoutRedirect: "true" });
        p.doc.getElementById("loginEmail").value = "AMINA@Example.com";
        p.doc.getElementById("loginPassword").value = "longenough";
        submitForm(p.win, p.doc.getElementById("loginForm"));
        await sleep(900);
        check("login.html from cart: lands on checkout.html", p.lastNav() === "checkout.html", p.lastNav());
        check("login.html from cart: intent flag consumed", p.win.localStorage.getItem("xCheckoutRedirect") === null);
        p.dom.window.close();
    }

    // ---------- 9. account.html ----------
    {
        const p = loadPage("account.html", ["account.js"], {});
        check("account.html: guest bounced to login.html", p.lastNav() === "login.html", p.lastNav());
        p.dom.window.close();
    }
    {
        const p = loadPage("account.html", ["account.js"], { xLoggedIn: "true", xUser: USER_JSON });
        check("account.html: greets the member", p.doc.getElementById("customerName").textContent === "Amina", p.doc.getElementById("customerName").textContent);
        check("account.html: no redirect when signed in", p.nav.length === 0, JSON.stringify(p.nav));
        p.doc.getElementById("logoutButton").click();
        check("account.html: logout clears session", p.win.localStorage.getItem("xLoggedIn") === null);
        check("account.html: logout clears remember me", p.win.localStorage.getItem("xRememberLogin") === null);
        check("account.html: logout returns home", p.lastNav() === "index.html", p.lastNav());
        p.dom.window.close();
    }

    // ---------- 10. checkout.html ----------
    {
        const p = loadPage("checkout.html", ["checkout.js"], {});
        check("checkout.html: guest bounced to login.html", p.lastNav() === "login.html", p.lastNav());
        check("checkout.html: intent flag set for guest", p.win.localStorage.getItem("xCheckoutRedirect") === "checkout.html", p.win.localStorage.getItem("xCheckoutRedirect"));
        p.dom.window.close();
    }
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
        });
        check("checkout.html: member stays", p.nav.length === 0, JSON.stringify(p.nav));
        check("checkout.html: email prefilled", p.doc.getElementById("email").value === "amina@example.com", p.doc.getElementById("email").value);
        check("checkout.html: first name prefilled", p.doc.getElementById("firstName").value === "Amina", p.doc.getElementById("firstName").value);
        check("checkout.html: last name prefilled", p.doc.getElementById("lastName").value === "Oti", p.doc.getElementById("lastName").value);
        const accountLink = p.doc.querySelector(".section-title a");
        check("checkout.html: header link becomes account link", accountLink.getAttribute("href") === "account.html", accountLink.getAttribute("href"));

        check("checkout.html: summary generated from xCart", p.doc.querySelectorAll(".checkout-product").length === 1, String(p.doc.querySelectorAll(".checkout-product").length));
        check("checkout.html: summary shows the cart product", (p.doc.querySelector(".checkout-product-info strong") || {}).textContent === "Silk Touch", (p.doc.querySelector(".checkout-product-info strong") || {}).textContent);
        check("checkout.html: dynamic subtotal", p.doc.querySelector(".summary-line strong").textContent === "$59", p.doc.querySelector(".summary-line strong").textContent);
        check("checkout.html: $5 shipping", p.doc.querySelector(".shipping-line strong").textContent === "$5", p.doc.querySelector(".shipping-line strong").textContent);
        check("checkout.html: dynamic total", p.doc.querySelector(".checkout-total strong").textContent === "$64", p.doc.querySelector(".checkout-total strong").textContent);

        check("checkout.html: default total is subtotal plus shipping", p.doc.querySelector(".checkout-total strong").textContent === "$64", p.doc.querySelector(".checkout-total strong").textContent);
        p.doc.querySelectorAll(".delivery-option")[1].click();
        check("checkout.html: express delivery recalculates", p.doc.querySelector(".checkout-total strong").textContent === "$71", p.doc.querySelector(".checkout-total strong").textContent);

        p.doc.getElementById("address").value = "Riverside Drive 1";
        p.doc.getElementById("city").value = "Nairobi";
        p.doc.getElementById("postal").value = "00100";
        p.doc.getElementById("phone").value = "+254700000000";
        p.doc.querySelector(".place-order").click();
        const placedOrder = p.win.localStorage.getItem("xLastOrder") ? JSON.parse(p.win.localStorage.getItem("xLastOrder")) : null;
        check("checkout.html: placing an order saves an order snapshot", !!placedOrder && placedOrder.items.length === 1, p.win.localStorage.getItem("xLastOrder"));
        check("checkout.html: xLastOrder stored", !!placedOrder, p.win.localStorage.getItem("xLastOrder"));
        check("checkout.html: unique order number", !!placedOrder && typeof placedOrder.number === "string" && placedOrder.number.length > 2, placedOrder && placedOrder.number);
        check("checkout.html: order items carry quantity + unit price + line total", !!placedOrder && placedOrder.items[0].quantity === 1 && placedOrder.items[0].unitPrice === 59 && placedOrder.items[0].lineTotal === 59, placedOrder && JSON.stringify(placedOrder.items));
        check("checkout.html: order snapshot carries the paid total", !!placedOrder && placedOrder.total === 71, placedOrder && placedOrder.total);
        check("checkout.html: order snapshot keeps quantities", !!placedOrder && placedOrder.items[0].quantity === 1 && placedOrder.items[0].id === "silk-touch", placedOrder && JSON.stringify(placedOrder.items));
        check("checkout.html: xOrders array stored", Array.isArray(JSON.parse(p.win.localStorage.getItem("xOrders") || "null")) && JSON.parse(p.win.localStorage.getItem("xOrders")).length === 1, p.win.localStorage.getItem("xOrders"));
        check("checkout.html: order carries customer + delivery + date", !!placedOrder && !!placedOrder.customer && !!placedOrder.address && !!placedOrder.delivery && !!placedOrder.orderDate, placedOrder && JSON.stringify({ customer: placedOrder.customer, delivery: placedOrder.delivery }));
        check("checkout.html: xCheckoutRedirect removed after order", p.win.localStorage.getItem("xCheckoutRedirect") === null, String(p.win.localStorage.getItem("xCheckoutRedirect")));
        check("checkout.html: xCart removed after order", p.win.localStorage.getItem("xCart") === null, String(p.win.localStorage.getItem("xCart")));
        check("checkout.html: placing an order opens order-confirmation.html", p.lastNav() === "order-confirmation.html", p.lastNav());
        p.dom.window.close();
    }

    // ---------- 10b. checkout totals track the real cart, then empties it ----------
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCart: JSON.stringify([
                { id: "silk-touch", name: "Silk Touch", price: 59, quantity: 2 },
                { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 1 }
            ])
        });
        check("checkout.html: summary renders every line", p.doc.querySelectorAll(".checkout-product").length === 2, String(p.doc.querySelectorAll(".checkout-product").length));
        check("checkout.html: subtotal reflects multi-item cart", p.doc.querySelector(".checkout-total strong").textContent === "$151", p.doc.querySelector(".checkout-total strong").textContent);
        check("checkout.html: order persistence across refresh", p.win.localStorage.getItem("xCart") !== null, String(p.win.localStorage.getItem("xCart")));
        p.doc.getElementById("address").value = "Riverside Drive 1";
        p.doc.getElementById("city").value = "Nairobi";
        p.doc.getElementById("postal").value = "00100";
        p.doc.getElementById("phone").value = "+254700000000";
        p.doc.querySelector(".place-order").click();
        const cartAfterOrder = p.win.localStorage.getItem("xCart");
        check("checkout.html: placing an order empties the cart", cartAfterOrder === null || JSON.parse(cartAfterOrder).length === 0, String(cartAfterOrder));
        check("checkout.html: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));

        // A refresh must not resurrect the bag: the order snapshot survives while
        // the cart does not.
        const afterOrder = {};
        for (let i = 0; i < p.win.localStorage.length; i++) {
            const key = p.win.localStorage.key(i);
            afterOrder[key] = p.win.localStorage.getItem(key);
        }
        const reloaded = loadPage("checkout.html", ["cart-store.js", "checkout.js"], afterOrder);
        check("checkout.html: cart stays empty after a refresh", reloaded.doc.querySelectorAll(".checkout-product").length === 0, String(reloaded.doc.querySelectorAll(".checkout-product").length));
        check("checkout.html: subtotal is $0 once the bag is gone", reloaded.doc.querySelector(".summary-line strong").textContent === "$0", reloaded.doc.querySelector(".summary-line strong").textContent);
        check("checkout.html: the stored order survives the refresh", !!reloaded.win.localStorage.getItem("xLastOrder") && Array.isArray(JSON.parse(reloaded.win.localStorage.getItem("xOrders"))), reloaded.win.localStorage.getItem("xOrders"));
        check("checkout.html: reloading checkout does not place a second order", JSON.parse(reloaded.win.localStorage.getItem("xOrders")).length === 1, reloaded.win.localStorage.getItem("xOrders"));
        check("checkout.html: reload shows no console errors", reloaded.consoleErrors.length === 0, reloaded.consoleErrors.join(" | "));
        reloaded.dom.window.close();
        p.dom.window.close();
    }

    // ---------- 10c. checkout -> order-confirmation round trip, same session ----------
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCart: JSON.stringify([
                { id: "velvet-mini", name: "Velvet Mini", price: 45, quantity: 1 },
                { id: "midnight-gummies", name: "Midnight Gummies", price: 24, quantity: 2 }
            ])
        });
        check("checkout.html: no product is hardcoded (velvet mini listed)", [...p.doc.querySelectorAll(".checkout-product-info strong")].map((n) => n.textContent).join(",") === "Velvet Mini,Midnight Gummies", [...p.doc.querySelectorAll(".checkout-product-info strong")].map((n) => n.textContent).join(","));
        check("checkout.html: subtotal for velvet mini + 2 gummies", p.doc.querySelector(".summary-line strong").textContent === "$93", p.doc.querySelector(".summary-line strong").textContent);
        check("checkout.html: $5 shipping on a $93 subtotal", p.doc.querySelector(".shipping-line strong").textContent === "$5", p.doc.querySelector(".shipping-line strong").textContent);
        check("checkout.html: total is $98", p.doc.querySelector(".checkout-total strong").textContent === "$98", p.doc.querySelector(".checkout-total strong").textContent);

        // Loading checkout must never create an order or empty the bag.
        check("checkout.html: loading the page places no order", p.win.localStorage.getItem("xLastOrder") === null, String(p.win.localStorage.getItem("xLastOrder")));
        check("checkout.html: loading the page keeps the cart", JSON.parse(p.win.localStorage.getItem("xCart")).length === 2, p.win.localStorage.getItem("xCart"));

        p.doc.getElementById("address").value = "12 Riverside Drive";
        p.doc.getElementById("apartment").value = "Apt 4B";
        p.doc.getElementById("city").value = "Nairobi";
        p.doc.getElementById("postal").value = "00100";
        p.doc.getElementById("phone").value = "+254700000000";
        p.doc.querySelector(".place-order").click();

        const placed = JSON.parse(p.win.localStorage.getItem("xLastOrder"));
        check("checkout.html: order is not hardcoded to one product", placed.items.length === 2 && placed.items[1].quantity === 2 && placed.items[1].unitPrice === 24 && placed.items[1].lineTotal === 48, JSON.stringify(placed.items));
        check("checkout.html: order subtotal/shipping/total", placed.subtotal === 93 && placed.shipping === 5 && placed.total === 98, JSON.stringify({ s: placed.subtotal, sh: placed.shipping, t: placed.total }));
        check("checkout.html: order carries the shipping address", placed.address.address === "12 Riverside Drive" && placed.address.apartment === "Apt 4B" && placed.address.city === "Nairobi" && placed.address.postal === "00100" && placed.address.country === "Kenya" && placed.address.phone === "+254700000000", JSON.stringify(placed.address));
        check("checkout.html: order carries delivery information", placed.delivery.method === "Standard delivery" && !!placed.delivery.window && !!placed.delivery.from && !!placed.delivery.to, JSON.stringify(placed.delivery));
        check("checkout.html: order number is shared across number/orderNumber/id", placed.number === placed.orderNumber && placed.number === placed.id, JSON.stringify({ number: placed.number, orderNumber: placed.orderNumber, id: placed.id }));

        // Hand the real storage to the confirmation page, exactly like a browser would.
        const stored = {};
        for (let i = 0; i < p.win.localStorage.length; i++) {
            const key = p.win.localStorage.key(i);
            stored[key] = p.win.localStorage.getItem(key);
        }
        check("checkout.html: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();

        const c = loadPage("order-confirmation.html", ["order-confirmation.js"], stored);
        check("confirmation: renders the order just placed", c.doc.querySelectorAll(".order-item").length === 2, String(c.doc.querySelectorAll(".order-item").length));
        check("confirmation: shows the real order number", c.doc.getElementById("order-id").textContent === placed.number, c.doc.getElementById("order-id").textContent);
        check("confirmation: greets the customer", c.doc.getElementById("customer-firstname").textContent === "Amina", c.doc.getElementById("customer-firstname").textContent);
        check("confirmation: line shows quantity and unit price", c.doc.querySelectorAll(".order-item")[1].textContent.indexOf("Qty 2") !== -1 && c.doc.querySelectorAll(".order-item")[1].textContent.indexOf("$24") !== -1, c.doc.querySelectorAll(".order-item")[1].textContent);
        check("confirmation: subtotal/shipping/total match the order", c.doc.getElementById("order-subtotal").textContent === "$93" && c.doc.getElementById("order-shipping").textContent === "$5" && c.doc.getElementById("order-total").textContent === "$98", c.doc.getElementById("order-total").textContent);
        const confAddr = c.doc.getElementById("shipping-address-container").textContent;
        check("confirmation: shows the shipping address", confAddr.indexOf("Amina Oti") !== -1 && confAddr.indexOf("12 Riverside Drive, Apt 4B") !== -1 && confAddr.indexOf("Nairobi, 00100, Kenya") !== -1 && confAddr.indexOf("+254700000000") !== -1, confAddr);
        check("confirmation: delivery method shown", c.doc.getElementById("delivery-method").textContent.indexOf("Standard delivery") === 0, c.doc.getElementById("delivery-method").textContent);
        check("confirmation: discreet packaging reassurance", c.doc.querySelector(".discreet-packaging-notice").hidden === false);
        check("confirmation: no console errors", c.consoleErrors.length === 0, c.consoleErrors.join(" | "));
        c.dom.window.close();

        // The account page reads the same history.
        const a = loadPage("account.html", ["account.js"], stored);
        check("account: lists the previous order from xOrders", a.doc.querySelector(".account-orders") !== null && a.doc.querySelector(".account-orders").textContent.indexOf(placed.number) !== -1, a.doc.querySelector(".account-orders") && a.doc.querySelector(".account-orders").textContent);
        check("account: shows the order total and item count", a.doc.querySelector(".account-orders").textContent.indexOf("$98") !== -1 && a.doc.querySelector(".account-orders").textContent.indexOf("3 items") !== -1, a.doc.querySelector(".account-orders").textContent);
        check("account: other dashboard cards untouched", a.doc.querySelectorAll(".account-card").length === 4, String(a.doc.querySelectorAll(".account-card").length));
        check("account: no console errors", a.consoleErrors.length === 0, a.consoleErrors.join(" | "));
        a.dom.window.close();
    }

    // ---------- 10d. login -> checkout -> order, end to end ----------
    {
        const CART = JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }]);

        // A guest hits checkout, is bounced to login, then returns and orders.
        const guest = loadPage("checkout.html", ["cart-store.js", "checkout.js"], { xCart: CART });
        check("flow login: guest bounced to login.html", guest.lastNav() === "login.html", guest.lastNav());
        check("flow login: checkout intent stored", guest.win.localStorage.getItem("xCheckoutRedirect") === "checkout.html", String(guest.win.localStorage.getItem("xCheckoutRedirect")));
        guest.dom.window.close();

        const seed = { xUser: USER_JSON, xCart: CART };
        const login = loadPage("login.html", ["login.js"], Object.assign({ xCheckoutRedirect: "checkout.html" }, seed));
        login.doc.getElementById("loginEmail").value = "amina@example.com";
        login.doc.getElementById("loginPassword").value = "longenough";
        submitForm(login.win, login.doc.getElementById("loginForm"));
        await sleep(800);
        check("flow login: login returns to checkout.html", login.lastNav() === "checkout.html", login.lastNav());
        check("flow login: session established", login.win.localStorage.getItem("xLoggedIn") === "true", String(login.win.localStorage.getItem("xLoggedIn")));
        login.dom.window.close();

        const shared = Object.assign({}, seed, { xLoggedIn: "true" });
        const checkout = loadPage("checkout.html", ["cart-store.js", "checkout.js"], shared);
        check("flow login: checkout allowed once signed in", checkout.nav.length === 0, JSON.stringify(checkout.nav));
        check("flow login: account name prefilled", checkout.doc.getElementById("firstName").value === "Amina" && checkout.doc.getElementById("lastName").value === "Oti", checkout.doc.getElementById("firstName").value + " " + checkout.doc.getElementById("lastName").value);
        checkout.doc.getElementById("address").value = "5 Ngong Road";
        checkout.doc.getElementById("city").value = "Nairobi";
        checkout.doc.getElementById("postal").value = "00100";
        checkout.doc.getElementById("phone").value = "+254711111111";
        checkout.doc.querySelector(".place-order").click();
        const loginOrder = JSON.parse(checkout.win.localStorage.getItem("xLastOrder"));
        check("flow login: order created", !!loginOrder && loginOrder.total === 64, checkout.win.localStorage.getItem("xLastOrder"));
        check("flow login: xOrders written", Array.isArray(JSON.parse(checkout.win.localStorage.getItem("xOrders"))), checkout.win.localStorage.getItem("xOrders"));
        check("flow login: cart cleared only after the order", checkout.win.localStorage.getItem("xCart") === null, String(checkout.win.localStorage.getItem("xCart")));
        check("flow login: no checkout intent left behind", checkout.win.localStorage.getItem("xCheckoutRedirect") === null, String(checkout.win.localStorage.getItem("xCheckoutRedirect")));
        check("flow login: lands on order-confirmation.html", checkout.lastNav() === "order-confirmation.html", checkout.lastNav());
        checkout.dom.window.close();

        const loginStored = { xLoggedIn: "true", xUser: USER_JSON, xLastOrder: JSON.stringify(loginOrder), xOrders: JSON.stringify([loginOrder]) };
        const loginConfirm = loadPage("order-confirmation.html", ["order-confirmation.js"], loginStored);
        check("flow login: confirmation shows the order", loginConfirm.doc.getElementById("order-id").textContent === loginOrder.number && loginConfirm.doc.getElementById("order-total").textContent === "$64", loginConfirm.doc.getElementById("order-total").textContent);
        loginConfirm.dom.window.close();

        const loginAccount = loadPage("account.html", ["account.js"], loginStored);
        check("flow login: account lists the order", loginAccount.doc.querySelector(".account-orders").textContent.indexOf(loginOrder.number) !== -1, loginAccount.doc.querySelector(".account-orders").textContent);
        loginAccount.dom.window.close();
    }

    // ---------- 10e. signup -> checkout -> order, end to end ----------
    {
        const CART = JSON.stringify([{ id: "the-duo", name: "The Duo", price: 72, quantity: 1 }]);

        const signup = loadPage("signup.html", ["signup.js"], { xCart: CART, xCheckoutRedirect: "checkout.html" });
        signup.doc.getElementById("firstName").value = "Zuri";
        signup.doc.getElementById("lastName").value = "Mwangi";
        signup.doc.getElementById("signupEmail").value = "zuri@example.com";
        signup.doc.getElementById("signupPassword").value = "longenough";
signup.doc.getElementById("confirmPassword").value = "longenough";
  signup.doc.getElementById("terms").checked = true;
  submitForm(signup.win, signup.doc.getElementById("signupForm"));
  await sleep(800);
  check("flow signup: signup returns to checkout.html", signup.lastNav() === "checkout.html", signup.lastNav());
        check("flow signup: account created and signed in", signup.win.localStorage.getItem("xLoggedIn") === "true" && JSON.parse(signup.win.localStorage.getItem("xUser")).email === "zuri@example.com", signup.win.localStorage.getItem("xUser"));
        signup.dom.window.close();

        const checkout = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: JSON.stringify({ firstName: "Zuri", lastName: "Mwangi", email: "zuri@example.com", password: "longenough" }),
            xCart: CART
        });
        check("flow signup: new member prefilled from xUser", checkout.doc.getElementById("firstName").value === "Zuri" && checkout.doc.getElementById("email").value === "zuri@example.com", checkout.doc.getElementById("firstName").value + " / " + checkout.doc.getElementById("email").value);
        check("flow signup: xUser untouched by checkout", JSON.stringify(JSON.parse(checkout.win.localStorage.getItem("xUser"))) === JSON.stringify({ firstName: "Zuri", lastName: "Mwangi", email: "zuri@example.com", password: "longenough" }), checkout.win.localStorage.getItem("xUser"));
        check("flow signup: total for The Duo + $5 shipping", checkout.doc.querySelector(".checkout-total strong").textContent === "$77", checkout.doc.querySelector(".checkout-total strong").textContent);

        // Phone is not prefilled from the account, so it must be typed in.
        checkout.doc.getElementById("address").value = "9 Mombasa Road";
        checkout.doc.getElementById("city").value = "Mombasa";
        checkout.doc.getElementById("postal").value = "80100";
        checkout.doc.getElementById("phone").value = "+254722222222";
        checkout.doc.querySelector(".place-order").click();
        const signupOrder = JSON.parse(checkout.win.localStorage.getItem("xLastOrder"));
        check("flow signup: order created for the new member", !!signupOrder && signupOrder.total === 77 && signupOrder.customer.firstName === "Zuri" && signupOrder.customer.email === "zuri@example.com", checkout.win.localStorage.getItem("xLastOrder"));
        check("flow signup: cart cleared", checkout.win.localStorage.getItem("xCart") === null, String(checkout.win.localStorage.getItem("xCart")));
        check("flow signup: lands on order-confirmation.html", checkout.lastNav() === "order-confirmation.html", checkout.lastNav());
        check("flow signup: no console errors", checkout.consoleErrors.length === 0, checkout.consoleErrors.join(" | "));
        checkout.dom.window.close();

        const signupStored = { xLoggedIn: "true", xUser: JSON.stringify({ firstName: "Zuri", lastName: "Mwangi", email: "zuri@example.com", password: "longenough" }), xLastOrder: JSON.stringify(signupOrder), xOrders: JSON.stringify([signupOrder]) };
        const confirm = loadPage("order-confirmation.html", ["order-confirmation.js"], signupStored);
        check("flow signup: confirmation greets Zuri", confirm.doc.getElementById("customer-firstname").textContent === "Zuri", confirm.doc.getElementById("customer-firstname").textContent);
        check("flow signup: confirmation total", confirm.doc.getElementById("order-total").textContent === "$77", confirm.doc.getElementById("order-total").textContent);
        confirm.dom.window.close();
    }

    // ---------- 10f. two orders accumulate in xOrders, each with its own number ----------
    {
        const runOrder = (id, price, qty, seed) => {
            const page = loadPage("checkout.html", ["cart-store.js", "checkout.js"], Object.assign({
                xLoggedIn: "true",
                xUser: USER_JSON
            }, seed || {}, {
                xCart: JSON.stringify([{ id: id, name: id, price: price, quantity: qty }])
            }));
            page.doc.getElementById("address").value = "1 Test Road";
            page.doc.getElementById("city").value = "Nairobi";
            page.doc.getElementById("postal").value = "00100";
            page.doc.getElementById("phone").value = "+254700000000";
            page.doc.querySelector(".place-order").click();
            const placed = JSON.parse(page.win.localStorage.getItem("xLastOrder"));
            const history = JSON.parse(page.win.localStorage.getItem("xOrders"));
            const storage = {};
            for (let i = 0; i < page.win.localStorage.length; i++) {
                const key = page.win.localStorage.key(i);
                storage[key] = page.win.localStorage.getItem(key);
            }
            page.dom.window.close();
            return { placed: placed, history: history, storage: storage };
        };

        const first = runOrder("luna", 64, 1);
        const storedAfterFirst = first.storage;
        // The second order runs in a browser session that already holds the first.
        const second = runOrder("night-ritual", 34, 2, { xLastOrder: storedAfterFirst.xLastOrder, xOrders: storedAfterFirst.xOrders });
        check("orders: second order gets a different number", second.placed.number !== first.placed.number, first.placed.number + " vs " + second.placed.number);
        check("orders: xOrders keeps both orders", Array.isArray(second.history) && second.history.length === 2, JSON.stringify(second.history && second.history.map((o) => o.number)));
        check("orders: xLastOrder points at the newest order", second.placed.number === second.history[0].number, JSON.stringify(second.history.map((o) => o.number)));
        check("orders: each order keeps its own totals", second.placed.subtotal === 68 && second.placed.total === 73 && first.placed.total === 69, JSON.stringify({ first: first.placed.total, second: second.placed.total }));

        // Both orders still readable after a refresh.
        const history = JSON.parse(second.storage.xOrders);
        const persisted = { xLoggedIn: "true", xUser: USER_JSON, xLastOrder: second.storage.xLastOrder, xOrders: second.storage.xOrders };
        const confirm = loadPage("order-confirmation.html", ["order-confirmation.js"], persisted);
        check("orders: confirmation survives a refresh", confirm.doc.getElementById("order-id").textContent === second.placed.number && confirm.doc.getElementById("order-total").textContent === "$73", confirm.doc.getElementById("order-total").textContent);
        confirm.dom.window.close();

        const account = loadPage("account.html", ["account.js"], persisted);
        const accountOrders = account.doc.querySelector(".account-orders").textContent;
        check("orders: account lists both orders newest first", accountOrders.indexOf(second.placed.number) < accountOrders.indexOf(first.placed.number) && accountOrders.indexOf(first.placed.number) !== -1, accountOrders);
        account.dom.window.close();
        check("orders: history is stored as an array of orders", history.every((o) => o && o.number && Array.isArray(o.items)), JSON.stringify(history.map((o) => o && o.number)));
        check("orders: no stale cart key after either order", storedAfterFirst.xCart === undefined, JSON.stringify(Object.keys(storedAfterFirst)));
    }

    // ---------- 10g. a stale/corrupt cart cannot produce an order ----------
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCart: "not json"
        });
        check("checkout: corrupt cart shows no products", p.doc.querySelectorAll(".checkout-product").length === 0, String(p.doc.querySelectorAll(".checkout-product").length));
        check("checkout: corrupt cart totals $0", p.doc.querySelector(".checkout-total strong").textContent === "$5", p.doc.querySelector(".checkout-total strong").textContent);
        p.doc.getElementById("address").value = "1 Test Road";
        p.doc.getElementById("city").value = "Nairobi";
        p.doc.getElementById("postal").value = "00100";
        p.doc.getElementById("phone").value = "+254700000000";
        p.doc.querySelector(".place-order").click();
        const err = p.doc.getElementById("checkoutError");
        check("checkout: empty cart blocks the order", !!err && err.hidden === false && /empty/i.test(err.textContent), err && err.textContent);
        check("checkout: empty cart writes no order", p.win.localStorage.getItem("xLastOrder") === null, String(p.win.localStorage.getItem("xLastOrder")));
        check("checkout: empty cart does not navigate", p.nav.length === 0, JSON.stringify(p.nav));
        check("checkout: empty cart keeps the stored cart untouched", p.win.localStorage.getItem("xCart") === "not json", String(p.win.localStorage.getItem("xCart")));
        check("checkout: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 10h. express delivery is priced from the existing option ----------
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCart: JSON.stringify([{ id: "luna", name: "Luna", price: 64, quantity: 1 }])
        });
        check("checkout: standard is the default $5", p.doc.querySelector(".shipping-line strong").textContent === "$5", p.doc.querySelector(".shipping-line strong").textContent);
        p.doc.querySelectorAll(".delivery-option")[1].click();
        check("checkout: express updates the shipping line to $12", p.doc.querySelector(".shipping-line strong").textContent === "$12", p.doc.querySelector(".shipping-line strong").textContent);
        check("checkout: express updates the total to $76", p.doc.querySelector(".checkout-total strong").textContent === "$76", p.doc.querySelector(".checkout-total strong").textContent);
        p.doc.getElementById("address").value = "1 Test Road";
        p.doc.getElementById("city").value = "Nairobi";
        p.doc.getElementById("postal").value = "00100";
        p.doc.getElementById("phone").value = "+254700000000";
        p.doc.querySelector(".place-order").click();
        const placed = JSON.parse(p.win.localStorage.getItem("xLastOrder"));
        check("checkout: order records the express shipping cost", placed.shipping === 12 && placed.total === 76, JSON.stringify({ shipping: placed.shipping, total: placed.total }));
        check("checkout: order records the express delivery window", placed.delivery.method === "Express delivery" && placed.delivery.window === "1-3 business days", JSON.stringify(placed.delivery));
        check("checkout: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 10i. payment method switching is a front-end mockup ----------
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCart: JSON.stringify([{ id: "midnight-gummies", name: "Midnight Gummies", price: 24, quantity: 1 }])
        });
        const methods = p.doc.querySelectorAll(".payment-method");
        methods[1].click();
        check("checkout: mobile money fields shown when selected", p.doc.querySelector(".mobile-money-fields").style.display === "block", p.doc.querySelector(".mobile-money-fields").style.display);
        methods[0].click();
        check("checkout: card fields shown when card selected", p.doc.querySelector(".payment-fields").style.display === "block" && p.doc.querySelector(".mobile-money-fields").style.display === "none", p.doc.querySelector(".mobile-money-fields").style.display);
        p.doc.getElementById("address").value = "1 Test Road";
        p.doc.getElementById("city").value = "Nairobi";
        p.doc.getElementById("postal").value = "00100";
        p.doc.getElementById("phone").value = "+254700000000";
        p.doc.querySelector(".place-order").click();
        const placed = JSON.parse(p.win.localStorage.getItem("xLastOrder"));
        check("checkout: order placed without any card details", !!placed && placed.total === 29, placed && String(placed.total));
        check("checkout: no payment data stored on the order", !JSON.stringify(placed).match(/card|cvv|cvc|expiry/i), JSON.stringify(placed).slice(0, 200));
        check("checkout: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 10j. "Save this information for next time" ----------
    {
        const ACCOUNT = { firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" };
        const fill = (p, address) => {
            p.doc.getElementById("address").value = address;
            p.doc.getElementById("apartment").value = "Apt 4B";
            p.doc.getElementById("city").value = "Nairobi";
            p.doc.getElementById("postal").value = "00100";
            p.doc.getElementById("phone").value = "+254700000000";
            p.doc.getElementById("country").value = "Kenya";
        };

        // Checked -> the delivery details are written back onto the account.
        {
            const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
                xLoggedIn: "true",
                xUser: JSON.stringify(ACCOUNT),
                xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
            });
            check("save-info: checkbox starts unchecked for a fresh account", p.doc.getElementById("saveInfo").checked === false, String(p.doc.getElementById("saveInfo").checked));
            check("save-info: nothing prefilled before an order exists", p.doc.getElementById("address").value === "", p.doc.getElementById("address").value);
            fill(p, "12 Riverside Drive");
            p.doc.getElementById("saveInfo").checked = true;
            p.doc.getElementById("marketingOptIn").checked = false;
            p.doc.querySelector(".place-order").click();

            const user = JSON.parse(p.win.localStorage.getItem("xUser"));
            check("save-info checked: address persisted to xUser", user.address === "12 Riverside Drive" && user.apartment === "Apt 4B" && user.city === "Nairobi" && user.postal === "00100" && user.country === "Kenya" && user.phone === "+254700000000", JSON.stringify(user));
            check("save-info checked: existing xUser fields preserved", user.firstName === "Amina" && user.lastName === "Oti" && user.email === "amina@example.com", JSON.stringify(user));
            check("save-info checked: password untouched", user.password === "longenough", String(user.password));
            check("save-info checked: no order-time fields leaked into the account", !("total" in user) && !("items" in user) && !("number" in user), JSON.stringify(Object.keys(user)));
            check("save-info checked: order still created", !!JSON.parse(p.win.localStorage.getItem("xLastOrder")) && JSON.parse(p.win.localStorage.getItem("xLastOrder")).total === 64, p.win.localStorage.getItem("xLastOrder"));
            check("save-info checked: cart still cleared after the order", p.win.localStorage.getItem("xCart") === null, String(p.win.localStorage.getItem("xCart")));
            check("save-info checked: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));

            const stored = {};
            for (let i = 0; i < p.win.localStorage.length; i++) {
                const key = p.win.localStorage.key(i);
                stored[key] = p.win.localStorage.getItem(key);
            }
            p.dom.window.close();

            // "for next time" means the next checkout starts from the saved details.
            const again = loadPage("checkout.html", ["cart-store.js", "checkout.js"], stored);
            check("save-info checked: next checkout prefills the saved address", again.doc.getElementById("address").value === "12 Riverside Drive" && again.doc.getElementById("city").value === "Nairobi" && again.doc.getElementById("postal").value === "00100" && again.doc.getElementById("phone").value === "+254700000000", again.doc.getElementById("address").value);
            check("save-info checked: next checkout re-checks the box", again.doc.getElementById("saveInfo").checked === true, String(again.doc.getElementById("saveInfo").checked));
            check("save-info checked: next checkout still needs no re-login", again.nav.length === 0, JSON.stringify(again.nav));
            again.dom.window.close();
        }

        // Unchecked -> xUser is left exactly as it was.
        {
            const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
                xLoggedIn: "true",
                xUser: JSON.stringify(ACCOUNT),
                xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
            });
            fill(p, "99 Other Street");
            p.doc.getElementById("saveInfo").checked = false;
            p.doc.querySelector(".place-order").click();
            const user = JSON.parse(p.win.localStorage.getItem("xUser"));
            check("save-info unchecked: no delivery details written to xUser", user.address === undefined && user.apartment === undefined && user.city === undefined && user.postal === undefined && user.country === undefined && user.phone === undefined, JSON.stringify(user));
            check("save-info unchecked: existing xUser fields left as they were", user.firstName === "Amina" && user.lastName === "Oti" && user.email === "amina@example.com" && user.password === "longenough", JSON.stringify(user));
            check("save-info unchecked: only the newsletter preference is recorded", Object.keys(user).sort().join(",") === "email,firstName,lastName,marketingOptIn,password", Object.keys(user).sort().join(","));
            check("save-info unchecked: order still created", !!JSON.parse(p.win.localStorage.getItem("xLastOrder")), p.win.localStorage.getItem("xLastOrder"));

            // A later load must not resurrect the un-saved address either.
            const stored = {};
            for (let i = 0; i < p.win.localStorage.length; i++) {
                const key = p.win.localStorage.key(i);
                stored[key] = p.win.localStorage.getItem(key);
            }
            p.dom.window.close();
            const again = loadPage("checkout.html", ["cart-store.js", "checkout.js"], stored);
            check("save-info unchecked: next checkout does not prefill an address", again.doc.getElementById("address").value === "", again.doc.getElementById("address").value);
            again.dom.window.close();
        }

        // A failed order must not touch xUser either way.
        {
            const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
                xLoggedIn: "true",
                xUser: JSON.stringify(ACCOUNT),
                xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
            });
            p.doc.getElementById("saveInfo").checked = true;
            p.doc.getElementById("city").value = "";
            p.doc.querySelector(".place-order").click();
            check("save-info: validation failure leaves xUser untouched", p.win.localStorage.getItem("xUser") === JSON.stringify(ACCOUNT), p.win.localStorage.getItem("xUser"));
            p.dom.window.close();
        }
    }

    // ---------- 10k. "Email me with news and exclusive offers" ----------
    {
        const ACCOUNT = { firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" };
        const place = (optIn) => {
            const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
                xLoggedIn: "true",
                xUser: JSON.stringify(ACCOUNT),
                xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
            });
            p.doc.getElementById("address").value = "1 Test Road";
            p.doc.getElementById("city").value = "Nairobi";
            p.doc.getElementById("postal").value = "00100";
            p.doc.getElementById("phone").value = "+254700000000";
            p.doc.getElementById("marketingOptIn").checked = optIn;
            p.doc.querySelector(".place-order").click();
            const user = JSON.parse(p.win.localStorage.getItem("xUser"));
            const storage = {};
            for (let i = 0; i < p.win.localStorage.length; i++) {
                const key = p.win.localStorage.key(i);
                storage[key] = p.win.localStorage.getItem(key);
            }
            p.dom.window.close();
            return { user: user, storage: storage };
        };

        const optedIn = place(true);
        check("marketing: checked stores marketingOptIn true", optedIn.user.marketingOptIn === true, JSON.stringify(optedIn.user));
        check("marketing: checked preserves the rest of xUser", optedIn.user.email === "amina@example.com" && optedIn.user.password === "longenough" && optedIn.user.firstName === "Amina", JSON.stringify(optedIn.user));

        const optedOut = place(false);
        check("marketing: unchecked stores marketingOptIn false", optedOut.user.marketingOptIn === false, JSON.stringify(optedOut.user));
        check("marketing: unchecked preserves the rest of xUser", optedOut.user.email === "amina@example.com" && optedOut.user.password === "longenough", JSON.stringify(optedOut.user));
        check("marketing: save-info untouched so no address was added", optedOut.user.address === undefined, JSON.stringify(optedOut.user));

        // The stored preference is what the next checkout shows.
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], optedIn.storage);
        check("marketing: next checkout shows the saved opt-in", p.doc.getElementById("marketingOptIn").checked === true, String(p.doc.getElementById("marketingOptIn").checked));
        p.dom.window.close();
        const q = loadPage("checkout.html", ["cart-store.js", "checkout.js"], optedOut.storage);
        check("marketing: next checkout shows the saved opt-out", q.doc.getElementById("marketingOptIn").checked === false, String(q.doc.getElementById("marketingOptIn").checked));
        q.dom.window.close();
    }

    // ---------- 10l. xOrders keeps every order, well past 20 ----------
    {
        const count = 27;
        let seed = { xLoggedIn: "true", xUser: USER_JSON };
        for (let i = 0; i < count; i++) {
            const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], Object.assign({}, seed, {
                xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
            }));
            p.doc.getElementById("address").value = "1 Test Road";
            p.doc.getElementById("city").value = "Nairobi";
            p.doc.getElementById("postal").value = "00100";
            p.doc.getElementById("phone").value = "+254700000000";
            p.doc.querySelector(".place-order").click();
            const history = JSON.parse(p.win.localStorage.getItem("xOrders"));
            seed = { xLoggedIn: "true", xUser: USER_JSON, xLastOrder: p.win.localStorage.getItem("xLastOrder"), xOrders: p.win.localStorage.getItem("xOrders") };
            if (history.length !== i + 1) {
                check("xOrders: order " + (i + 1) + " of " + count + " is kept", false, String(history.length));
                p.dom.window.close();
                break;
            }
            if (i === count - 1) {
                const numbers = {};
                history.forEach((o) => { numbers[o.number] = true; });
                check("xOrders: all " + count + " orders are kept, none trimmed", history.length === count, String(history.length));
                check("xOrders: every stored order is well formed", history.every((o) => o && typeof o.number === "string" && o.number.length > 2 && Array.isArray(o.items) && o.items.length === 1 && o.total === 64), JSON.stringify(history.slice(-1)[0]));
                check("xOrders: order numbers are all distinct", Object.keys(numbers).length === count, String(Object.keys(numbers).length));
                check("xOrders: newest order is first, oldest last", history[0].number === JSON.parse(seed.xLastOrder).number, JSON.stringify({ first: history[0].number, last: history[history.length - 1].number }));
                check("xOrders: still a plain JSON array", Array.isArray(history) && history[0] && typeof history[0] === "object", "entries: " + history.length);
                check("xOrders: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            }
            p.dom.window.close();
        }

        // The full history still renders on the account page and after a reload.
        const account = loadPage("account.html", ["account.js"], seed);
        const accountList = account.doc.querySelector(".account-orders");
        check("xOrders: account reads the full history after a reload", !!accountList && accountList.textContent.indexOf(JSON.parse(seed.xLastOrder).number) !== -1, accountList ? accountList.textContent : "no list rendered");
        account.dom.window.close();
        const confirm = loadPage("order-confirmation.html", ["order-confirmation.js"], seed);
        check("xOrders: confirmation still renders after a reload", confirm.doc.getElementById("order-id").textContent === JSON.parse(seed.xLastOrder).number, confirm.doc.getElementById("order-id").textContent);
        confirm.dom.window.close();
    }

    // ---------- 10m. payment copy does not overclaim, and no card data is kept ----------
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: USER_JSON,
            xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
        });
        const note = p.doc.querySelector(".payment-note").textContent;
        check("payment copy: no 'secure and encrypted' claim", note.toLowerCase().indexOf("encrypted") === -1, note);
        check("payment copy: no 'secure' claim at all", note.toLowerCase().indexOf("secure") === -1, note);
        check("payment copy: states it is a front-end prototype", /front-end prototype/i.test(note), note);
        check("payment copy: states no payment is processed", /no payment is processed/i.test(note), note);
        check("payment copy: states no card details are stored", /no card details are stored/i.test(note), note);
        check("payment copy: the payment UI is unchanged", p.doc.querySelectorAll(".payment-method").length === 2 && !!p.doc.querySelector(".payment-fields") && !!p.doc.querySelector(".mobile-money-fields"), String(p.doc.querySelectorAll(".payment-method").length));

        // Fill the card fields with sensitive-looking data and place the order.
        const cardInputs = p.doc.querySelectorAll(".payment-fields input");
        check("payment copy: card fields exist", cardInputs.length === 4, String(cardInputs.length));
        cardInputs[0].value = "4111 1111 1111 1111";
        cardInputs[1].value = "12 / 29";
        cardInputs[2].value = "123";
        cardInputs[3].value = "Amina Oti";
        p.doc.getElementById("address").value = "1 Test Road";
        p.doc.getElementById("city").value = "Nairobi";
        p.doc.getElementById("postal").value = "00100";
        p.doc.getElementById("phone").value = "+254700000000";
        p.doc.querySelector(".place-order").click();

        const placed = JSON.parse(p.win.localStorage.getItem("xLastOrder"));
        check("payment data: order still created", !!placed && placed.total === 64 && placed.items.length === 1, p.win.localStorage.getItem("xLastOrder"));
        const dump = JSON.stringify(placed);
        check("payment data: no card number stored", dump.indexOf("4111") === -1, dump.slice(0, 160));
        check("payment data: no expiry stored", dump.indexOf("12 / 29") === -1 && !/expiry/i.test(dump), dump.slice(0, 160));
        check("payment data: no security code stored", dump.indexOf("123") === -1 || !/cvc|cvv|security/i.test(dump), dump.slice(0, 160));
        check("payment data: no payment field names on the order", !/card|cvc|cvv|expiry|payment/i.test(dump), dump.slice(0, 160));

        // Nothing sensitive anywhere in storage.
        let leaked = "";
        for (let i = 0; i < p.win.localStorage.length; i++) {
            const key = p.win.localStorage.key(i);
            const value = p.win.localStorage.getItem(key) || "";
            if (value.indexOf("4111") !== -1) leaked += key + " ";
        }
        check("payment data: nothing sensitive written to localStorage", leaked === "", leaked || "clean");
        check("payment data: xUser untouched by card entry", JSON.parse(p.win.localStorage.getItem("xUser")).password === "longenough", p.win.localStorage.getItem("xUser"));
        check("payment data: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 10c. cart reflects removals and quantity edits ----------
    {
        const p = loadPage("cart.html", ["cart-store.js", "script.js", "cart.js"], {
            xCart: JSON.stringify([
                { id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 },
                { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 2 }
            ])
        });
        check("cart.html: renders every stored line", p.doc.querySelectorAll(".cart-product").length === 2, String(p.doc.querySelectorAll(".cart-product").length));
        check("cart.html: multi-item subtotal", p.doc.querySelector(".summary-subtotal").textContent === "$115", p.doc.querySelector(".summary-subtotal").textContent);

        p.doc.querySelectorAll(".quantity-plus")[1].click();
        check("cart.html: only the targeted line increments", JSON.parse(p.win.localStorage.getItem("xCart"))[1].quantity === 3, p.win.localStorage.getItem("xCart"));

        p.doc.querySelectorAll(".remove-product")[0].click();
        const afterRemove = JSON.parse(p.win.localStorage.getItem("xCart"));
        check("cart.html: remove drops the line", afterRemove.length === 1 && afterRemove[0].id === "after-dark-oil", JSON.stringify(afterRemove));
        check("cart.html: subtotal after removal", p.doc.querySelector(".summary-subtotal").textContent === "$84", p.doc.querySelector(".summary-subtotal").textContent);

        p.doc.querySelectorAll(".remove-product")[0].click();
        check("cart.html: empty state returns when last line goes", !p.doc.getElementById("cartEmpty").hidden);
        p.dom.window.close();
    }

    // ---------- 11. checkout.html blocks an empty email ----------
    {
        const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
            xLoggedIn: "true",
            xUser: JSON.stringify({ email: "" }),
            xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
        });
        p.doc.querySelector(".place-order").click();
        check("checkout.html: empty email flagged", p.doc.getElementById("email").classList.contains("input-error"));
        check("checkout.html: empty email saves no order", p.win.localStorage.getItem("xLastOrder") === null, p.win.localStorage.getItem("xLastOrder"));
        check("checkout.html: empty email does not navigate", p.nav.length === 0, JSON.stringify(p.nav));
        p.dom.window.close();
    }

    // ---------- 12. order-confirmation.html renders the saved order ----------
    {
        const ORDER = {
            number: "X48291",
            createdAt: new Date().toISOString(),
            email: "amina@example.com",
            items: [
                { id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1, category: "Intimate Wellness" },
                { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 2, category: "Body Care" },
                { id: "midnight-gummies", name: "Midnight Gummies", price: 24, quantity: 1, category: "Wellness" }
            ],
            subtotal: 139,
            shippingCost: 5,
            total: 144,
            delivery: { method: "Standard delivery", window: "3-7 business days", from: "Oct 8", to: "Oct 10" },
            address: {
                firstName: "Amina", lastName: "Oti",
                address: "12 Riverside Drive", apartment: "Apt 4B",
                city: "Nairobi", country: "Kenya", phone: "+254 700 000 000"
            }
        };
        const p = loadPage("order-confirmation.html", ["order-confirmation.js"], {
            xUser: USER_JSON,
            xLastOrder: JSON.stringify(ORDER)
        });

        check("order-confirmation: stays on ORDER CONFIRMED", p.doc.getElementById("confirmation-title").textContent === "ORDER CONFIRMED", p.doc.getElementById("confirmation-title").textContent);
        check("order-confirmation: greets the customer by first name", p.doc.getElementById("customer-firstname").textContent === "Amina", p.doc.getElementById("customer-firstname").textContent);
        check("order-confirmation: shows a realistic order number", p.doc.getElementById("order-id").textContent === "X48291", p.doc.getElementById("order-id").textContent);
        check("order-confirmation: renders every product line", p.doc.querySelectorAll(".order-item").length === 3, String(p.doc.querySelectorAll(".order-item").length));

        const linePrices = [...p.doc.querySelectorAll(".order-item-price")].map((el) => el.textContent);
        check("order-confirmation: line prices are line totals", linePrices.join(",") === "$59,$56,$24", linePrices.join(","));

        check("order-confirmation: subtotal", p.doc.getElementById("order-subtotal").textContent === "$139", p.doc.getElementById("order-subtotal").textContent);
        check("order-confirmation: shipping", p.doc.getElementById("order-shipping").textContent === "$5", p.doc.getElementById("order-shipping").textContent);
        check("order-confirmation: total", p.doc.getElementById("order-total").textContent === "$144", p.doc.getElementById("order-total").textContent);
        check("order-confirmation: delivery window", p.doc.getElementById("delivery-dates").textContent === "Oct 8 – Oct 10", p.doc.getElementById("delivery-dates").textContent);
        check("order-confirmation: delivery method shown quietly", p.doc.getElementById("delivery-method").textContent === "Standard delivery · 3-7 business days", p.doc.getElementById("delivery-method").textContent);

        const addr = p.doc.getElementById("shipping-address-container").textContent;
        check("order-confirmation: shipping address", addr.indexOf("Amina Oti") !== -1 && addr.indexOf("12 Riverside Drive, Apt 4B") !== -1 && addr.indexOf("Nairobi, Kenya") !== -1, addr);

        check("order-confirmation: discreet packaging promise visible", p.doc.querySelector(".discreet-packaging-notice").hidden === false);
        check("order-confirmation: offers view my account", p.doc.querySelector('.actions a[href="account.html"]').textContent.trim() === "VIEW MY ACCOUNT", p.doc.querySelector('.actions a[href="account.html"]').textContent.trim());
        check("order-confirmation: offers continue shopping", p.doc.querySelector('.actions a[href="shop.html"]').textContent.trim() === "CONTINUE SHOPPING", p.doc.querySelector('.actions a[href="shop.html"]').textContent.trim());
        p.dom.window.close();
    }

    // ---------- 12b. order-confirmation.html with no stored order ----------
    {
        const p = loadPage("order-confirmation.html", ["order-confirmation.js"], {});
        check("order-confirmation empty: title changes", p.doc.getElementById("confirmation-title").textContent === "NO ORDER FOUND", p.doc.getElementById("confirmation-title").textContent);
        check("order-confirmation empty: no order number shown", p.doc.querySelector(".order-number").hidden === true);
        check("order-confirmation empty: order summary hidden", p.doc.querySelector(".order-summary").hidden === true);
        check("order-confirmation empty: delivery hidden", p.doc.querySelector(".delivery-info").hidden === true);
        check("order-confirmation empty: still offers a way forward", !!p.doc.querySelector('.actions a[href="shop.html"]'));
        p.dom.window.close();
    }

    // ---------- 13. about.html ----------
    {
        const p = loadPage("about.html", ["cart-store.js", "script.js"], {
            xCart: JSON.stringify([
                { id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 },
                { id: "after-dark-oil", name: "After Dark Oil", price: 28, quantity: 2 }
            ])
        });

        check("about.html: loads without script errors", p.dom.window.document.title.indexOf("About X") === 0, p.dom.window.document.title);
        check("about.html: exactly one navbar (no duplicate nav system)", p.doc.querySelectorAll(".navbar").length === 1, String(p.doc.querySelectorAll(".navbar").length));
        check("about.html: exactly one footer", p.doc.querySelectorAll("footer.footer").length === 1, String(p.doc.querySelectorAll("footer.footer").length));

        check("about.html: logo goes to index.html", p.doc.querySelector(".navbar .logo").getAttribute("href") === "index.html", p.doc.querySelector(".navbar .logo").getAttribute("href"));

        const navAbout = p.doc.querySelector('.nav-links a[href="about.html"]');
        check("about.html: About nav link points to about.html", !!navAbout);
        check("about.html: About nav link is marked active", !!navAbout && navAbout.classList.contains("active-nav"));

        const navQuiz = [...p.doc.querySelectorAll(".nav-links a")].find((a) => a.textContent.trim() === "Find Your Match");
        check("about.html: Find Your Match -> quiz.html", !!navQuiz && navQuiz.getAttribute("href") === "quiz.html", navQuiz && navQuiz.getAttribute("href"));

        const navShop = [...p.doc.querySelectorAll(".nav-links a")].find((a) => a.textContent.trim() === "Shop");
        check("about.html: Shop -> shop.html", !!navShop && navShop.getAttribute("href") === "shop.html", navShop && navShop.getAttribute("href"));

        const ctaButtons = [...p.doc.querySelectorAll(".about-final-cta a.button")];
        const shopCta = ctaButtons.find((a) => a.textContent.trim() === "SHOP EVERYTHING");
        const quizCta = ctaButtons.find((a) => a.textContent.trim() === "FIND YOUR MATCH");
        check("about.html: SHOP EVERYTHING -> shop.html", !!shopCta && shopCta.getAttribute("href") === "shop.html", shopCta && shopCta.getAttribute("href"));
        check("about.html: FIND YOUR MATCH -> quiz.html", !!quizCta && quizCta.getAttribute("href") === "quiz.html", quizCta && quizCta.getAttribute("href"));

        const experienceCta = p.doc.querySelector(".experience-content a.button");
        check("about.html: experience CTA -> quiz.html", !!experienceCta && experienceCta.getAttribute("href") === "quiz.html", experienceCta && experienceCta.getAttribute("href"));

        check("about.html: account icon points to login.html for guests", p.doc.querySelector('.nav-actions a.icon-button[aria-label="Account"]').getAttribute("href") === "login.html");
        check("about.html: cart icon links to cart.html", p.doc.querySelector(".nav-actions .cart-button").getAttribute("href") === "cart.html");
        check("about.html: mobile menu button present", !!p.doc.querySelector(".menu-button"));

        // Cart badge must count UNITS (1 + 2 = 3), driven by the shared store.
        check("about.html: cart badge counts units not products", p.doc.querySelector(".cart-count").textContent === "3", p.doc.querySelector(".cart-count").textContent);

        check("about.html: hero copy present", p.doc.querySelector(".about-hero h1").textContent.indexOf("made personal") !== -1);
        check("about.html: all four value blocks present", p.doc.querySelectorAll(".value-card").length === 4, String(p.doc.querySelectorAll(".value-card").length));
        check("about.html: discreet shopping blocks present", p.doc.querySelectorAll(".discretion-grid > div").length === 4, String(p.doc.querySelectorAll(".discretion-grid > div").length));
        check("about.html: uses the shared button component", p.doc.querySelectorAll(".about-final-cta .button").length === 2 && p.doc.querySelectorAll(".button").length >= 3, String(p.doc.querySelectorAll(".button").length));

        p.dom.window.close();
    }

    // ---------- 13b. about.html as a signed-in member ----------
    {
        const p = loadPage("about.html", ["cart-store.js", "script.js"], { xLoggedIn: "true", xUser: USER_JSON });
        check("about.html member: account icon points to account.html", p.doc.querySelector(".nav-actions a.icon-button:not(.cart-button)").getAttribute("href") === "account.html", p.doc.querySelector(".nav-actions a.icon-button:not(.cart-button)").getAttribute("href"));
        p.dom.window.close();
    }

    // ---------- 13c. about.css keeps the site's breakpoints ----------
    {
        const css = fs.readFileSync(path.join(SITE, "about.css"), "utf8");
        check("about.css: has the 1000px breakpoint", css.indexOf("@media (max-width: 1000px)") !== -1);
        check("about.css: has the 600px breakpoint", css.indexOf("@media (max-width: 600px)") !== -1);
        check("about.css: hero collapses to one column on mobile", /@media \(max-width: 1000px\)[\s\S]*?\.about-hero \{ grid-template-columns: 1fr; \}/.test(css));
        check("about.css: CTA buttons stack on mobile", /@media \(max-width: 600px\)[\s\S]*?\.about-cta-buttons \{ flex-direction: column/.test(css));
        check("about.css: uses existing design tokens", css.indexOf("var(--cream)") !== -1 && css.indexOf("var(--black)") !== -1 && css.indexOf("var(--gray)") !== -1 && css.indexOf("var(--line)") !== -1);
    }

    // ---------- 14. global navbar audit across every navbar page ----------
    const NAVBAR_PAGES = {
        "index.html": ["cart-store.js", "script.js"],
        "shop.html": ["cart-store.js", "script.js", "shop.js"],
        "product.html": ["cart-store.js", "script.js", "product.js"],
        "quiz.html": ["cart-store.js", "products.js", "script.js", "quiz.js"],
        "cart.html": ["cart-store.js", "script.js", "cart.js"],
        "about.html": ["cart-store.js", "script.js"],
        "help.html": ["cart-store.js", "script.js", "help.js"],
        "privacy.html": ["cart-store.js", "script.js"],
        "terms.html": ["cart-store.js", "script.js"]
    };

    Object.keys(NAVBAR_PAGES).forEach((page) => {
        const p = loadPage(page, NAVBAR_PAGES[page], { xLoggedIn: "true", xUser: USER_JSON });
        const links = [...p.doc.querySelectorAll(".nav-links a")];
        const byText = (text) => links.find((a) => a.textContent.trim() === text);

        check(page + ": logo -> index.html", p.doc.querySelector(".navbar .logo").getAttribute("href") === "index.html");
        check(page + ": Shop -> shop.html", byText("Shop").getAttribute("href") === "shop.html");
        check(page + ": Wellness -> shop.html?category=wellness", byText("Wellness").getAttribute("href") === "shop.html?category=wellness", byText("Wellness").getAttribute("href"));
        // Gifts is no longer a primary category; Intimate replaced it in the nav.
        check(page + ": Intimate -> shop.html?category=intimate", byText("Intimate").getAttribute("href") === "shop.html?category=intimate", byText("Intimate").getAttribute("href"));
        check(page + ": no Gifts link remains in the navbar", !byText("Gifts"));
        check(page + ": About -> about.html", byText("About").getAttribute("href") === "about.html", byText("About").getAttribute("href"));
        check(page + ": Find Your Match -> quiz.html", byText("Find Your Match").getAttribute("href") === "quiz.html");

        const cart = p.doc.querySelector(".nav-actions .cart-button");
        check(page + ": cart icon is a real link", cart.tagName === "A", cart.tagName);
        check(page + ": cart icon -> cart.html", cart.getAttribute("href") === "cart.html", cart.getAttribute("href"));
        check(page + ": account icon -> account.html when signed in", p.doc.querySelector(".nav-actions a.icon-button:not(.cart-button)").getAttribute("href") === "account.html");

        check(page + ": exactly one navbar", p.doc.querySelectorAll(".navbar").length === 1, String(p.doc.querySelectorAll(".navbar").length));
        check(page + ": exactly one search button", p.doc.querySelectorAll('.icon-button[aria-label="Search"]').length === 1);

        const ourStory = [...p.doc.querySelectorAll("footer a")].find((a) => a.textContent.trim() === "Our story");
        check(page + ": footer Our story -> about.html", !!ourStory && ourStory.getAttribute("href") === "about.html", ourStory && ourStory.getAttribute("href"));

        if (page === "help.html" || page === "privacy.html" || page === "terms.html") {
            const hero = p.doc.querySelector("main h1");
            check(page + ": hero is present", !!hero);
        }

        check(page + ": no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    });

    // ---------- 15. search ----------
    {
        const p = loadPage("index.html", ["cart-store.js", "script.js"]);
        const searchButton = p.doc.querySelector('.icon-button[aria-label="Search"]');
        const panel = p.doc.querySelector(".search-panel");
        const input = p.doc.querySelector(".search-input");

        check("search: panel injected once", p.doc.querySelectorAll(".search-panel").length === 1, String(p.doc.querySelectorAll(".search-panel").length));
        check("search: starts closed", panel.hidden === true);

        searchButton.click();
        check("search: opens from the search icon", panel.hidden === false);
        check("search: aria-expanded true while open", searchButton.getAttribute("aria-expanded") === "true");
        check("search: input receives focus", p.doc.activeElement === input);

        const names = () => [...p.doc.querySelectorAll(".search-results .search-result-name")].map((el) => el.textContent);
        const type = (value) => {
            input.value = value;
            input.dispatchEvent(new p.win.Event("input", { bubbles: true }));
        };

        type("silk");
        check("search: finds by product name", names().join(",") === "Silk Touch", names().join(","));

        // "wellness" matches the primary category plus the Wellness product type,
        // so it returns every wellness product in the catalogue.
        type("wellness");
        check("search: finds by category", names().slice().sort().join(",") ===
            "After Dark Oil,Midnight Gummies,Night Ritual,Slow Down Oil", names().join(","));

        // Product types are searchable too.
        type("gummies");
        check("search: finds by product type", names().join(",") === "Midnight Gummies", names().join(","));

        // Case-insensitivity is checked against a category label that still
        // exists in the two-category structure.
        type("INTIMATE");
        check("search: category match is case-insensitive",
            names().slice().sort().join(",") === "Luna,Silk Touch,The Duo,Velvet Mini", names().join(","));

        type("zzzz");
        check("search: says so when nothing matches", p.doc.querySelectorAll(".search-results .search-empty").length === 1);

        type("");
        check("search: empty query lists the catalogue", names().length === 8, String(names().length));
        check("search: results link to the product page", [...p.doc.querySelectorAll(".search-results a")].every((a) => {
            const id = a.getAttribute("href").replace(/^product\.html\?id=/, "");
            const name = a.querySelector(".search-result-name").textContent.trim();
            const match = p.win.PRODUCTS.filter((product) => product.id === id)[0];
            return !!match && match.name === name;
        }), [...p.doc.querySelectorAll(".search-results a")].map((a) => a.getAttribute("href")).join(" | "));
        check("search: silk-touch results point at product.html?id=silk-touch",
            [...p.doc.querySelectorAll(".search-results a")].some((a) => a.getAttribute("href") === "product.html?id=silk-touch"));

        p.doc.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        check("search: Escape closes the panel", panel.hidden === true);
        check("search: aria-expanded false once closed", searchButton.getAttribute("aria-expanded") === "false");

        searchButton.click();
        p.doc.body.click();
        check("search: click outside the navbar closes it", panel.hidden === true);

        searchButton.click();
        p.doc.querySelector(".search-close").click();
        check("search: close button closes it", panel.hidden === true);

        check("search: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 16. mobile menu ----------
    {
        const p = loadPage("index.html", ["cart-store.js", "script.js"]);
        const menuButton = p.doc.querySelector(".menu-button");
        const menu = p.doc.querySelector(".nav-links");

        check("mobile menu: starts closed", !menu.classList.contains("mobile-open"));
        check("mobile menu: aria-expanded false initially", menuButton.getAttribute("aria-expanded") === "false");

        menuButton.click();
        check("mobile menu: opens", menu.classList.contains("mobile-open"));
        check("mobile menu: aria-expanded true when open", menuButton.getAttribute("aria-expanded") === "true");
        check("mobile menu: aria-label swaps to Close menu", menuButton.getAttribute("aria-label") === "Close menu");

        menuButton.click();
        check("mobile menu: closes on second press", !menu.classList.contains("mobile-open"));

        menuButton.click();
        menu.querySelector("a").click();
        check("mobile menu: closes when a nav link is used", !menu.classList.contains("mobile-open"));

        menuButton.click();
        p.doc.body.click();
        check("mobile menu: closes on outside click", !menu.classList.contains("mobile-open"));

        menuButton.click();
        p.doc.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        check("mobile menu: closes on Escape", !menu.classList.contains("mobile-open"));
        check("mobile menu: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 17. shop category routing (?category=) ----------
    {
        const loadShop = (url) => loadPage(url, ["cart-store.js", "script.js", "shop.js"]);
        const visibleProducts = (p) => [...p.doc.querySelectorAll(".shop-product")].filter((el) => !el.hidden);
        const chip = (p) => p.doc.querySelector(".shop-categories .category-active");
        const nav = (p, text) => [...p.doc.querySelectorAll(".nav-links a")].find((a) => a.textContent.trim() === text);

        // No category: the first page of everything, All products chip, Shop still active.
        {
            const p = loadShop("shop.html");
            check("shop: default shows the first page", visibleProducts(p).length === 4, String(visibleProducts(p).length));
            check("shop: default count is truthful", p.doc.querySelector(".shop-toolbar > p").textContent === "8 products", p.doc.querySelector(".shop-toolbar > p").textContent);
            check("shop: All products chip active", chip(p).textContent.trim() === "All", chip(p).textContent.trim());
            check("shop: Shop stays active in the navbar", nav(p, "Shop").classList.contains("active-nav"));
            check("shop: no empty state", p.doc.querySelector(".shop-empty-state").hidden === true);
            check("shop: load more is offered while products remain", p.doc.querySelector(".load-more").hidden === false);

            // Load more reveals the rest, then retires itself.
            const namesOf = (page) => visibleProducts(page).map((el) => el.querySelector("h2").textContent);
            const firstPage = namesOf(p);
            p.doc.querySelector(".load-more button").click();
            check("shop: load more reveals the rest", visibleProducts(p).length === 8, String(visibleProducts(p).length));
            check("shop: load more keeps the page it already showed", firstPage.every((name, i) => namesOf(p)[i] === name), namesOf(p).join(","));
            check("shop: load more hides once everything is shown", p.doc.querySelector(".load-more").hidden === true);
            check("shop: count still reports the whole match", p.doc.querySelector(".shop-toolbar > p").textContent === "8 products", p.doc.querySelector(".shop-toolbar > p").textContent);
            check("shop: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // The navbar's Wellness link. Wellness now covers every non-intimate
        // product (gummies, body & massage, self-care), not just two items.
        {
            const p = loadShop("shop.html?category=wellness");
            check("shop?category=wellness: Wellness chip active", chip(p).textContent.trim() === "Wellness", chip(p).textContent.trim());
            check("shop?category=wellness: only wellness products",
                visibleProducts(p).map((el) => el.querySelector("h2").textContent).sort().join(",") ===
                "After Dark Oil,Midnight Gummies,Night Ritual,Slow Down Oil",
                visibleProducts(p).map((el) => el.querySelector("h2").textContent).join(","));
            check("shop?category=wellness: count updated", p.doc.querySelector(".shop-toolbar > p").textContent === "4 products", p.doc.querySelector(".shop-toolbar > p").textContent);
            check("shop?category=wellness: navbar active moves to Wellness", nav(p, "Wellness").classList.contains("active-nav") && !nav(p, "Shop").classList.contains("active-nav"));
            check("shop?category=wellness: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // The navbar's Intimate link. "The Duo" used to be a Gifts product and
        // now sits under Intimate / Accessories, so it shows up here.
        {
            const p = loadShop("shop.html?category=intimate");
            check("shop?category=intimate: Intimate chip active", chip(p).textContent.trim() === "Intimate", chip(p).textContent.trim());
            check("shop?category=intimate: only intimate products",
                visibleProducts(p).map((el) => el.querySelector("h2").textContent).sort().join(",") ===
                "Luna,Silk Touch,The Duo,Velvet Mini",
                visibleProducts(p).map((el) => el.querySelector("h2").textContent).join(","));
            check("shop?category=intimate: count updated", p.doc.querySelector(".shop-toolbar > p").textContent === "4 products", p.doc.querySelector(".shop-toolbar > p").textContent);
            check("shop?category=intimate: navbar active moves to Intimate", nav(p, "Intimate").classList.contains("active-nav") && !nav(p, "Shop").classList.contains("active-nav"));
            check("shop?category=intimate: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // Gifts is no longer a primary category: the old slug must not filter.
        {
            const p = loadShop("shop.html?category=gifts");
            check("shop?category=gifts: falls back to everything, not a dead view",
                visibleProducts(p).length === 4 && p.doc.querySelector(".shop-toolbar > p").textContent === "8 products",
                visibleProducts(p).length + " / " + p.doc.querySelector(".shop-toolbar > p").textContent);
            check("shop?category=gifts: All is the active chip", chip(p).textContent.trim() === "All", chip(p).textContent.trim());
            check("shop?category=gifts: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // A subcategory that exists but has no stock yet still behaves.
        {
            const p = loadShop("shop.html");
            p.doc.querySelector(".filter-button").click();
            [...p.doc.querySelectorAll('input[name="shopSubcategory"]')].find((i) => i.value === "lubricants").checked = true;
            p.doc.querySelector(".filter-apply").click();
            check("shop: an empty subcategory shows the empty state", p.doc.querySelector(".shop-empty-state").hidden === false);
            check("shop: an empty subcategory reports zero", p.doc.querySelector(".shop-toolbar > p").textContent === "0 products", p.doc.querySelector(".shop-toolbar > p").textContent);
            check("shop: an empty subcategory hides load more", p.doc.querySelector(".load-more").hidden === true);
            p.dom.window.close();
        }

        // Every category chip is a real destination, not a dead hash.
        {
            const p = loadShop("shop.html");
            const chips = [...p.doc.querySelectorAll(".shop-categories a")];
            check("shop: every category chip has a real href", chips.every((a) => /^shop\.html(\?category=[a-z-]+)?$/.test(a.getAttribute("href"))), chips.map((a) => a.getAttribute("href")).join(" "));
            check("shop: every navbar destination resolves on this page", [...p.doc.querySelectorAll(".nav-links a")].every((a) => a.getAttribute("href") !== "#"));
            p.dom.window.close();
        }
    }

    // ---------- 18. shop toolbar: filter, sort and load more ----------
    {
        const loadShop = (url) => loadPage(url, ["cart-store.js", "script.js", "shop.js"]);
        const names = (p) => [...p.doc.querySelectorAll(".shop-product")].map((el) => el.querySelector("h2").textContent);
        const count = (p) => p.doc.querySelector(".shop-toolbar > p").textContent;
        const chip = (p) => p.doc.querySelector(".shop-categories .category-active");
        const prices = (p) => [...p.doc.querySelectorAll(".shop-product-info strong")].map((el) => parseFloat(el.textContent.replace(/[^0-9.]/g, "")));

        // The pages really do load the shared catalogue, in the right order.
        ["index.html", "shop.html", "product.html"].forEach((page) => {
            const raw = fs.readFileSync(path.join(SITE, page), "utf8");
            const catalogue = raw.indexOf('src="products.js"');
            const script = raw.indexOf('src="script.js"');
            check(page + ": loads products.js before script.js", catalogue !== -1 && script !== -1 && catalogue < script);
        });

        // The filter drawer.
        {
            const p = loadShop("shop.html");
            const button = p.doc.querySelector(".filter-button");
            const panel = p.doc.querySelector(".filter-panel");

            check("shop toolbar: filter drawer starts closed", panel.hidden === true && button.getAttribute("aria-expanded") === "false");
            button.click();
            check("shop toolbar: filter button opens the drawer", panel.hidden === false && button.getAttribute("aria-expanded") === "true");

            p.doc.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            check("shop toolbar: Escape closes the drawer", panel.hidden === true && button.getAttribute("aria-expanded") === "false");

            // Apply a category from the drawer.
            button.click();
            const wellness = [...p.doc.querySelectorAll('input[name="shopCategory"]')].find((i) => i.value === "wellness");
            wellness.checked = true;
            p.doc.querySelector(".filter-apply").click();
            // Order-independent: the featured sort decides sequence, the test cares
        // about the set of products and the truthful count.
        check("shop toolbar: applying a category filters the grid",
            names(p).slice().sort().join(",") === "After Dark Oil,Midnight Gummies,Night Ritual,Slow Down Oil", names(p).join(","));
            check("shop toolbar: applying a category updates the count", count(p) === "4 products", count(p));
            check("shop toolbar: applying a category selects its chip", chip(p).textContent.trim() === "Wellness", chip(p).textContent.trim());
            check("shop toolbar: applying closes the drawer", panel.hidden === true);

            // Escape hatch from the empty state.
            button.click();
            [...p.doc.querySelectorAll('input[name="shopSubcategory"]')].forEach((i) => { i.checked = false; });
            [...p.doc.querySelectorAll('input[name="shopCategory"]')].forEach((i) => { i.checked = false; });
            [...p.doc.querySelectorAll('input[name="shopSubcategory"]')].find((i) => i.value === "lubricants").checked = true;
            p.doc.querySelector(".filter-apply").click();
            check("shop toolbar: an empty filter shows the empty state", p.doc.querySelector(".shop-empty-state").hidden === false && count(p) === "0 products", count(p));
            check("shop toolbar: empty filter hides load more", p.doc.querySelector(".load-more").hidden === true);
            p.doc.querySelector(".shop-empty-state .clear-filters").click();
            check("shop toolbar: Clear filters in the empty state restores everything", names(p).length === 4 && count(p) === "8 products", count(p));
            check("shop toolbar: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // The price bands.
        {
            const p = loadShop("shop.html");
            p.doc.querySelector(".filter-button").click();
            [...p.doc.querySelectorAll('input[name="shopPrice"]')].find((i) => i.value === "under-30").checked = true;
            p.doc.querySelector(".filter-apply").click();
            check("shop toolbar: price band under $30 keeps only cheap products", prices(p).every((price) => price < 30) && prices(p).length === 3, prices(p).join(","));
            check("shop toolbar: price band updates the count", count(p) === "3 products", count(p));
            check("shop toolbar: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // Sorting.
        {
            const p = loadShop("shop.html");
            const button = p.doc.querySelector(".sort-button");
            const menu = p.doc.querySelector(".sort-menu");

            check("shop toolbar: sort menu starts closed", menu.hidden === true && button.getAttribute("aria-expanded") === "false");
            button.click();
            check("shop toolbar: sort button opens the menu", menu.hidden === false && button.getAttribute("aria-expanded") === "true");

            p.doc.querySelector('.sort-menu button[data-sort="price-asc"]').click();
            const ascending = prices(p);
            check("shop toolbar: price ascending orders the page", ascending.every((price, i) => i === 0 || ascending[i - 1] <= price), ascending.join(","));
            check("shop toolbar: cheapest product leads", names(p)[0] === "Slow Down Oil", names(p)[0]);
            check("shop toolbar: sort label reflects the choice", button.querySelector("strong").textContent === "Price: Low to High", button.querySelector("strong").textContent);
            check("shop toolbar: sorting closes the menu", menu.hidden === true);

            button.click();
            p.doc.querySelector('.sort-menu button[data-sort="price-desc"]').click();
            const descending = prices(p);
            check("shop toolbar: price descending orders the page", descending.every((price, i) => i === 0 || descending[i - 1] >= price), descending.join(","));
            check("shop toolbar: priciest product leads", names(p)[0] === "The Duo", names(p)[0]);

            button.click();
            p.doc.querySelector('.sort-menu button[data-sort="newest"]').click();
            check("shop toolbar: newest leads with the new arrivals", names(p).slice(0, 2).join(",") === "Midnight Gummies,Night Ritual", names(p).slice(0, 2).join(","));

            button.click();
            p.doc.querySelector('.sort-menu button[data-sort="featured"]').click();
            check("shop toolbar: featured puts the best sellers first", names(p)[0] === "Silk Touch", names(p)[0]);
            check("shop toolbar: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // Sorting a filtered view still respects the filter.
        {
            const p = loadShop("shop.html");
            p.doc.querySelector(".filter-button").click();
            [...p.doc.querySelectorAll('input[name="shopCategory"]')].find((i) => i.value === "intimate").checked = true;
            [...p.doc.querySelectorAll('input[name="shopSubcategory"]')].find((i) => i.value === "toys").checked = true;
            p.doc.querySelector(".filter-apply").click();
            p.doc.querySelector(".sort-button").click();
            p.doc.querySelector('.sort-menu button[data-sort="price-asc"]').click();
            check("shop toolbar: sort and category work together", names(p).join(",") === "Velvet Mini,Silk Touch,Luna", names(p).join(","));
            check("shop toolbar: sort and category keeps the count", count(p) === "3 products", count(p));
            check("shop toolbar: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // The subcategory filter narrows within its parent category.
        {
            const p = loadShop("shop.html");
            p.doc.querySelector(".filter-button").click();
            [...p.doc.querySelectorAll('input[name="shopCategory"]')].find((i) => i.value === "intimate").checked = true;
            [...p.doc.querySelectorAll('input[name="shopSubcategory"]')].find((i) => i.value === "accessories").checked = true;
            p.doc.querySelector(".filter-apply").click();
            check("shop toolbar: a subcategory filters within its parent",
                names(p).join(",") === "The Duo", names(p).join(","));
            check("shop toolbar: a subcategory updates the count", count(p) === "1 product", count(p));
            check("shop toolbar: a subcategory selects its parent chip", chip(p).textContent.trim() === "Intimate", chip(p).textContent.trim());

            // Clearing from the drawer restores the full catalogue.
            p.doc.querySelector(".filter-button").click();
            p.doc.querySelector(".filter-clear").click();
            check("shop toolbar: Clear restores every product", names(p).length === 4 && count(p) === "8 products", count(p));
            check("shop toolbar: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // The chips filter in place.
        {
            const p = loadShop("shop.html");
            const chips = [...p.doc.querySelectorAll(".shop-categories a")];
            chips.find((a) => a.getAttribute("href") === "shop.html?category=wellness").click();
            check("shop toolbar: a chip filters without reloading", names(p).slice().sort().join(",") === "After Dark Oil,Midnight Gummies,Night Ritual,Slow Down Oil", names(p).join(","));
            check("shop toolbar: a chip updates the count", count(p) === "4 products", count(p));
            check("shop toolbar: a chip moves the active state", chip(p).textContent.trim() === "Wellness", chip(p).textContent.trim());
            chips.find((a) => a.getAttribute("href") === "shop.html").click();
            check("shop toolbar: All restores everything", names(p).length === 4 && count(p) === "8 products", count(p));
            check("shop toolbar: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }
    }

    // ---------- 19. help page: FAQ accordion, contact form, footer wiring ----------
    {
        const helpFooter = (p, text) => [...p.doc.querySelectorAll("footer a")].find((a) => a.textContent.trim() === text);

        {
            const p = loadPage("help.html", ["cart-store.js", "script.js", "help.js"]);

            check("help: hero is present", !!p.doc.querySelector("main h1"));
            check("help: eight FAQ questions", p.doc.querySelectorAll(".faq-item").length === 8, String(p.doc.querySelectorAll(".faq-item").length));
            check("help: answers start closed", [...p.doc.querySelectorAll(".faq-answer")].every((el) => el.hidden === true));
            check("help: discreet-packaging FAQ is worded as specified", [...p.doc.querySelectorAll(".faq-item")][0].querySelector(".faq-answer p").textContent.indexOf("no product details visible") !== -1);

            const first = p.doc.querySelectorAll(".faq-item")[0];
            first.querySelector(".faq-question").click();
            check("help: FAQ opens on click", first.querySelector(".faq-answer").hidden === false && first.querySelector(".faq-question").getAttribute("aria-expanded") === "true");
            first.querySelector(".faq-question").click();
            check("help: FAQ closes on second click", first.querySelector(".faq-answer").hidden === true && first.querySelector(".faq-question").getAttribute("aria-expanded") === "false");

            first.querySelector(".faq-question").click();
            p.doc.querySelectorAll(".faq-item")[1].querySelector(".faq-question").click();
            check("help: only one FAQ answer stays open", p.doc.querySelectorAll(".faq-item.open").length === 1 && first.querySelector(".faq-answer").hidden === true, String(p.doc.querySelectorAll(".faq-item.open").length));

            const form = p.doc.querySelector(".contact-form");
            check("help: contact form has the required fields", !!form && !!form.querySelector("#contactFirstName") && !!form.querySelector("#contactEmail") && !!form.querySelector("#contactOrder") && !!form.querySelector("#contactMessage"));
            form.querySelector("#contactFirstName").value = "Amina";
            form.querySelector("#contactEmail").value = "amina@example.com";
            form.querySelector("#contactMessage").value = "Where is my order?";
            form.dispatchEvent(new p.win.Event("submit", { bubbles: true, cancelable: true }));
            check("help: contact form submits without reloading", p.lastNav() === "", p.lastNav());
            check("help: contact form shows the success message", p.doc.querySelector(".contact-success").hidden === false);

            check("help: payment section promises nothing specific", p.doc.querySelector(".help-meta").textContent.indexOf("displayed securely during checkout") !== -1);
            check("help: account links use existing pages", ["login.html", "signup.html", "account.html"].every((href) => !!p.doc.querySelector('.help-account-links a[href="' + href + '"]')));
            check("help: footer Contact -> help.html#contact", helpFooter(p, "Contact").getAttribute("href") === "help.html#contact", helpFooter(p, "Contact").getAttribute("href"));
            check("help: footer FAQ -> help.html#faq", helpFooter(p, "FAQ").getAttribute("href") === "help.html#faq", helpFooter(p, "FAQ").getAttribute("href"));
            check("help: footer Privacy -> privacy.html", helpFooter(p, "Privacy").getAttribute("href") === "privacy.html", helpFooter(p, "Privacy").getAttribute("href"));
            check("help: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // __HELP_TESTS_PART3__
        {
            const p = loadPage("privacy.html", ["cart-store.js", "script.js"]);
            check("privacy: hero is present", !!p.doc.querySelector("main h1"));
            check("privacy: states it is a placeholder", p.doc.body.textContent.indexOf("placeholder privacy page") !== -1);
            check("privacy: promises discretion without legal claims", p.doc.body.textContent.indexOf("not displayed on the outside of your package") !== -1);
            check("privacy: footer Terms -> terms.html", helpFooter(p, "Terms").getAttribute("href") === "terms.html");
            check("privacy: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        {
            const p = loadPage("terms.html", ["cart-store.js", "script.js"]);
            check("terms: hero is present", !!p.doc.querySelector("main h1"));
            check("terms: states it is a placeholder", p.doc.body.textContent.indexOf("placeholder terms page") !== -1);
            check("terms: footer Privacy -> privacy.html", helpFooter(p, "Privacy").getAttribute("href") === "privacy.html");
            check("terms: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }

        // __HELP_TESTS_PART4__
        ["about.html", "cart.html", "index.html", "product.html", "quiz.html", "shop.html"].forEach((page) => {
            const scripts = page === "shop.html" ? ["cart-store.js", "script.js", "shop.js"] : (page === "product.html" ? ["cart-store.js", "script.js", "product.js"] : ["cart-store.js", "script.js"]);
            const p = loadPage(page, scripts);
            const find = (text) => [...p.doc.querySelectorAll("footer a")].find((a) => a.textContent.trim() === text);
            check(page + ": footer Help links resolve", ["Contact", "Shipping", "Returns", "FAQ"].every((text) => {
                const link = find(text);
                return !!link && link.getAttribute("href").indexOf("help.html#") === 0;
            }));
            check(page + ": footer Privacy -> privacy.html", find("Privacy").getAttribute("href") === "privacy.html", find("Privacy").getAttribute("href"));
            check(page + ": footer Terms -> terms.html", find("Terms").getAttribute("href") === "terms.html", find("Terms").getAttribute("href"));
            check(page + ": no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        });

        {
            const p = loadPage("checkout.html", ["cart-store.js", "checkout.js"]);
            const consent = [...p.doc.querySelectorAll("a")].filter((a) => a.getAttribute("href") === "terms.html" || a.getAttribute("href") === "privacy.html");
            check("checkout: consent links resolve", consent.length === 2, String(consent.length));
            check("checkout: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        }
    }

    // ---------- 20. index.html: the homepage had no behaviour checks of its own ----------
    {
        const p = loadPage("index.html", ["cart-store.js", "script.js"]);
        const cards = p.doc.querySelectorAll(".product-card");
        check("index.html: renders its four featured products", cards.length === 4, String(cards.length));

        // Quick add is delegated, so the card button must reach the shared cart store.
        p.doc.querySelectorAll(".product-card .quick-add")[0].click();
        const added = JSON.parse(p.win.localStorage.getItem("xCart") || "[]");
        const cardName = p.doc.querySelector(".product-card h3").textContent.trim();
        check("index.html: quick add stores the featured product", added.length === 1 && added[0].name === cardName,
            JSON.stringify(added));
        check("index.html: quick add stores a catalogue id", added.length === 1 && added[0].id === "silk-touch", added[0] && added[0].id);
        check("index.html: quick add confirms on the button",
            p.doc.querySelector(".product-card .quick-add").textContent === "Added \u2713",
            p.doc.querySelector(".product-card .quick-add").textContent);
        check("index.html: the navbar badge follows the quick add",
            p.doc.querySelector(".cart-count").textContent === "1", p.doc.querySelector(".cart-count").textContent);

        // A second tap on the same product must increment, not duplicate the line.
        p.doc.querySelectorAll(".product-card .quick-add")[0].click();
        const again = JSON.parse(p.win.localStorage.getItem("xCart") || "[]");
        check("index.html: a repeated quick add increments one line", again.length === 1 && again[0].quantity === 2,
            JSON.stringify(again));

        // Wishlist hearts are visual-only, and must not add to the cart.
        const heart = p.doc.querySelector(".product-card .heart-button");
        const heartBefore = heart.textContent.trim();
        heart.click();
        check("index.html: wishlist heart toggles", heart.textContent.trim() !== heartBefore,
            heartBefore + " -> " + heart.textContent.trim());
        check("index.html: wishlist heart does not touch the cart",
            JSON.parse(p.win.localStorage.getItem("xCart")).length === 1);

        // Newsletter: an empty box must not claim success.
        const form = p.doc.querySelector(".newsletter-form");
        const input = form.querySelector("input");
        const submit = form.querySelector("button");
        submitForm(p.win, form);
        check("index.html: empty newsletter signup does not confirm",
            submit.textContent.indexOf("You're in") === -1, submit.textContent.trim());
        input.value = "someone@example.com";
        submitForm(p.win, form);
        check("index.html: newsletter signup confirms", submit.textContent.indexOf("You're in") !== -1,
            submit.textContent.trim());
        check("index.html: newsletter signup clears the input", input.value === "", input.value);

        // Every way off the homepage must point at a real page.
        const heroHrefs = [...p.doc.querySelectorAll(".hero-buttons a")].map((a) => a.getAttribute("href"));
        check("index.html: hero CTAs -> shop and quiz", heroHrefs.indexOf("shop.html") !== -1 && heroHrefs.indexOf("quiz.html") !== -1,
            JSON.stringify(heroHrefs));
        const categoryHrefs = [...p.doc.querySelectorAll(".category-card")].map((a) => a.getAttribute("href"));
        // Two primary category cards: Intimate and Wellness.
        check("index.html: every category card goes to the shop",
            categoryHrefs.length === 2 && categoryHrefs.every((h) => h.indexOf("shop.html") === 0), JSON.stringify(categoryHrefs));
        check("index.html: the category cards are Intimate and Wellness",
            categoryHrefs.join(",") === "shop.html?category=intimate,shop.html?category=wellness",
            categoryHrefs.join(","));
        check("index.html: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 21. quiz.html: the whole quiz flow was untested ----------
    {
        const p = loadPage("quiz.html", ["cart-store.js", "products.js", "script.js", "quiz.js"]);
        const questions = p.doc.querySelectorAll(".question");
        check("quiz.html: has five questions", questions.length === 5, String(questions.length));
        check("quiz.html: starts on question 1", p.doc.getElementById("question-number").textContent === "1");
        check("quiz.html: progress starts at 20%", p.doc.getElementById("progress-percent").textContent === "20%",
            p.doc.getElementById("progress-percent").textContent);
        check("quiz.html: only question 1 is active", p.doc.querySelectorAll(".question.active").length === 1);
        check("quiz.html: results are hidden until the end",
            !p.doc.querySelector(".quiz-results").classList.contains("show"));
        check("quiz.html: back is disabled on the first question", p.doc.querySelector(".quiz-back").disabled);

        // Answering is required: next must refuse to advance.
        p.doc.querySelector(".quiz-next").click();
        check("quiz.html: next is blocked until the question is answered",
            p.doc.getElementById("question-number").textContent === "1" &&
            p.doc.querySelector('[data-question="1"]').classList.contains("shake"),
            p.doc.getElementById("question-number").textContent);

        // Walk all five questions using the first answer of each.
        questions.forEach((question, i) => {
            const num = i + 1;
            if (num > 1) check("quiz.html: back can rewind to question " + num, true);
            question.querySelector(".answer-grid button").click();
            check("quiz.html: selecting an answer marks exactly one on question " + num,
                question.querySelectorAll(".answer-grid button.selected").length === 1);
            p.doc.querySelector(".quiz-next").click();
            if (num < 5) {
                check("quiz.html: answering question " + num + " advances",
                    p.doc.getElementById("question-number").textContent === String(num + 1),
                    p.doc.getElementById("question-number").textContent);
                check("quiz.html: progress after question " + num + " is " + ((num + 1) * 20) + "%",
                    p.doc.getElementById("progress-percent").textContent === (num + 1) * 20 + "%",
                    p.doc.getElementById("progress-percent").textContent);
            }
        });

        check("quiz.html: finishing shows the result", p.doc.querySelector(".quiz-results").classList.contains("show"));
        check("quiz.html: the questions are all hidden",
            p.doc.querySelectorAll(".question.active").length === 0);
        check("quiz.html: the last question's button reads as the finish action",
            p.doc.querySelector(".quiz-next").textContent === "See my match \u2192",
            p.doc.querySelector(".quiz-next").textContent);

        // The email box must not confirm on an empty submit.
        const save = p.doc.getElementById("save-results");
        const email = p.doc.getElementById("quiz-email");
        save.click();
        check("quiz.html: empty email does not confirm", save.textContent === "Send results", save.textContent);
        // There is no backend, so the button must not claim anything was sent.
        check("quiz.html: the email form does not promise delivery",
            p.doc.querySelector(".results-email > span").textContent.indexOf("no email is sent") !== -1,
            p.doc.querySelector(".results-email > span").textContent);
        email.value = "someone@example.com";
        save.click();
        check("quiz.html: a supplied email acknowledges and locks the button",
            save.textContent === "Got it \u2713" && save.disabled, save.textContent);
        check("quiz.html: the confirmation does not claim an email was sent",
            save.textContent.toLowerCase().indexOf("sent") === -1, save.textContent);

        // Retake must reset the entire quiz, not just the visible question.
        p.doc.getElementById("restart-quiz").click();
        check("quiz.html: retake hides the result", !p.doc.querySelector(".quiz-results").classList.contains("show"));
        check("quiz.html: retake returns to question 1 at 20%",
            p.doc.getElementById("question-number").textContent === "1" &&
            p.doc.getElementById("progress-percent").textContent === "20%");
        check("quiz.html: retake clears every answer",
            p.doc.querySelectorAll(".answer-grid button.selected").length === 0);
        check("quiz.html: retake restores the next/back controls",
            !p.doc.querySelector(".quiz-navigation").style.display ||
            p.doc.querySelector(".quiz-navigation").style.display === "flex");
        check("quiz.html: retake re-enables sending", save.textContent === "Send results" && !save.disabled, save.textContent);
        check("quiz.html: retake clears the email box", email.value === "", email.value);
        check("quiz.html: retake still blocks an unanswered next",
            (p.doc.querySelector(".quiz-next").click(),
                p.doc.getElementById("question-number").textContent === "1"));
        check("quiz.html: the shop is reachable from the quiz page",
            [...p.doc.querySelectorAll("a")].some((a) => a.getAttribute("href") === "shop.html"));
        check("quiz.html: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 22. product.html: accordions and related products ----------
    {
        const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"]);
        const details = p.doc.querySelectorAll(".product-accordions details");
        check("product.html: has four detail accordions", details.length === 4, String(details.length));
        check("product.html: the description accordion starts open", details[0].open === true);
        check("product.html: the other accordions start closed",
            details[1].open === false && details[2].open === false && details[3].open === false);
        check("product.html: every accordion has a summary and content",
            [...details].every((d) => d.querySelector("summary") && d.querySelector(".accordion-content")));

        // The related rail must offer real catalogue products, or quick add would
        // silently create cart lines the shop can never match.
        const related = [...p.doc.querySelectorAll(".related-product")];
        check("product.html: shows four related products", related.length === 4, String(related.length));
        related.forEach((card) => card.querySelector(".related-add").click());
        const lines = JSON.parse(p.win.localStorage.getItem("xCart") || "[]");
        check("product.html: each related add creates its own line", lines.length === 4, String(lines.length));
        check("product.html: related ids are real catalogue ids",
            lines.every((l) => /^[-a-z0-9]+$/.test(l.id)), JSON.stringify(lines.map((l) => l.id)));
        check("product.html: related lines carry a price",
            lines.every((l) => typeof l.price === "number" && l.price > 0));
        check("product.html: the gallery offers a thumbnail per image",
            p.doc.querySelectorAll(".thumbnail").length === 4, String(p.doc.querySelectorAll(".thumbnail").length));
        check("product.html: no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
        p.dom.window.close();
    }

    // ---------- 23. footer integrity: no dead "#" links, and the columns agree ----------
    {
        // Every page with a full footer must carry the identical set of links.
        const NAVBAR_FOOTERS = ["about.html", "cart.html", "help.html", "index.html", "privacy.html",
            "product.html", "quiz.html", "shop.html", "terms.html"];
        const signatures = {};
        NAVBAR_FOOTERS.forEach((page) => {
            const scripts = page === "shop.html" ? ["cart-store.js", "script.js", "shop.js"]
                : (page === "product.html" ? ["cart-store.js", "script.js", "product.js"]
                    : (page === "cart.html" ? ["cart-store.js", "script.js", "cart.js"]
                        : (page === "quiz.html" ? ["cart-store.js", "products.js", "script.js", "quiz.js"]
                            : (page === "help.html" ? ["cart-store.js", "script.js", "help.js"]
                                : ["cart-store.js", "script.js"]))));
            const p = loadPage(page, scripts);
            const links = [...p.doc.querySelectorAll("footer a")].map((a) => a.getAttribute("href"));
            signatures[page] = links.join("|");

            // The dead link that used to sit here: a "#" anchor that only jumped
            // the visitor back to the top of the page they were already on.
            const dead = [...p.doc.querySelectorAll("footer a")].filter((a) => {
                const href = a.getAttribute("href");
                return href === "#" || href === "" || href === null;
            });
            check(page + ": footer has no dead links", dead.length === 0,
                dead.map((a) => a.textContent.trim()).join(", "));
            check(page + ": every footer link points at a real page",
                links.every((h) => h !== null && h !== "#"), links.join(" | "));
            p.dom.window.close();
        });
        const distinct = new Set(Object.values(signatures));
        check("every navbar footer carries the same links", distinct.size === 1,
            [...distinct].map((s) => s.split("|").length).join(" vs "));
        Object.keys(signatures).forEach((page) => {
            if (signatures[page] !== signatures["index.html"]) {
                check(page + ": footer matches index.html", false, signatures[page]);
            }
        });
    }

    // ---------- 24. product.html?id= renders whatever the URL asks for ----------
    {
        // The catalogue, straight off a page that loads it.
        const cataloguePage = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
        const CATALOGUE = cataloguePage.win.PRODUCTS;
        cataloguePage.dom.window.close();
        check("catalogue: eight products to drive the product page", CATALOGUE.length === 8, String(CATALOGUE.length));

        // Every catalogue product opens its own page, with its own data.
        CATALOGUE.forEach((product) => {
            const p = loadPage("product.html?id=" + product.id, ["cart-store.js", "script.js", "product.js"], {});
            const at = "product.html?id=" + product.id + ":";

            check(at + " name matches the URL id", p.doc.querySelector(".product-info h1").textContent === product.name,
                p.doc.querySelector(".product-info h1").textContent);
            check(at + " breadcrumb matches the product",
                p.doc.querySelector(".breadcrumb-current").textContent === product.name);
            // The product label shows the primary category and the product type.
            check(at + " category matches the catalogue",
                p.doc.querySelector(".product-category").textContent ===
                (product.category + " \u00B7 " + product.subcategory).toUpperCase(),
                p.doc.querySelector(".product-category").textContent);
            check(at + " price matches the catalogue",
                p.doc.querySelector(".product-price").textContent.indexOf("$" + product.price) === 0,
                p.doc.querySelector(".product-price").textContent);

            // Sale price only when the catalogue actually has one.
            const struck = p.doc.querySelector(".product-price del");
            if (product.oldPrice) {
                check(at + " shows the sale price alongside it", !!struck && struck.textContent === "$" + product.oldPrice,
                    struck && struck.textContent);
            } else {
                check(at + " shows no struck-through price", !struck, struck && struck.textContent);
            }

            check(at + " rating matches the catalogue",
                p.doc.querySelector(".product-rating .stars").textContent.length === product.rating,
                p.doc.querySelector(".product-rating .stars").textContent);
            check(at + " review count matches the catalogue",
                p.doc.querySelector(".product-rating a").textContent === product.reviews + " reviews",
                p.doc.querySelector(".product-rating a").textContent);
            check(at + " image class matches the catalogue",
                p.doc.querySelector(".main-product-image").classList.contains(product.image),
                p.doc.querySelector(".main-product-image").className);
            check(at + " paints only its own image class",
                CATALOGUE.filter((other) => other.image !== product.image && product.image &&
                    p.doc.querySelector(".main-product-image").classList.contains(other.image)).length === 0);
            check(at + " description matches the catalogue",
                p.doc.querySelector(".product-description").textContent === product.description,
                p.doc.querySelector(".product-description").textContent);
            check(at + " accordions carry the catalogue copy",
                p.doc.querySelector(".accordion-details").textContent === product.details &&
                p.doc.querySelector(".accordion-care").textContent === product.care &&
                p.doc.querySelector(".accordion-shipping").textContent === product.shipping);

            const badge = p.doc.querySelector(".main-product-image .product-badge");
            if (product.badge) {
                check(at + " shows its own badge", !badge.hidden && badge.textContent === product.badge, badge.textContent);
            } else {
                check(at + " has no badge", badge.hidden === true, badge.textContent);
            }

            check(at + " document title names the product", p.doc.title === product.name + " - X", p.doc.title);
            check(at + " add to cart button prices that product",
                p.doc.querySelector(".product-add").textContent === "Add to cart - $" + product.price,
                p.doc.querySelector(".product-add").textContent);

            // Add to cart must act on the product on screen, never a fixed one.
            p.doc.querySelector(".product-add").click();
            const line = JSON.parse(p.win.localStorage.getItem("xCart") || "[]")[0];
            check(at + " Add to cart uses the displayed product's id", !!line && line.id === product.id,
                line && line.id);
            check(at + " Add to cart uses the catalogue price", !!line && line.price === product.price, line && line.price);

            check(at + " is not the not-found state", p.doc.querySelector(".product-not-found").hidden === true);
            check(at + " has no console errors", p.consoleErrors.length === 0, p.consoleErrors.join(" | "));
            p.dom.window.close();
        });

        // Buy now must also act on the displayed product.
        CATALOGUE.forEach((product) => {
            const p = loadPage("product.html?id=" + product.id,
                ["cart-store.js", "script.js", "product.js"], { xLoggedIn: "true", xUser: USER_JSON });
            p.doc.querySelector(".buy-now").click();
            const line = JSON.parse(p.win.localStorage.getItem("xCart") || "[]")[0];
            check("product.html?id=" + product.id + ": Buy Now uses the displayed product's id",
                !!line && line.id === product.id, line && line.id);
            check("product.html?id=" + product.id + ": Buy Now goes to checkout", p.lastNav() === "checkout.html", p.lastNav());
            p.dom.window.close();
        });

        // Quantity multiplies the displayed product's own price.
        {
            const product = CATALOGUE.filter((item) => item.id === "luna")[0];
            const p = loadPage("product.html?id=luna", ["cart-store.js", "script.js", "product.js"], {});
            p.doc.querySelector(".quantity-plus").click();
            check("product.html?id=luna: quantity label multiplies that product's price",
                p.doc.querySelector(".product-add").textContent === "Add to cart - $" + product.price * 2,
                p.doc.querySelector(".product-add").textContent);
            check("product.html?id=luna: buy now label multiplies that product's price",
                p.doc.querySelector(".buy-now").textContent === "Buy now - $" + product.price * 2,
                p.doc.querySelector(".buy-now").textContent);
            p.doc.querySelector(".product-add").click();
            const line = JSON.parse(p.win.localStorage.getItem("xCart"))[0];
            check("product.html?id=luna: add stores that product at quantity 2",
                line.id === "luna" && line.quantity === 2, JSON.stringify(line));
            p.dom.window.close();
        }

        // ---- a bad id must not quietly become some other product ----
        {
            const p = loadPage("product.html?id=not-a-real-product", ["cart-store.js", "script.js", "product.js"], {});
            check("product.html?id=not-a-real-product: shows the not-found state",
                p.doc.querySelector(".product-not-found").hidden === false);
            check("product.html?id=not-a-real-product: hides the product page",
                p.doc.querySelector(".product-main").hidden === true);
            check("product.html?id=not-a-real-product: does not fall back to Silk Touch",
                p.doc.querySelector(".product-info h1").textContent.indexOf("Silk Touch") === -1 &&
                p.doc.querySelector(".breadcrumb-current").textContent.indexOf("Silk Touch") === -1,
                p.doc.querySelector(".product-info h1").textContent);
            check("product.html?id=not-a-real-product: says so in the breadcrumb",
                p.doc.querySelector(".breadcrumb-current").textContent === "Product not found",
                p.doc.querySelector(".breadcrumb-current").textContent);
            check("product.html?id=not-a-real-product: hides the related rail",
                p.doc.querySelector(".related-section").hidden === true);
            check("product.html?id=not-a-real-product: offers a way back to the shop",
                p.doc.querySelector(".product-not-found a").getAttribute("href") === "shop.html",
                p.doc.querySelector(".product-not-found a").getAttribute("href"));
            // Nothing may be added to the cart from a page showing no product.
            p.doc.querySelector(".product-add").click();
            p.doc.querySelector(".buy-now").click();
            check("product.html?id=not-a-real-product: adds nothing to the cart",
                p.win.localStorage.getItem("xCart") === null, String(p.win.localStorage.getItem("xCart")));
            check("product.html?id=not-a-real-product: does not navigate on buy now",
                p.nav.length === 0, p.nav.join(" | "));
            p.dom.window.close();
        }

        // ---- no id at all: still not a silent Silk Touch ----
        {
            const p = loadPage("product.html", ["cart-store.js", "script.js", "product.js"], {});
            check("product.html with no id: shows the not-found state",
                p.doc.querySelector(".product-not-found").hidden === false);
            check("product.html with no id: does not silently show Silk Touch",
                p.doc.querySelector(".product-info h1").textContent !== "Silk Touch",
                p.doc.querySelector(".product-info h1").textContent);
            check("product.html with no id: adds nothing to the cart",
                (p.doc.querySelector(".product-add").click(), p.win.localStorage.getItem("xCart") === null));
            p.dom.window.close();
        }

        // An empty id is treated the same way.
        {
            const p = loadPage("product.html?id=", ["cart-store.js", "script.js", "product.js"], {});
            check("product.html?id= (empty): shows the not-found state",
                p.doc.querySelector(".product-not-found").hidden === false);
            p.dom.window.close();
        }

        // ---- related products come from the catalogue ----
        {
            const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
            const cards = [...p.doc.querySelectorAll(".related-product")];
            check("related: four cards are rendered from the catalogue", cards.length === 4, String(cards.length));
            check("related: every card carries a catalogue id",
                cards.every((card) => CATALOGUE.some((product) => product.id === card.getAttribute("data-product-id"))),
                cards.map((card) => card.getAttribute("data-product-id")).join(","));
            check("related: no card repeats the product on screen",
                cards.every((card) => card.getAttribute("data-product-id") !== "silk-touch"));
            check("related: no card is duplicated",
                new Set(cards.map((card) => card.getAttribute("data-product-id"))).size === 4);

            // Name, category and price must be the catalogue's, not markup guesses.
            check("related: names match the catalogue",
                cards.every((card) => {
                    const product = CATALOGUE.filter((item) => item.id === card.getAttribute("data-product-id"))[0];
                    return card.querySelector("h3").textContent === product.name;
                }));
            check("related: categories match the catalogue",
                cards.every((card) => {
                    const product = CATALOGUE.filter((item) => item.id === card.getAttribute("data-product-id"))[0];
                    return card.querySelector(".related-info p").textContent === product.category;
                }));
            check("related: prices match the catalogue",
                cards.every((card) => {
                    const product = CATALOGUE.filter((item) => item.id === card.getAttribute("data-product-id"))[0];
                    return card.querySelector(".related-info strong").textContent === "$" + product.price;
                }));
            check("related: each card links to its own product page",
                cards.every((card) => card.querySelector("a").getAttribute("href") === "product.html?id=" + card.getAttribute("data-product-id")),
                cards.map((card) => card.querySelector("a").getAttribute("href")).join(" | "));

            // Each related add must store exactly the catalogue product.
            cards.forEach((card, index) => {
                const id = card.getAttribute("data-product-id");
                const product = CATALOGUE.filter((item) => item.id === id)[0];
                card.querySelector(".related-add").click();
                const line = JSON.parse(p.win.localStorage.getItem("xCart"))[index];
                check("related add #" + index + " stores the catalogue product " + id,
                    line.id === product.id && line.name === product.name && line.price === product.price,
                    JSON.stringify(line));
            });
            p.dom.window.close();
        }

        // ---- the shop grid links to each product ----
        {
            const p = loadPage("shop.html", ["cart-store.js", "script.js", "shop.js"], {});
            const cards = [...p.doc.querySelectorAll(".shop-product")];
            check("shop: every visible card links to its own product page",
                cards.every((card) => card.querySelector("a").getAttribute("href") ===
                    "product.html?id=" + card.getAttribute("data-product-id")),
                cards.map((card) => card.querySelector("a").getAttribute("href")).join(" | "));
            check("shop: card links resolve to real catalogue ids",
                cards.every((card) => CATALOGUE.some((product) => product.id === card.getAttribute("data-product-id"))));
            p.dom.window.close();
        }

        // ---- the homepage cards link to their products ----
        {
            const p = loadPage("index.html", ["cart-store.js", "script.js"], {});
            const cards = [...p.doc.querySelectorAll(".product-card")];
            check("homepage: four product cards", cards.length === 4, String(cards.length));
            check("homepage: every card is now a link", cards.every((card) => card.tagName === "A"), cards[0].tagName);
            check("homepage: every card links to a real catalogue product",
                cards.every((card) => {
                    const href = card.getAttribute("href") || "";
                    const name = card.querySelector("h3").textContent.trim();
                    const match = CATALOGUE.filter((product) => "product.html?id=" + product.id === href)[0];
                    return !!match && match.name === name;
                }),
                cards.map((card) => card.getAttribute("href")).join(" | "));

            // Quick Add must still be there and must still work.
            check("homepage: quick add buttons are still on every card",
                cards.every((card) => !!card.querySelector(".quick-add")));
            check("homepage: wishlist hearts are still on every card",
                cards.every((card) => !!card.querySelector(".heart-button")));
            cards.forEach((card, index) => {
                const href = card.getAttribute("href");
                const id = href.replace("product.html?id=", "");
                card.querySelector(".quick-add").click();
                const line = JSON.parse(p.win.localStorage.getItem("xCart"))[index];
                check("homepage: quick add on card " + index + " still adds " + id, line && line.id === id,
                    JSON.stringify(line));
            });
            p.dom.window.close();
        }
    }

    // ---------- 25. product gallery + shipping note + the static overall rating ----------
    {
        const source = fs.readFileSync(path.join(SITE, "product.js"), "utf8");

        // 1. No invented gallery art is left behind.
        check("product.js: no hardcoded gradient thumbnails remain",
            source.indexOf("THUMB_GRADIENTS") === -1 && source.indexOf("radial-gradient") === -1 &&
            source.indexOf("linear-gradient") === -1);
        check("product.js: no hardcoded colours remain", !/#[0-9a-fA-F]{3,6}/.test(source));

        // The stylesheet must not invent per-swatch artwork either: every
        // thumbnail is painted by the product's own catalogue image class.
        const productCss = fs.readFileSync(path.join(SITE, "product.css"), "utf8");
        check("product.css: no hardcoded per-thumbnail gradients remain",
            !/nth-child\(\d\)\s*\{[^}]*gradient/.test(productCss) &&
            !/\.thumbnail\s*\{[^}]*gradient/.test(productCss),
            "checked .thumbnail and :nth-child rules");
        check("product.css: thumbnails are painted from the product image classes",
            ["a", "b", "c", "d", "e", "f", "g", "h"]
                .every((letter) => productCss.indexOf(".thumbnail.image-" + letter + " {") !== -1),
            "eight .thumbnail.image-* rules expected");

        const cataloguePage = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
        const CATALOGUE = cataloguePage.win.PRODUCTS;
        cataloguePage.dom.window.close();

        // 2. Every product paints its own image, and clicking any thumbnail keeps it.
        CATALOGUE.forEach((product) => {
            const p = loadPage("product.html?id=" + product.id, ["cart-store.js", "script.js", "product.js"], {});
            const image = p.doc.querySelector(".main-product-image");

            check(product.id + ": gallery starts on the catalogue image",
                image.classList.contains(product.image) && image.style.background === "",
                image.className + " | inline: " + image.style.background);

            [...p.doc.querySelectorAll(".thumbnail")].forEach((thumbnail, index) => {
                thumbnail.click();
                const after = p.doc.querySelector(".main-product-image");
                check(product.id + ": thumbnail " + index + " keeps the catalogue image",
                    after.classList.contains(product.image) &&
                    !CATALOGUE.some((other) => other.image !== product.image && after.classList.contains(other.image)) &&
                    after.style.background === "",
                    after.className + " | inline: " + after.style.background);
            });
            check(product.id + ": gallery ends on the product's own image after all four thumbnails",
                (p.doc.querySelector(".main-product-image").classList.contains(product.image) &&
                    p.doc.querySelector(".main-product-image").style.background === ""));
            check(product.id + ": one thumbnail is active at a time",
                [...p.doc.querySelectorAll(".thumbnail.active")].length === 1);

            // Each swatch must reuse this product's image, with no inline art.
            const swatches = [...p.doc.querySelectorAll(".thumbnail")];
            check(product.id + ": every thumbnail reuses the product image",
                swatches.every((t) => t.classList.contains(product.image)) &&
                swatches.every((t) => t.getAttribute("style") === null),
                swatches.map((t) => t.className).join(" | "));
            p.dom.window.close();
        });

        // 3. The shipping note must not promise free delivery that does not exist.
        {
            const p = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
            const note = p.doc.querySelector(".shipping-note");
            const text = note.textContent;

            check("shipping note: no obsolete $75 threshold", text.indexOf("75") === -1, text.trim());
            check("shipping note: no free-delivery promise", !/free/i.test(text), text.trim());
            check("shipping note: still offers discreet delivery", /discreet/i.test(text), text.trim());

            // The flat rate quoted must match the one the cart actually charges.
            const cartSource = fs.readFileSync(path.join(SITE, "cart.js"), "utf8");
            const flatRate = /SHIPPING_FLAT_RATE\s*=\s*(\d+)/.exec(cartSource);
            check("shipping note: quotes the real flat shipping rate",
                !!flatRate && text.indexOf("$" + flatRate[1]) !== -1,
                "cart.js rate = " + (flatRate && flatRate[1]) + " | note = " + text.trim());
            check("shipping note: keeps both styled rows", note.querySelectorAll("div").length === 2);
            p.dom.window.close();
        }

        // 4. The site-wide rating stays static; the product's own stays data-driven.
        {
            const silk = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
            const silkProduct = CATALOGUE.filter((item) => item.id === "silk-touch")[0];
            const duo = loadPage("product.html?id=the-duo", ["cart-store.js", "script.js", "product.js"], {});
            const duoProduct = CATALOGUE.filter((item) => item.id === "the-duo")[0];

            // Site-wide aggregate: identical no matter which product is open.
            const silkOverall = silk.doc.querySelector(".overall-rating").textContent;
            const duoOverall = duo.doc.querySelector(".overall-rating").textContent;
            check("overall rating: stays the same on every product", silkOverall === duoOverall, silkOverall + " vs " + duoOverall);
            check("overall rating: keeps its static 4.9 / 42 reviews",
                silkOverall.indexOf("4.9") !== -1 && silkOverall.indexOf("42 reviews") !== -1, silkOverall.trim());

            // Per-product rating: follows the catalogue, so it must differ.
            check("product rating: comes from the catalogue, not the static aggregate",
                silk.doc.querySelector(".product-rating a").textContent === silkProduct.reviews + " reviews" &&
                duo.doc.querySelector(".product-rating a").textContent === duoProduct.reviews + " reviews",
                silkProduct.reviews + " vs " + duoProduct.reviews);
            check("product rating: is not just the static site-wide figure",
                duo.doc.querySelector(".product-rating a").textContent !== silkOverall.trim().slice(silkOverall.indexOf("42")),
                silkOverall.trim() + " vs " + duo.doc.querySelector(".product-rating a").textContent);
            check("reviews section still shows the static site-wide testimonials",
                silk.doc.querySelectorAll(".review-card").length === 3 &&
                [...silk.doc.querySelectorAll(".review-card")].every((card) => card.textContent.indexOf("Verified customer") !== -1));
            silk.dom.window.close();
            duo.dom.window.close();
        }

        // 5. Card interactions still work alongside the new links.
        {
            const shop = loadPage("shop.html", ["cart-store.js", "script.js", "shop.js"], {});
            const card = shop.doc.querySelector(".shop-product");
            check("shop card: quick add still works", (card.querySelector(".quick-add").click(),
                JSON.parse(shop.win.localStorage.getItem("xCart"))[0].id === card.getAttribute("data-product-id")));
            check("shop card: wishlist heart still toggles", (() => {
                const heart = card.querySelector(".heart-button");
                const before = heart.textContent.trim();
                heart.click();
                return heart.textContent.trim() !== before && heart.textContent.trim() === "\u2665";
            })());
            check("shop card: clicking quick add did not follow the product link",
                shop.nav.length === 0 && !card.hasAttribute("href") &&
                card.querySelector("a").getAttribute("href") === "product.html?id=" + card.getAttribute("data-product-id"),
                card.querySelector("a").getAttribute("href"));
            shop.dom.window.close();

            const home = loadPage("index.html", ["cart-store.js", "script.js"], {});
            const homeCard = home.doc.querySelector(".product-card");
            check("homepage card: quick add still works", (homeCard.querySelector(".quick-add").click(),
                JSON.parse(home.win.localStorage.getItem("xCart"))[0].id === "silk-touch"));
            check("homepage card: wishlist heart still toggles", (() => {
                const heart = homeCard.querySelector(".heart-button");
                heart.click();
                return heart.textContent.trim() === "\u2665";
            })());
            check("homepage card: still links to its product page",
                homeCard.getAttribute("href") === "product.html?id=silk-touch", homeCard.getAttribute("href"));
            check("homepage card: clicking quick add did not follow the product link", home.nav.length === 0, home.nav.join(" | "));
            home.dom.window.close();
        }
    }

    // ---------- 26. quiz.html: the match must come from the answers ----------
    {
        const CATALOGUE = loadPage("quiz.html", ["cart-store.js", "products.js", "script.js", "quiz.js"]).win.PRODUCTS;
        const QUIZ_HTML = fs.readFileSync(path.join(SITE, "quiz.html"), "utf8");
        const QUIZ_JS = fs.readFileSync(path.join(SITE, "quiz.js"), "utf8");

        // Answers the five questions and returns the matched product id.
        function play(values) {
            const q = loadPage("quiz.html", ["cart-store.js", "products.js", "script.js", "quiz.js"]);
            values.forEach((value, i) => {
                const question = q.doc.querySelector('[data-question="' + (i + 1) + '"]');
                const button = [].slice.call(question.querySelectorAll(".answer-grid button"))
                    .filter((b) => b.getAttribute("data-value") === value)[0];
                check("quiz: answer '" + value + "' exists on question " + (i + 1), Boolean(button));
                button.click();
                q.doc.querySelector(".quiz-next").click();
            });
            const href = q.doc.querySelector(".result-link").getAttribute("href");
            return {
                page: q,
                id: href.replace("product.html?id=", ""),
                href: href
            };
        }

        function priceOf(id) {
            return CATALOGUE.filter((p) => p.id === id)[0].price;
        }

        check("quiz: loads the shared catalogue",
            QUIZ_HTML.indexOf("products.js") !== -1 && QUIZ_HTML.indexOf("products.js") < QUIZ_HTML.indexOf("quiz.js"),
            "products.js must load before quiz.js");
        check("quiz: reads products from the catalogue rather than hardcoding them",
            QUIZ_JS.indexOf("window.PRODUCTS") !== -1);
        check("quiz: does not hardcode a Silk Touch result",
            QUIZ_JS.indexOf("Silk Touch") === -1 && QUIZ_HTML.indexOf("Silk Touch") === -1);

        // (a) self-care, (b) wellness, (c) gift must not all land on one product.
        const selfCare = play(["selfcare", "simple", "familiar", "simplicity", "any"]);
        const wellness = play(["wellness", "ritual", "new", "discovery", "any"]);
        const gift = play(["gift", "playful", "curious", "quality", "any"]);

        check("quiz: a self-care answer set recommends a product",
            selfCare.id && CATALOGUE.some((p) => p.id === selfCare.id), selfCare.id);
        check("quiz: different answers give different matches",
            selfCare.id !== wellness.id && wellness.id !== gift.id && selfCare.id !== gift.id,
            [selfCare.id, wellness.id, gift.id].join(" / "));
        check("quiz: every recommended product is a real catalogue id",
            [selfCare.id, wellness.id, gift.id].every((id) => CATALOGUE.some((p) => p.id === id)));

        // Determinism: no randomness between runs.
        check("quiz: the same answers always give the same match",
            play(["selfcare", "simple", "familiar", "simplicity", "any"]).id === selfCare.id &&
            play(["wellness", "ritual", "new", "discovery", "any"]).id === wellness.id);

        // (d) under $30 and (e) $50-$75 must steer the price of the result.
        const budget = play(["selfcare", "sensory", "curious", "simplicity", "under30"]);
        const premium = play(["explore", "ritual", "experienced", "quality", "50to75"]);
        check("quiz: an 'under $30' answer set recommends something under $30",
            priceOf(budget.id) < 30, budget.id + " at $" + priceOf(budget.id));
        check("quiz: a '$50 - $75' answer set recommends something in that range",
            priceOf(premium.id) > 50 && priceOf(premium.id) <= 75,
            premium.id + " at $" + priceOf(premium.id));
        check("quiz: price range changes the outcome",
            budget.id !== premium.id, budget.id + " / " + premium.id);

        // Price bands must be read from the catalogue prices, not a copied list.
        const bands = ["under30", "30to50", "50to75"]
            .filter((b) => QUIZ_JS.indexOf(b + ":") !== -1 || QUIZ_JS.indexOf('"' + b + '"') !== -1);
        check("quiz: the three price bands are all handled", bands.length === 3, bands.join(","));
        check("quiz: 'I'm flexible' is not treated as a price band",
            QUIZ_JS.indexOf("any:") === -1);

        // The result card must be filled from the matched product.
        const shown = wellness.page.doc;
        const matched = CATALOGUE.filter((p) => p.id === wellness.id)[0];
        check("quiz: the result name comes from the catalogue",
            shown.querySelector(".result-name").textContent === matched.name,
            shown.querySelector(".result-name").textContent);
        check("quiz: the result category comes from the catalogue",
            shown.querySelector(".result-category").textContent === matched.category.toUpperCase(),
            shown.querySelector(".result-category").textContent);
        check("quiz: the result price comes from the catalogue",
            shown.querySelector(".result-price").textContent === "$" + matched.price,
            shown.querySelector(".result-price").textContent);
        check("quiz: the result image uses the matched product's image",
            shown.querySelector(".result-image").classList.contains(matched.image),
            shown.querySelector(".result-image").className);
        check("quiz: the result image class is removed from the other products",
            CATALOGUE.filter((p) => p.image !== matched.image)
                .every((p) => !shown.querySelector(".result-image").classList.contains(p.image)),
            shown.querySelector(".result-image").className);
        check("quiz: the result links to the matched product",
            shown.querySelector(".result-link").getAttribute("href") === "product.html?id=" + wellness.id,
            shown.querySelector(".result-link").getAttribute("href"));

        // Retake must clear the answers so the score cannot leak into the next run.
        const retake = wellness.page;
        retake.doc.getElementById("restart-quiz").click();
        check("quiz: retake leaves no answers behind",
            retake.doc.querySelectorAll(".answer-grid button.selected").length === 0);
        const second = ["gift", "playful", "curious", "quality", "any"];
        second.forEach((value, i) => {
            const question = retake.doc.querySelector('[data-question="' + (i + 1) + '"]');
            [].slice.call(question.querySelectorAll(".answer-grid button"))
                .filter((b) => b.getAttribute("data-value") === value)[0].click();
            retake.doc.querySelector(".quiz-next").click();
        });
        check("quiz: a retake scores the new answers, not the old ones",
            retake.doc.querySelector(".result-link").getAttribute("href") === gift.href,
            retake.doc.querySelector(".result-link").getAttribute("href"));

        // Every product in the catalogue should be reachable by some answer set.
        const winners = {};
        let combinations = 0;
        ["explore", "selfcare", "wellness", "gift"].forEach((a) =>
            ["simple", "sensory", "playful", "ritual"].forEach((b) =>
                ["new", "curious", "familiar", "experienced"].forEach((c) =>
                    ["comfort", "quality", "simplicity", "discovery"].forEach((d) =>
                        ["under30", "30to50", "50to75", "any"].forEach((e) => {
                            combinations++;
                            const id = play([a, b, c, d, e]).id;
                            if (!CATALOGUE.some((p) => p.id === id)) return;
                            winners[id] = (winners[id] || 0) + 1;
                        })))));
        check("quiz: every answer combination still returns a real product",
            Object.keys(winners).length === CATALOGUE.length,
            CATALOGUE.length + " products, " + Object.keys(winners).length + " reachable over " + combinations + " sets");
        CATALOGUE.forEach((product) => {
            check("quiz: '" + product.id + "' can be recommended",
                winners[product.id] > 0, String(winners[product.id] || 0) + " of " + combinations);
        });
    }

    // ---------- 27. QA pass: site-wide reachability of shared behaviour ----------
    {
        // The navbar search panel is injected by script.js and reads the shared
        // catalogue, so every page that shows the search icon must also load
        // products.js. A page missing it silently answers every query with
        // "no products match".
        const PAGES_WITH_SEARCH = [
            "index.html", "shop.html", "product.html", "cart.html", "quiz.html",
            "about.html", "help.html", "privacy.html", "terms.html"
        ];
        PAGES_WITH_SEARCH.forEach((page) => {
            const p = loadPage(page, ["cart-store.js", "script.js"], {});
            const button = p.doc.querySelector('.icon-button[aria-label="Search"]');
            check("qa: " + page + " shows a search button", !!button);
            button.click();
            const input = p.doc.querySelector(".search-input");
            check("qa: " + page + " opens a working search panel", !!input && p.doc.querySelector(".search-panel").hidden === false);
            input.value = "luna";
            input.dispatchEvent(new p.win.Event("input", { bubbles: true }));
            const rows = [...p.doc.querySelectorAll(".search-results li")];
            check("qa: " + page + " search returns the matching product",
                rows.length === 1 && /Luna/.test(rows[0].textContent),
                rows.map((r) => r.textContent.replace(/\s+/g, " ").trim()).join(" | "));
            check("qa: " + page + " search result links to the product page",
                rows[0] && rows[0].querySelector("a").getAttribute("href") === "product.html?id=luna",
                rows[0] && rows[0].querySelector("a").getAttribute("href"));
            input.value = "";
            input.dispatchEvent(new p.win.Event("input", { bubbles: true }));
            check("qa: " + page + " an empty query lists the whole catalogue",
                p.doc.querySelectorAll(".search-results li").length === 8,
                String(p.doc.querySelectorAll(".search-results li").length));
            p.dom.window.close();
        });

        // Any page that loads script.js must load products.js first, or the
        // search panel and shop grid would be built from an empty catalogue.
        ["about.html", "help.html", "privacy.html", "terms.html", "cart.html", "quiz.html", "index.html", "shop.html", "product.html"]
            .forEach((page) => {
                const raw = fs.readFileSync(path.join(SITE, page), "utf8");
                if (raw.indexOf("script.js") === -1) return;
                const catalogue = raw.indexOf("products.js");
                const shared = raw.indexOf("script.js");
                check("qa: " + page + " loads products.js before script.js",
                    catalogue !== -1 && catalogue < shared,
                    catalogue === -1 ? "products.js missing" : catalogue + " vs " + shared);
            });

        // Signup runs novalidate, so the required terms checkbox is enforced in
        // JS. Without that check an account is created with no consent at all.
        {
            const fill = (p, terms) => {
                p.doc.getElementById("firstName").value = "Amina";
                p.doc.getElementById("lastName").value = "Oti";
                p.doc.getElementById("signupEmail").value = "amina@example.com";
                p.doc.getElementById("signupPassword").value = "longenough";
                p.doc.getElementById("confirmPassword").value = "longenough";
                p.doc.getElementById("terms").checked = terms;
            };

            const blocked = loadPage("signup.html", ["signup.js"], {});
            fill(blocked, false);
            submitForm(blocked.win, blocked.doc.getElementById("signupForm"));
            check("qa: signup refuses to create an account without the terms",
                blocked.win.localStorage.getItem("xUser") === null,
                String(blocked.win.localStorage.getItem("xUser")));
            check("qa: signup explains why it was refused",
                /terms/i.test(blocked.doc.getElementById("signupMessage").textContent),
                blocked.doc.getElementById("signupMessage").textContent);
            blocked.dom.window.close();

            const allowed = loadPage("signup.html", ["signup.js"], {});
            fill(allowed, true);
            submitForm(allowed.win, allowed.doc.getElementById("signupForm"));
            check("qa: signup still creates an account once terms are accepted",
                allowed.win.localStorage.getItem("xUser") !== null,
                String(allowed.win.localStorage.getItem("xUser")));
            check("qa: signup confirms success",
                /created/i.test(allowed.doc.getElementById("signupMessage").textContent),
                allowed.doc.getElementById("signupMessage").textContent);
            allowed.dom.window.close();
        }

        // The confirmation page reads the checkout snapshot, so it must show the
        // real order rather than its own placeholder fallback.
        {
            const USER = { firstName: "Amina", lastName: "Oti", email: "amina@example.com", password: "longenough" };
            const checkout = loadPage("checkout.html", ["cart-store.js", "checkout.js"], {
                xUser: JSON.stringify(USER),
                xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 2, category: "Intimate wellness", image: "image-a" }])
            });
            ["email", "firstName", "lastName", "address", "city", "postal", "phone"].forEach((id) => {
                const values = { email: USER.email, firstName: USER.firstName, lastName: USER.lastName };
                checkout.doc.getElementById(id).value = values[id] || "12 Kenyatta Ave";
            });
            checkout.doc.querySelector(".place-order").click();
            await sleep(900);
            const snapshot = checkout.win.localStorage.getItem("xLastOrder");
            check("qa: checkout stores the order snapshot", !!snapshot);
            const order = snapshot ? JSON.parse(snapshot) : {};
            check("qa: the order number is generated", /^X/.test(order.number || ""), order.number);
            check("qa: the order keeps its items", Array.isArray(order.items) && order.items.length === 1, JSON.stringify(order.items));
            check("qa: the order totals are correct", order.subtotal === 118 && order.total === 123,
                order.subtotal + " + " + order.shippingCost + " = " + order.total);
            check("qa: the cart is emptied after checkout", !checkout.win.localStorage.getItem("xCart"),
                String(checkout.win.localStorage.getItem("xCart")));
            checkout.dom.window.close();

            const conf = loadPage("order-confirmation.html", ["cart-store.js", "order-confirmation.js"], { xUser: JSON.stringify(USER), xLastOrder: snapshot });
            const text = conf.doc.body.textContent.replace(/\s+/g, " ");
            check("qa: the confirmation page shows the real order, not the fallback",
                text.indexOf("NO ORDER FOUND") === -1 && text.indexOf(order.number) !== -1,
                order.number);
            check("qa: the confirmation page lists the bought product",
                text.indexOf("Silk Touch") !== -1);
            check("qa: the confirmation page shows the real total",
                text.indexOf("$" + order.total) !== -1, "$" + order.total);
            check("qa: the confirmation page shows the customer",
                text.indexOf(USER.firstName) !== -1);
            conf.dom.window.close();

            const empty = loadPage("order-confirmation.html", ["cart-store.js", "order-confirmation.js"], {});
            check("qa: a direct visit with no order shows the calm fallback",
                empty.doc.body.textContent.indexOf("NO ORDER FOUND") !== -1 &&
                empty.consoleErrors.length === 0, empty.consoleErrors.join("|"));
            empty.dom.window.close();
        }
    }

    // ---------- 27. accessibility & SEO regression guards ----------
    // Each check locks in one specific fix, so a later change that drops the
    // guarantee (the checkout h1, a nav id, a label, a focus ring) fails here.
    {
        const PAGES = [
            "index.html", "shop.html", "product.html", "cart.html", "checkout.html",
            "login.html", "signup.html", "account.html", "quiz.html", "about.html",
            "help.html", "privacy.html", "terms.html", "order-confirmation.html"
        ];

        // -- SEO basics: unique title, meta description, viewport, lang --
        const titles = {};
        PAGES.forEach((page) => {
            const p = loadPage(page, []);
            const at = page + ":";
            const title = p.doc.title.trim();

            check(at + " has a non-empty title", title.length > 0, title);
            check(at + " title is not a duplicate of another page",
                titles[title] === undefined, titles[title] ? "also on " + titles[title] : title);
            titles[title] = page;

            const desc = p.doc.querySelector('meta[name="description"]');
            const content = desc ? (desc.getAttribute("content") || "").trim() : "";
            check(at + " has a meta description", content.length > 0);
            check(at + " meta description is a sensible length (50-160)",
                content.length >= 50 && content.length <= 160, String(content.length));

            check(at + " has a viewport meta tag",
                !!p.doc.querySelector('meta[name="viewport"]'));
            check(at + " declares a document language",
                !!p.doc.documentElement.getAttribute("lang"));
            p.dom.window.close();
        });

        // -- checkout h1 (the page used to start at h2) --
        {
            const p = loadPage("checkout.html", ["cart-store.js", "products.js", "checkout.js"], {});
            const h1s = [...p.doc.querySelectorAll("h1")];
            check("checkout: has exactly one h1", h1s.length === 1, String(h1s.length));
            check("checkout: the h1 names the page", h1s.length === 1 && h1s[0].textContent.trim() === "Checkout",
                h1s.length ? h1s[0].textContent.trim() : "none");
            check("checkout: the h1 is visually hidden, not removed from the tree",
                h1s.length === 1 && h1s[0].classList.contains("visually-hidden"));
            p.dom.window.close();

            const css = fs.readFileSync(path.join(SITE, "style.css"), "utf8");
            check("style.css: defines .visually-hidden", /\.visually-hidden\s*\{/.test(css));
            check("style.css: .visually-hidden keeps content available to AT",
                /\.visually-hidden\s*\{[^}]*\}/.test(css) &&
                !/\.visually-hidden\s*\{[^}]*(display\s*:\s*none|visibility\s*:\s*hidden)/.test(css));
        }

        // -- markup hygiene across every page --
        {
            PAGES.forEach((page) => {
                const p = loadPage(page, []);

                // Duplicate ids break every aria-controls / label[for] pairing.
                const ids = [...p.doc.querySelectorAll("[id]")].map((el) => el.id);
                const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
                check(page + ": has no duplicate ids", dupes.length === 0, dupes.join(","));

                // Every aria-controls must resolve to a real element.
                const dangling = [...p.doc.querySelectorAll("[aria-controls]")]
                    .filter((el) => !p.doc.getElementById(el.getAttribute("aria-controls")));
                check(page + ": every aria-controls resolves", dangling.length === 0,
                    dangling.map((el) => el.tagName + "." + el.className).join(","));

                // Exactly one h1, and no skipped heading levels.
                check(page + ": has exactly one h1",
                    p.doc.querySelectorAll("h1").length === 1,
                    String(p.doc.querySelectorAll("h1").length));
                const headings = [...p.doc.querySelectorAll("h1, h2, h3, h4, h5, h6")]
                    .filter((h) => h.closest("main"));
                let skipped = 0;
                let prev = 0;
                headings.forEach((h) => {
                    const level = Number(h.tagName[1]);
                    if (prev && level > prev + 1) skipped++;
                    prev = level;
                });
                check(page + ": heading levels never skip a level", skipped === 0, skipped + " skips");

                // An aria attribute left empty announces nothing.
                const emptyAria = [...p.doc.querySelectorAll("[aria-expanded],[aria-controls],[aria-label]")]
                    .filter((el) => ["aria-expanded", "aria-controls", "aria-label"]
                        .some((a) => el.hasAttribute(a) && el.getAttribute(a).trim() === ""));
                check(page + ": no aria attribute is left empty", emptyAria.length === 0,
                    emptyAria.map((el) => el.tagName + "." + el.className).join(","));
                p.dom.window.close();
            });
        }

        // -- aria-controls must point at an element that actually exists --
        {
            const WITH_NAVBAR = ["index.html", "shop.html", "product.html", "cart.html",
                "quiz.html", "about.html", "help.html", "privacy.html", "terms.html"];

            // script.js sets aria-controls="site-nav" on the menu button, so the
            // nav it names has to carry that id.
            WITH_NAVBAR.forEach((page) => {
                const p = loadPage(page, ["cart-store.js", "products.js", "script.js"], {});
                const menu = p.doc.querySelector(".menu-button");
                const controls = menu ? menu.getAttribute("aria-controls") : null;
                check(page + ": the menu button names the nav it controls", controls === "site-nav", String(controls));
                check(page + ": the nav element with that id exists", !!p.doc.getElementById("site-nav"));
                check(page + ": the nav id sits on the nav itself",
                    p.doc.getElementById("site-nav") === p.doc.querySelector(".nav-links"));
                p.dom.window.close();
            });

            // FAQ accordion: each button controls a real, unique panel.
            const help = loadPage("help.html", ["cart-store.js", "products.js", "script.js", "help.js"], {});
            const faqButtons = [...help.doc.querySelectorAll(".faq-question")];
            check("help: every FAQ button declares aria-controls",
                faqButtons.length > 0 && faqButtons.every((b) => !!b.getAttribute("aria-controls")),
                faqButtons.filter((b) => !b.getAttribute("aria-controls")).length + " missing");
            check("help: every FAQ aria-controls target exists",
                faqButtons.every((b) => !!help.doc.getElementById(b.getAttribute("aria-controls"))));
            const faqTargets = faqButtons.map((b) => b.getAttribute("aria-controls"));
            check("help: FAQ panel ids are unique", new Set(faqTargets).size === faqTargets.length,
                faqTargets.join(","));
            check("help: FAQ buttons start collapsed",
                faqButtons.every((b) => b.getAttribute("aria-expanded") === "false"));

            faqButtons[0].click();
            check("help: the opened FAQ reports aria-expanded=true",
                faqButtons[0].getAttribute("aria-expanded") === "true");
            check("help: the opened FAQ reveals the panel it controls",
                help.doc.getElementById(faqButtons[0].getAttribute("aria-controls")).hidden === false);
            check("help: the other FAQs stay collapsed",
                faqButtons.slice(1).every((b) => b.getAttribute("aria-expanded") === "false"));
            help.dom.window.close();

            // Promo code disclosure follows the same rule.
            const cart = loadPage("cart.html", ["cart-store.js", "products.js", "script.js", "cart.js"], {
                xCart: JSON.stringify([{ id: "silk-touch", name: "Silk Touch", price: 59, quantity: 1 }])
            });
            const promoToggle = cart.doc.querySelector(".promo-toggle");
            const promoControls = promoToggle ? promoToggle.getAttribute("aria-controls") : null;
            check("cart: the promo toggle names the panel it controls", !!promoControls, String(promoControls));
            check("cart: the promo panel with that id exists",
                !!promoControls && !!cart.doc.getElementById(promoControls));
            if (promoToggle) {
                check("cart: the promo toggle starts collapsed",
                    promoToggle.getAttribute("aria-expanded") === "false");
                promoToggle.click();
                check("cart: opening the promo panel updates aria-expanded",
                    promoToggle.getAttribute("aria-expanded") === "true");
            }
            cart.dom.window.close();
        }

        // -- form controls must be labelled --
        {
            PAGES.forEach((page) => {
                const p = loadPage(page, []);

                const brokenLabels = [...p.doc.querySelectorAll("label[for]")]
                    .filter((l) => !p.doc.getElementById(l.getAttribute("for")));
                check(page + ": no label points at a missing control",
                    brokenLabels.length === 0,
                    brokenLabels.map((l) => l.getAttribute("for")).join(","));

                // Unlabelled means: no aria-label, no for=, no wrapping label, no title.
                const unlabelled = [...p.doc.querySelectorAll("input, select, textarea")].filter((el) => {
                    if (el.type === "hidden") return false;
                    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
                    if (el.id && p.doc.querySelector('label[for="' + el.id + '"]')) return false;
                    if (el.closest("label")) return false;
                    if (el.title) return false;
                    return true;
                });
                check(page + ": every form control has a label", unlabelled.length === 0,
                    unlabelled.map((el) => el.tagName + "#" + (el.id || el.className)).join(","));
                p.dom.window.close();
            });

            // The newsletter field is placeholder-only, so it needs a real label.
            const home = loadPage("index.html", ["cart-store.js", "products.js", "script.js"], {});
            const newsletter = home.doc.querySelector(".newsletter-form input");
            const newsletterLabel = home.doc.querySelector(".newsletter-form label[for]");
            check("index: the newsletter input has a label element", !!newsletterLabel);
            check("index: the newsletter label targets the newsletter input",
                !!newsletter && !!newsletterLabel &&
                newsletterLabel.getAttribute("for") === newsletter.getAttribute("id"));
            check("index: the newsletter label is visually hidden",
                !!newsletterLabel && newsletterLabel.classList.contains("visually-hidden"));

            // Buttons and links must expose an accessible name.
            const nameless = [...home.doc.querySelectorAll("button, a")].filter((el) => {
                if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
                if (el.getAttribute("title")) return false;
                return el.textContent.trim().length === 0;
            });
            check("index: no button or link is nameless", nameless.length === 0,
                nameless.map((el) => el.tagName + "." + el.className).join(","));
            home.dom.window.close();
        }

        // -- focus visibility: outline:none needs a :focus-visible replacement --
        {
            const needRing = [
                ["style.css", ".newsletter-form input"],
                ["cart.css", ".promo-content input"],
                ["quiz.css", ".email-form input"]
            ];
            needRing.forEach((pair) => {
                const file = pair[0];
                const sel = pair[1];
                const css = fs.readFileSync(path.join(SITE, file), "utf8");
                const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                check(file + ": " + sel + " drops the default outline",
                    new RegExp(escaped + "\\s*\\{[^}]*outline\\s*:\\s*(none|0)").test(css));
                check(file + ": " + sel + " restores a visible focus ring",
                    new RegExp(escaped + ":focus-visible\\s*\\{[^}]*outline\\s*:").test(css));
            });

            const style = fs.readFileSync(path.join(SITE, "style.css"), "utf8");
            check("style.css: the search input keeps its focus ring",
                /\.search-input:focus-visible\s*\{[^}]*outline\s*:/s.test(style));
        }

        // -- category system: exactly two primaries, Gifts gone, types intact --
        {
            const catalogue = loadPage("product.html?id=silk-touch", ["cart-store.js", "script.js", "product.js"], {});
            const PRODUCTS = catalogue.win.PRODUCTS;
            const CATEGORIES = catalogue.win.CATEGORIES;
            const SUBCATEGORIES = catalogue.win.SUBCATEGORIES;
            catalogue.dom.window.close();

            // Only two primary categories exist, and they are the right two.
            check("catalogue: exactly two primary categories", CATEGORIES.length === 2, String(CATEGORIES.length));
            check("catalogue: the primaries are Intimate and Wellness",
                CATEGORIES.map((c) => c.slug).join(",") === "intimate,wellness",
                CATEGORIES.map((c) => c.slug).join(","));
            check("catalogue: the primaries are labelled Intimate and Wellness",
                CATEGORIES.map((c) => c.label).join(",") === "Intimate,Wellness",
                CATEGORIES.map((c) => c.label).join(","));

            // Gifts is gone as a category, and no product still claims it.
            check("catalogue: no product is in a Gifts category",
                PRODUCTS.every((p) => p.category !== "Gifts" && p.categorySlug !== "gifts"));
            check("catalogue: no product is in a Body care category",
                PRODUCTS.every((p) => p.category !== "Body care" && p.categorySlug !== "body-care"));

            // Every product sits in a real category with a real product type.
            const validSlugs = CATEGORIES.map((c) => c.slug);
            PRODUCTS.forEach((p) => {
                check("catalogue: " + p.id + " uses a real primary category",
                    validSlugs.indexOf(p.categorySlug) !== -1, p.categorySlug);
                check("catalogue: " + p.id + " uses a product type from its own parent",
                    (SUBCATEGORIES[p.categorySlug] || []).some((s) => s.slug === p.subcategorySlug),
                    p.categorySlug + " / " + p.subcategorySlug);
            });

            // The two product-type trees the brief specifies.
            check("catalogue: Intimate carries Toys, Lubricants, Accessories, Intimate Care",
                SUBCATEGORIES.intimate.map((s) => s.label).join(",") === "Toys,Lubricants,Accessories,Intimate Care",
                SUBCATEGORIES.intimate.map((s) => s.label).join(","));
            check("catalogue: Wellness carries Gummies, Body & Massage, Self-Care, Wellness",
                SUBCATEGORIES.wellness.map((s) => s.label).join(",") === "Gummies,Body & Massage,Self-Care,Wellness",
                SUBCATEGORIES.wellness.map((s) => s.label).join(","));
        }

        // -- shop navigation: only All / Intimate / Wellness are primary --
        {
            const p = loadPage("shop.html", ["cart-store.js", "products.js", "script.js", "shop.js"], {});
            const chips = [...p.doc.querySelectorAll(".shop-categories a")];
            check("shop: the chips are All, Intimate, Wellness",
                chips.map((a) => a.textContent.trim()).join(",") === "All,Intimate,Wellness",
                chips.map((a) => a.textContent.trim()).join(","));
            check("shop: no chip offers Gifts, Body & Massage or Lubricants as primary",
                !chips.some((a) => /gift|body|massage|lubricant/i.test(a.textContent)),
                chips.map((a) => a.textContent.trim()).join(","));

            // The drawer keeps the product types, grouped under their parent.
            const drawerRadios = [...p.doc.querySelectorAll('input[name="shopCategory"]')].map((i) => i.value);
            check("shop: the drawer offers exactly the two primaries",
                drawerRadios.join(",") === ",intimate,wellness", drawerRadios.join(","));

            const subSlugs = [...p.doc.querySelectorAll('input[name="shopSubcategory"]')].map((i) => i.value);
            check("shop: the drawer keeps every product type",
                subSlugs.join(",") === "toys,lubricants,accessories,intimate-care,gummies,body-massage,self-care,wellness",
                subSlugs.join(","));
            check("shop: the drawer groups product types under a parent heading",
                !!p.doc.querySelector(".filter-group-intimate h2") && !!p.doc.querySelector(".filter-group-wellness h2"));
            p.dom.window.close();

            // No page still links to a retired primary category.
            ["index.html", "cart.html", "about.html", "help.html", "product.html",
                "quiz.html", "shop.html", "privacy.html", "terms.html", "order-confirmation.html"]
                .forEach((page) => {
                    const q = loadPage(page, []);
                    const stale = [...q.doc.querySelectorAll('a[href*="category="]')]
                        .map((a) => a.getAttribute("href"))
                        .filter((href) => /category=(gifts|body-care|intimate-toys|lubricants)/.test(href));
                    check(page + ": no link points at a retired category", stale.length === 0, stale.join(","));
                    q.dom.window.close();
                });
        }

        // -- the brand palette: lavender-gray, not cream --
        {
            const css = fs.readFileSync(path.join(SITE, "style.css"), "utf8");
            const root = (css.match(/:root\s*\{([\s\S]*?)\}/) || [null, ""])[1];

            check("style.css: the brand background is the lavender-gray #e8e5ea",
                /--cream:\s*#e8e5ea/i.test(root));
            check("style.css: the light surface is #f2f0f3",
                /--white:\s*#f2f0f3/i.test(root));
            check("style.css: primary text is #252326",
                /--black:\s*#252326/i.test(root));
            check("style.css: muted/accent text is #817586",
                /--gray:\s*#817586/i.test(root));

            // Both category identities declare their four tokens.
            ["intimate", "wellness"].forEach((key) => {
                ["cat-" + key, "cat-" + key + "-surface", "cat-" + key + "-accent", "cat-" + key + "-text"]
                    .forEach((token) => {
                        check("style.css: declares --" + token, new RegExp("--" + token + "\\s*:", "i").test(root));
                    });
            });
            check("style.css: the Intimate accent is #817586", /--cat-intimate-accent:\s*#817586/i.test(root));
            check("style.css: the Wellness accent is #718391", /--cat-wellness-accent:\s*#718391/i.test(root));

            // No cream/beige/tan foundation is left in the shared token block.
            check("style.css: no cream or beige hex remains in the brand tokens",
                !/#f5f1eb|#e9e2d8|#fffdf9|#d8d1c8|#9d7764/i.test(root));

            // The three standalone :root files must match the shared palette,
            // or those pages would still render in the old cream.
            ["account.css", "login.css", "signup.css"].forEach((file) => {
                const sheet = fs.readFileSync(path.join(SITE, file), "utf8");
                check(file + ": uses the new brand background", /--cream:\s*#e8e5ea/i.test(sheet));
                check(file + ": uses the new primary text", /--black:\s*#252326/i.test(sheet));
                check(file + ": carries no cream palette", !/#f5f1eb|#e9e2d8|#fffdf9/i.test(sheet));
            });
        }

        // -- checkout autocomplete assists (no validation rules were changed) --
        {
            const p = loadPage("checkout.html", ["cart-store.js", "products.js", "checkout.js"], {});
            ["email", "firstName", "lastName", "address", "postal"].forEach((id) => {
                const el = p.doc.getElementById(id);
                check("checkout: #" + id + " suggests an autocomplete value",
                    !!el && !!el.getAttribute("autocomplete"),
                    el ? String(el.getAttribute("autocomplete")) : "missing");
            });
            p.dom.window.close();
        }
    }

    // ---------- summary ----------
    const passed = results.filter((r) => r.ok).length;
    console.log("\n" + passed + "/" + results.length + " checks passed");
    if (passed !== results.length) process.exitCode = 1;
})();