// =========================
// CHECKOUT PAGE
// =========================

// Turnstile token captured via data-callback on the widget.
window.turnstileToken = "";
window.onTurnstileSuccess = function(token) {
    window.turnstileToken = token;
};

// Require login before checkout - check API first, fall back to localStorage
(function () {
    let loggedIn = null;
    try {
        loggedIn = localStorage.getItem("xLoggedIn");
    } catch (e) {}
    
    // Quick check - if localStorage says logged in, allow (will verify on API call later)
    if (loggedIn === "true") {
        if (typeof fetch === "function") {
            try {
                fetch("/api/auth/me", { credentials: "include" })
                    .then(function (res) {
                        if (res && res.status === 401) {
                            try {
                                localStorage.setItem("xCheckoutRedirect", "checkout.html");
                                localStorage.removeItem("xLoggedIn");
                                localStorage.removeItem("xUser");
                            } catch (e) {}
                            window.location.href = "login.html";
                        }
                    })
                    .catch(function () {});
            } catch (e) {}
        }
        return;
    }
    
    // If not in localStorage, redirect to login
    try {
        localStorage.setItem("xCheckoutRedirect", "checkout.html");
    } catch (e) {}
    window.location.href = "login.html";
})();

// Prefill the contact email with the signed-in account
(function () {
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem("xUser"));
    } catch (e) {}
    const emailInput = document.getElementById("email");
    if (user && user.email && emailInput && !emailInput.value) {
        emailInput.value = user.email;
    }
    const loginLink = document.querySelector(".section-title a[href='login.html']");
    if (user && user.email && loginLink) {
        loginLink.setAttribute("href", "account.html");
        loginLink.textContent = user.email;
    }

    // The delivery name starts from the signed-in account.
    if (user && user.firstName) {
        const firstInput = document.getElementById("firstName");
        if (firstInput && !firstInput.value) firstInput.value = user.firstName;
    }
    if (user && user.lastName) {
        const lastInput = document.getElementById("lastName");
        if (lastInput && !lastInput.value) lastInput.value = user.lastName;
    }

    // A previous order saved with "Save this information for next time" leaves
    // the delivery details on the account, so they come back automatically.
    const savedFields = [
        ["phone", user && user.phone],
        ["address", user && user.address],
        ["apartment", user && user.apartment],
        ["city", user && user.city],
        ["postal", user && (user.postal || user.zip)],
        ["country", user && user.country]
    ];
    savedFields.forEach(function (pair) {
        const input = document.getElementById(pair[0]);
        if (input && pair[1] && !input.value) input.value = pair[1];
    });

    // The two checkout checkboxes reflect what the account already holds.
    const saveInfo = document.getElementById("saveInfo");
    if (saveInfo && user && typeof user === "object") {
        saveInfo.checked = !!(user.address || user.city || user.phone);
    }
    const marketing = document.getElementById("marketingOptIn");
    if (marketing && user && typeof user === "object") {
        marketing.checked = user.marketingOptIn === true;
    }
})();

// Single client-side source for delivery options. The amounts deliberately
// mirror the server's own pricing rule (createPendingOrder in products.js:
// express -> 1550, otherwise 650) and the server re-prices every order from
// its own rule, so a mismatch here can never change what an order costs.
const DELIVERY_OPTIONS = [
    { name: "Standard delivery", window: "3-7 business days", cost: 650 },
    { name: "Express delivery", window: "1-3 business days", cost: 1550 }
];
const MAX_QTY = 99;
const deliveryOptionsWrap = document.getElementById("deliveryOptions");
const paymentMethods = document.querySelectorAll(".payment-method");
const paymentFields = document.querySelector(".payment-fields");
const mobileMoneyFields = document.querySelector(".mobile-money-fields");
const paybillFieldsEl = document.querySelector(".paybill-fields");
const summaryEl = document.querySelector(".checkout-summary");
const summaryItemsEl = document.getElementById("summaryItems");
const subtotalEl = document.getElementById("summarySubtotal");
const shippingEl = document.getElementById("summaryShipping");
const totalEl = document.getElementById("summaryTotal");
const emptyBagEl = document.getElementById("emptyBag");
const checkoutLayoutEl = document.querySelector(".checkout-container");
const placeOrderButton = document.querySelector(".place-order");

// Whole-shilling KES formatting used across the storefront.
function formatKES(value) {
    const n = Math.round(Number(value) || 0);
    return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function cartSubtotal() {
    try {
        if (typeof CartStore !== "undefined" && CartStore && typeof CartStore.subtotal === "function") {
            return Number(CartStore.subtotal()) || 0;
        }
    } catch (e) {}
    return cartLines().reduce(function (sum, line) {
        return sum + (Number(line.price) || 0) * (Number(line.quantity) || 0);
    }, 0);
}

function subtotal() {
    return cartSubtotal();
}

function cartLines() {
    try {
        if (typeof CartStore !== "undefined" && CartStore && typeof CartStore.lines === "function") {
            return CartStore.lines() || [];
        }
    } catch (e) {}
    try {
        const raw = localStorage.getItem("xCart");
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function productById(id) {
    try {
        const list = window.PRODUCTS || [];
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].id === id) return list[i];
        }
    } catch (e) {}
    return null;
}

function escapeHTML(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// =========================
// FIELD VALIDATION — inline, country-aware
// The checkout serves several countries, so postal codes and phone numbers
// follow the selected country. "Other" deliberately gets the loosest rules:
// required-but-format-free, because address conventions vary widely.
// =========================
const COUNTRIES_CONFIG = {
    "Kenya": {
        phonePlaceholder: "+254 7XX XXX XXX",
        phoneTest: function (value) { return /^(?:\+?254|0)?[17]\d{7,8}$/.test(String(value).replace(/[\s-]/g, "")); },
        postalLabel: "ZIP / Postcode",
        postalTest: function (value) { return /^\d{5}$/.test(String(value).trim()); }
    },
    "United States": {
        phonePlaceholder: "+1 (555) 555-0142",
        phoneTest: function (value) { return /^(\+?1[\s.(-]*)?(\([2-9]\d{2}\)|[2-9]\d{2})[\s.)-]*\d{3}[\s.-]*\d{4}$/.test(String(value)); },
        postalLabel: "ZIP code",
        postalTest: function (value) { return /^\d{5}(?:-\d{4})?$/.test(String(value).trim()); }
    },
    "United Kingdom": {
        phonePlaceholder: "+44 7400 123456",
        phoneTest: function (value) { return /^(\+?44|0)[\d\s-]{8,12}$/.test(String(value)); },
        postalLabel: "Postcode",
        postalTest: function (value) { return /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(String(value).trim()); }
    },
    "Canada": {
        phonePlaceholder: "(416) 555-0142",
        phoneTest: function (value) { return /^(\+?1[\s.(-]*)?(\([2-9]\d{2}\)|[2-9]\d{2})[\s.)-]*\d{3}[\s.-]*\d{4}$/.test(String(value)); },
        postalLabel: "Postal code",
        postalTest: function (value) { return /^[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d$/.test(String(value).trim()); }
    },
    "Australia": {
        phonePlaceholder: "+61 411 555 014",
        phoneTest: function (value) { return /^(\+?61|0)[\d\s-]{8,10}$/.test(String(value)); },
        postalLabel: "Postcode",
        postalTest: function (value) { return /^\d{4}$/.test(String(value).trim()); }
    },
    "Other": {
        phonePlaceholder: "Phone number",
        phoneTest: null, // format-free: required, len >= 8 digits
        postalLabel: "ZIP / Postcode",
        postalTest: null
    }
};

function countryConfig() {
    const countryEl = document.getElementById("country");
    const name = countryEl ? countryEl.value : "Kenya";
    return COUNTRIES_CONFIG[name] || COUNTRIES_CONFIG["Other"];
}

// Country drives the postal label and phone example, so a Kenyan, UK or US
// customer each sees the fields behave like their own format.
function applyCountryBehavior() {
    const config = countryConfig();
    const postalInput = document.getElementById("postal");
    const postalLabel = document.querySelector("label[for='postal']");
    const phoneInput = document.getElementById("phone");
    if (postalInput && !postalInput.value) {
        postalInput.setAttribute("placeholder", config.postalLabel);
    }
    if (postalLabel && postalLabel.childNodes && postalLabel.childNodes[0]) {
        postalLabel.childNodes[0].nodeValue = config.postalLabel + " *";
    }
    if (phoneInput && !phoneInput.value) {
        phoneInput.setAttribute("placeholder", config.phonePlaceholder);
    }
    clearFieldError(postalInput);
    clearFieldError(phoneInput);
}

function fieldErrorMessage(input) {
    const id = input ? input.id : "";
    const value = String((input && input.value) || "").trim();
    if (!value) {
        const labels = {
            email: "Enter your email address — we send updates to it.",
            firstName: "Enter your first name.",
            lastName: "Enter your last name.",
            address: "Enter your street address.",
            city: "Enter your city.",
            postal: "Enter your " + countryConfig().postalLabel.toLowerCase() + ".",
            phone: "Enter a phone number for delivery questions."
        };
        return labels[id] || "This field is required.";
    }
    if (id === "email") return "That email does not look right. Check for typos.";
    if (id === "postal") return "That postal code does not match the selected country.";
    if (id === "phone") return "That phone number does not match the selected country.";
    return "Please check this field.";
}

function validateFieldValue(input) {
    const value = String((input && input.value) || "").trim();
    if (!value) return false;
    if (input.id === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (input.id === "postal") {
        const test = countryConfig().postalTest;
        return test ? test(value) : value.length >= 3;
    }
    if (input.id === "phone") {
        const test = countryConfig().phoneTest;
        return test ? test(value) : value.replace(/\D/g, "").length >= 8;
    }
    return true;
}

function showFieldError(input, message) {
    if (!input) return;
    let errorEl = document.getElementById("err-" + input.id);
    if (!errorEl && input.parentNode) {
        errorEl = document.createElement("small");
        errorEl.className = "field-error";
        errorEl.id = "err-" + input.id;
        input.parentNode.appendChild(errorEl);
    }
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
    }
    input.classList.add("input-error");
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", "err-" + input.id);
}

function clearFieldError(input) {
    if (!input) return;
    const errorEl = document.getElementById("err-" + input.id);
    if (errorEl) errorEl.hidden = true;
    input.classList.remove("input-error");
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
}

const REQUIRED_FIELD_IDS = ["email", "firstName", "lastName", "address", "city", "postal", "phone"];
// Typing rebuilds trust: clear a field's error as the customer fixes it.
REQUIRED_FIELD_IDS.forEach(function (id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", function () {
        if (input.value.trim() && validateFieldValue(input)) clearFieldError(input);
    });
    input.addEventListener("blur", function () {
        if (input.classList.contains("input-error")) {
            showFieldError(input, fieldErrorMessage(input));
        }
    });
});
const countryEl = document.getElementById("country");
if (countryEl) countryEl.addEventListener("change", applyCountryBehavior);
applyCountryBehavior();

// Validation runs once on submit and reports ALL problems, not just the first.
function validateCheckoutForm() {
    let firstInvalid = null;
    let message = "";
    REQUIRED_FIELD_IDS.forEach(function (id) {
        const input = document.getElementById(id);
        if (!input) return;
        if (validateFieldValue(input)) {
            clearFieldError(input);
            return;
        }
        const msg = fieldErrorMessage(input);
        showFieldError(input, msg);
        if (!firstInvalid) {
            firstInvalid = input;
            message = msg;
        }
    });
    if (firstInvalid) {
        showCheckoutError("Please review your details — " + message);
        if (typeof firstInvalid.focus === "function") firstInvalid.focus();
        if (typeof firstInvalid.scrollIntoView === "function") {
            firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        return false;
    }
    return true;
}

// Trust chain for summary pricing: line prices come from the cart, but if a
// stored line has a missing/invalid price we overlay the static catalog
// price. The server re-prices the order from D1 no matter what is sent.
function cartLineDisplay(line) {
    const product = line && line.id ? productById(line.id) : null;
    const merged = Object.assign({}, line);
    if (!merged.name && product && product.name) merged.name = product.name;
    const linePrice = Number(line && line.price);
    if (!isFinite(linePrice) && product) merged.price = Number(product.price);
    if (!merged.category && product && product.category) merged.category = product.category;
    return merged;
}

// Steppers + remove let the customer edit the bag without leaving checkout;
// every change funnels through CartStore (same source cart.html uses).
function wireSummaryEditors(container) {
    if (!container) return;
    container.addEventListener("click", function (event) {
        const actionEl = event.target.closest ? event.target.closest("[data-act]") : null;
        if (!actionEl || typeof CartStore === "undefined") return;
        const row = actionEl.closest(".checkout-product");
        const id = row ? row.getAttribute("data-id") : "";
        if (!id) return;
        const action = actionEl.getAttribute("data-act");
        const line = cartLines().find(function (l) { return l && l.id === id; });
        if (!line) return;
        const qty = Number(line.quantity) || 0;
        if (action === "inc") CartStore.setQuantity(id, Math.min(MAX_QTY, qty + 1));
        else if (action === "dec") CartStore.setQuantity(id, qty - 1); // <=0 removes
        else if (action === "remove") CartStore.remove(id);
        recomputeCheckout();
    });
}

function renderSummary() {
    if (!summaryEl || !summaryItemsEl) return;
    const lines = cartLines().map(cartLineDisplay);
    const html = lines.map(function (line) {
        const qty = Math.max(0, Math.min(MAX_QTY, Number(line.quantity) || 0));
        const price = Number(line.price) || 0;
        const name = escapeHTML(line.name || "Product");
        const category = escapeHTML(line.category || "");
        const isOne = qty === 1;
        return '<div class="checkout-product" data-id="' + escapeHTML(line.id || "") + '">' +
            '<div class="checkout-product-image"><span>' + qty + '</span></div>' +
            '<div class="checkout-product-info"><strong>' + name + '</strong>' +
            (category ? '<span>' + category + '</span>' : '') +
            '<div class="cp-line">' +
            '<span class="cp-stepper">' +
            '<button type="button" data-act="dec" aria-label="' + (isOne ? 'Remove ' + name : 'Decrease quantity of ' + name) + '">&minus;</button>' +
            '<b aria-label="Quantity">' + qty + '</b>' +
            '<button type="button" data-act="inc" aria-label="Increase quantity of ' + name + '">+</button>' +
            '</span>' +
            '<button type="button" data-act="remove" class="cp-remove">Remove</button>' +
            '</div>' +
            '</div>' +
            '<b class="cp-price">' + formatKES(price * qty) + '</b>' +
            '</div>';
    }).join("");
    summaryItemsEl.innerHTML = html;
    wireSummaryEditors(summaryItemsEl);
    // Nothing is ever hard-coded: a genuinely empty cart leaves "no products"
    // rather than a stale or demonstration line.
    if (!lines.length && summaryItemsEl) {
        summaryItemsEl.innerHTML = '<p class="summary-empty">Your bag is empty.</p>';
    }
}

// One recalculation path: re-render rows, recompute shipping from the
// constants above and rewrite every total from trusted prices.
function computeTotals() {
    const selectedRadio = (deliveryOptionsWrap && deliveryOptionsWrap.querySelector("input[name='delivery']:checked")) || null;
    let option = DELIVERY_OPTIONS[0];
    const name = selectedRadio ? selectedRadio.getAttribute("data-name") : "";
    const match = DELIVERY_OPTIONS.find(function (opt) { return opt.name === name; });
    if (match) option = match;
    const subtotal = cartSubtotal();
    if (subtotalEl) subtotalEl.textContent = formatKES(subtotal);
    if (shippingEl) shippingEl.textContent = formatKES(option.cost);
    if (totalEl) totalEl.textContent = formatKES(subtotal + option.cost);
}

let lastEmptyState = null;
// A genuinely empty cart never gets silently populated. Instead the order
// form is replaced with the designed empty-bag state.
function syncEmptyState() {
    const empty = cartLines().length === 0;
    if (empty === lastEmptyState) return;
    lastEmptyState = empty;
    if (emptyBagEl) emptyBagEl.hidden = !empty;
    if (checkoutLayoutEl) checkoutLayoutEl.hidden = empty;
}

function updateTotal() {
    syncEmptyState();
    renderSummary();
    computeTotals();
}

// Any page-local cart write (steppers, remove) plus writes from another tab
// (storage event and the cart:updated broadcast from cart-store.js) all end
// up here, so the summary can never drift out of sync with the cart.
function recomputeCheckout() {
    updateTotal();
    if (typeof CartStore !== "undefined" && CartStore && typeof CartStore.syncBadges === "function") {
        try { CartStore.syncBadges(); } catch (e) {}
    }
}

if (typeof window !== "undefined" && window && typeof window.addEventListener === "function") {
    window.addEventListener("cart:updated", recomputeCheckout);
    window.addEventListener("storage", recomputeCheckout);
}

// Delivery method — cards are rendered from DELIVERY_OPTIONS so price,
// estimate and the value submitted to the backend are the same data, and a
// change here updates the summary instantly.
function renderDeliveryOptions() {
    if (!deliveryOptionsWrap) return;
    deliveryOptionsWrap.innerHTML = DELIVERY_OPTIONS.map(function (option, index) {
        return '<label class="delivery-option' + (index === 0 ? " selected" : "") + '">' +
            '<input type="radio" name="delivery" data-name="' + option.name + '" data-cost="' + option.cost + '"' + (index === 0 ? " checked" : "") + '>' +
            '<span class="do-text"><strong>' + option.name + '</strong><span class="do-window">' + option.window + '</span></span>' +
            '<b>' + formatKES(option.cost) + '</b>' +
            '</label>';
    }).join("");
}

renderDeliveryOptions();
deliveryOptionsWrap.addEventListener("click", function () {
    const options = deliveryOptionsWrap.querySelectorAll(".delivery-option");
    const chosen = deliveryOptionsWrap.querySelector("input[name='delivery']:checked");
    options.forEach(function (item) {
        item.classList.toggle("selected", item.querySelector("input[name='delivery']") === chosen);
    });
    if (typeof CartStore !== "undefined" && CartStore) {
        try { CartStore.syncBadges(); } catch (e) {}
    }
    computeTotals();
});
deliveryOptionsWrap.addEventListener("change", function () {
    const options = deliveryOptionsWrap.querySelectorAll(".delivery-option");
    const chosen = deliveryOptionsWrap.querySelector("input[name='delivery']:checked");
    options.forEach(function (item) {
        item.classList.toggle("selected", item.querySelector("input[name='delivery']") === chosen);
    });
    computeTotals();
});

// Payment method
// "paybill" = manual M-Pesa Paybill to the business number below.
// ELLE_PAYBILL is the single place to change it if I&M issues a new one.
// Orders stay pending until the payment is confirmed.
const ELLE_PAYBILL = "542542";
document.querySelectorAll(".paybill-number").forEach((el) => {
    el.textContent = ELLE_PAYBILL;
});
// The M-Pesa account reference must be the order number so bank payments
// auto-match. Pre-generate it when Paybill is picked so the customer sees
// the exact reference BEFORE paying, and submit the same number with the
// order (the backend adopts it when still unused).
let paybillOrderNumber = "";
function ensurePaybillNumber() {
    if (!paybillOrderNumber) {
        const stamp = Date.now().toString(36).toUpperCase().slice(-4);
        paybillOrderNumber = "ELLE" + stamp + Math.floor(1000 + Math.random() * 9000);
    }
    document.querySelectorAll(".paybill-account").forEach((el) => {
        el.textContent = paybillOrderNumber;
    });
    return paybillOrderNumber;
}
// Generate at page load too: the reference is stable no matter when the
// customer first sees the Paybill instructions.
ensurePaybillNumber();
const paybillFields = document.querySelector(".paybill-fields");
function selectedPaymentMethod() {
    const active = document.querySelector(".payment-method.active");
    return (active && active.getAttribute("data-method")) || "card";
}
// Payment gate: only the selected method's inputs are enabled and visible.
// Hidden fields are disabled too, so browser autofill and Tab can never
// reach inputs that do not apply.
function syncPaymentFields(selected) {
    if (paymentFields) {
        paymentFields.style.display = selected === "card" ? "block" : "none";
        paymentFields.querySelectorAll("input").forEach(function (input) {
            input.disabled = selected !== "card";
        });
    }
    if (mobileMoneyFields) {
        mobileMoneyFields.style.display = selected === "mobile" ? "block" : "none";
        mobileMoneyFields.querySelectorAll("input").forEach(function (input) {
            input.disabled = selected !== "mobile";
        });
    }
    if (paybillFieldsEl) {
        paybillFieldsEl.style.display = selected === "paybill" ? "block" : "none";
        paybillFieldsEl.querySelectorAll("input").forEach(function (input) {
            input.disabled = selected !== "paybill";
        });
    }
    // Keep the honest, method-specific status line current.
    const note = document.getElementById("paymentNote");
    if (note) {
        note.textContent = selected === "card"
            ? "Card checkout is a demonstration — it processes no payment and sends no card details. To actually pay, use mobile money or M-Pesa Paybill."
            : selected === "mobile"
                ? "A real M-Pesa prompt will be sent to the number below. Your order only completes after Safaricom confirms the payment."
                : "Pay to Business no. " + ELLE_PAYBILL + " with account " + paybillOrderNumber + " in your M-Pesa menu, then submit the transaction code. We confirm it before dispatch.";
    }
    if (selected === "paybill") ensurePaybillNumber();
}
paymentMethods.forEach((method) => {
    method.addEventListener("click", () => {
        paymentMethods.forEach((item) => {
            item.classList.remove("active");
            item.setAttribute("aria-pressed", "false");
        });
        method.classList.add("active");
        method.setAttribute("aria-pressed", "true");
        syncPaymentFields(selectedPaymentMethod());
    });
});
syncPaymentFields("card");

// Turnstile widget: explicit rendering. The script loads with render=explicit
// so it never auto-scans and never chokes on the placeholder or an empty
// site key (demo mode). Only a real injected key gets a widget.
function initTurnstileWidgets() {
    const widgets = document.querySelectorAll(".cf-turnstile");
    if (!widgets.length) return;
    const tryRender = function (attempts) {
        const api = (typeof window !== "undefined" && window.turnstile) || null;
        if (!api || typeof api.render !== "function") {
            if (attempts > 50) {
                widgets.forEach(function (widget) { widget.style.display = "none"; });
                return;
            }
            return setTimeout(function () { tryRender(attempts + 1); }, 150);
        }
        widgets.forEach(function (widget) {
            const siteKey = widget.getAttribute("data-sitekey") || "";
            if (!siteKey || siteKey.indexOf("__") === 0) {
                widget.style.display = "none";
                return;
            }
            if (widget.dataset.turnstileRendered === "1") return;
            widget.dataset.turnstileRendered = "1";
            widget.innerHTML = "";
            api.render(widget, { sitekey: siteKey, callback: window.onTurnstileSuccess });
        });
    };
    tryRender(0);
}
initTurnstileWidgets();

// =========================
// ORDER BUILDING
// A placed order is snapshotted into localStorage so the Order Confirmation
// page can show exactly what was bought, then the bag is emptied.
// =========================
const ORDERS_KEY = "xOrders";
const LAST_ORDER_KEY = "xLastOrder";

// Realistic looking order id, e.g. X48291. Timestamp + random keeps numbers
// unique across rapid successive orders.
function generateOrderNumber() {
    const stamp = Date.now().toString(36).toUpperCase().slice(-4);
    return "ELLE" + stamp + Math.floor(1000 + Math.random() * 9000);
}

// "3-7 business days" -> { min: 3, max: 7 }
function parseBusinessDays(label) {
    const text = String(label || "");
    const range = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    if (range) return { min: parseInt(range[1], 10), max: parseInt(range[2], 10) };
    const single = text.match(/(\d+)/);
    if (single) {
        const n = parseInt(single[1], 10);
        return { min: n, max: n };
    }
    return { min: 3, max: 7 };
}

function addBusinessDays(date, days) {
    const out = new Date(date.getTime());
    let left = Math.max(0, days);
    while (left > 0) {
        out.setDate(out.getDate() + 1);
        const day = out.getDay();
        if (day !== 0 && day !== 6) left--;
    }
    return out;
}

function formatShortDate(date) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fieldValue(id, fallback) {
    const el = document.getElementById(id);
    const value = el ? String(el.value || "").trim() : "";
    return value || (fallback || "");
}

function readAccount() {
    try {
        return JSON.parse(localStorage.getItem("xUser")) || null;
    } catch (e) {
        return null;
    }
}

// The selected delivery option drives both the shipping cost and the window
// shown on the confirmation page. Values come from the same DELIVERY_OPTIONS
// constants the summary uses — never from parsing rendered text.
function selectedDelivery() {
    const choice = document.querySelector("input[name='delivery']:checked");
    const name = choice ? choice.getAttribute("data-name") : "";
    const match = DELIVERY_OPTIONS.find(function (opt) { return opt.name === name; });
    if (match) return { name: match.name, window: match.window, cost: match.cost };
    return { name: DELIVERY_OPTIONS[0].name, window: DELIVERY_OPTIONS[0].window, cost: DELIVERY_OPTIONS[0].cost };
}

// One idempotency key per bag, not per click. Stored in sessionStorage and
// regenerated only when the bag changes, so double clicks, retries and
// refreshes all reuse the same key and the backend collapses them onto the
// same pending order instead of creating duplicates.
function checkoutIdempotencyKey(lines) {
    const signature = lines.map(function (line) {
        return (line && line.id ? line.id : "?") + ":" + (Number(line && line.quantity) || 0);
    }).join("|");
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem("xCheckoutIdem") || "null"); } catch (e) { stored = null; }
    if (stored && stored.sig === signature && stored.key) return stored.key;
    const key = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : ("idem_" + Date.now() + "_" + Math.floor(Math.random() * 100000));
    try { sessionStorage.setItem("xCheckoutIdem", JSON.stringify({ sig: signature, key: key })); } catch (e) {}
    return key;
}

function clearIdempotencyKey() {
    try { sessionStorage.removeItem("xCheckoutIdem"); } catch (e) {}
}

function buildOrder(email, lines) {
    const account = readAccount();
    const delivery = selectedDelivery();
    const days = parseBusinessDays(delivery.window);
    const now = new Date();
    const subtotalValue = lines.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
    const firstName = fieldValue("firstName", account && account.firstName);
    const lastName = fieldValue("lastName", account && account.lastName);
    const number = generateOrderNumber();

    const order = {
        number: number,
        orderNumber: number,
        id: number,
        createdAt: now.toISOString(),
        date: now.toISOString(),
        orderDate: now.toISOString(),
        email: email,
        customer: {
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: fieldValue("phone")
        },
        items: lines.map((line) => ({
            id: line.id,
            name: line.name,
            product: line.name,
            price: Number(line.price),
            unitPrice: Number(line.price),
            quantity: Number(line.quantity),
            lineTotal: Number(line.price) * Number(line.quantity),
            category: line.category || "",
            description: line.description || ""
        })),
        subtotal: subtotalValue,
        shipping: delivery.cost,
        shippingCost: delivery.cost,
        total: subtotalValue + delivery.cost,
        delivery: {
            method: delivery.name,
            name: delivery.name,
            window: delivery.window,
            information: delivery.name + " (" + delivery.window + ")",
            from: formatShortDate(addBusinessDays(now, days.min)),
            to: formatShortDate(addBusinessDays(now, days.max))
        },
        address: {
            firstName: firstName,
            lastName: lastName,
            address: fieldValue("address"),
            apartment: fieldValue("apartment"),
            city: fieldValue("city"),
            postal: fieldValue("postal"),
            zip: fieldValue("postal"),
            country: fieldValue("country"),
            phone: fieldValue("phone")
        }
    };
    return order;
}

// Keep the latest order for the confirmation page plus the full history that
// the account page can read later. Nothing is trimmed: every order placed on
// this device stays in xOrders.
function saveOrder(order) {
    try {
        localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
        const history = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
        if (!Array.isArray(history)) history.length = 0;
        history.unshift(order);
        localStorage.setItem(ORDERS_KEY, JSON.stringify(history));
    } catch (e) {}
}

// The two consent checkboxes, resolved only once the order exists.
//   saveInfo        -> when checked, the delivery/contact details are written
//                     back onto the account so the next checkout is prefilled.
//                      Unchecked leaves xUser completely untouched.
//   marketingOptIn  -> the newsletter preference, stored as a plain boolean.
// The account object is updated in place, so identity fields (email, names,
// password) and anything else already on the account survive untouched. No
// payment details are ever read or written.
function saveAccountPreferences() {
    const account = readAccount();
    if (!account || typeof account !== "object") return null;

    if (isChecked("saveInfo")) {
        account.phone = fieldValue("phone");
        account.address = fieldValue("address");
        account.apartment = fieldValue("apartment");
        account.city = fieldValue("city");
        account.postal = fieldValue("postal");
        account.country = fieldValue("country");
    }

    account.marketingOptIn = isChecked("marketingOptIn");

    try {
        localStorage.setItem("xUser", JSON.stringify(account));
    } catch (e) {}
    return account;
}

function isChecked(id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
}

// Inline status line for the M-Pesa prompt flow (separate from the red
// error banner so "waiting" never reads as failure).
    function stkStatusEl() {
        let el = document.getElementById("stkStatus");
        if (el) return el;
        el = document.createElement("div");
        el.id = "stkStatus";
        el.className = "stk-status";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        el.hidden = true;
        const anchor = document.querySelector(".place-order-section");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
        return el;
    }

function showStkStatus(message) {
    const el = stkStatusEl();
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
}

function clearStkStatus() {
    const el = document.getElementById("stkStatus");
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
}

function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const poLabel = placeOrderButton ? placeOrderButton.querySelector(".po-label") : null;
const poSpinner = placeOrderButton ? placeOrderButton.querySelector(".po-spinner") : null;
const PO_DEFAULT_LABEL = "Place order";
function setPlacing(placing) {
    if (!placeOrderButton) return;
    placeOrderButton.disabled = !!placing;
    if (poSpinner) poSpinner.hidden = !placing;
    if (poLabel) poLabel.textContent = placing ? "One moment…" : PO_DEFAULT_LABEL;
    placeOrderButton.setAttribute("aria-busy", placing ? "true" : "false");
}

// The backend reports stock problems as HTTP 409 with a message like
// "Insufficient stock for item <id>". Turn that into a plain-English notice
// and resolve the id to a cart line name when possible, so the customer sees
// WHICH product is short instead of a raw error code.
function friendlyStockError(serverMsg, lines) {
    const match = /Insufficient stock for item\s+(.+)/i.exec(serverMsg || "");
    const id = match ? String(match[1]).trim() : "";
    let name = "";
    if (id && lines) {
        const line = lines.find((l) => l && l.id === id);
        if (line && line.name) name = line.name;
    }
    if (name) {
        return "Only the remaining stock could be fulfilled. Please update your bag: '" + name + "' is now out of stock.";
    }
    return serverMsg || "One or more items in your bag are no longer available. Please review your cart and try again.";
}

// M-Pesa prompt (STK) flow: create the pending order server-side, push the
// PIN prompt, then poll until Safaricom confirms. Only a confirmed payment
// clears the cart and leaves checkout.
async function placeStkOrder(email, lines, idempotencyKey) {
    const idem = idempotencyKey || ((typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") ? crypto.randomUUID() : ("idem_" + Date.now()));
    const phoneEl = document.getElementById("mobileMoneyNumber");
    const msisdn = (phoneEl && phoneEl.value ? phoneEl.value : fieldValue("phone")).trim();
    if (msisdn.replace(/\D/g, "").length < 9) {
        showCheckoutError("Enter your M-Pesa phone number so we can send the payment prompt.");
        if (phoneEl && typeof phoneEl.focus === "function") phoneEl.focus();
        return;
    }

    clearCheckoutError();
    setPlacing(true);
    showStkStatus("Sending a payment prompt to " + msisdn + ". Enter your M-Pesa PIN on your phone to complete payment.");

    const delivery = selectedDelivery();
    let res = null;
    let data = null;
    try {
         res = await fetch("/api/payments/stk", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": idem },
            body: JSON.stringify({
                email: email,
                firstName: fieldValue("firstName"),
                lastName: fieldValue("lastName"),
                phone: fieldValue("phone"),
                msisdn: msisdn,
                address: fieldValue("address"),
                apartment: fieldValue("apartment"),
                city: fieldValue("city"),
                postal: fieldValue("postal"),
                country: fieldValue("country"),
                items: lines.map(l => ({ id: l.id, quantity: l.quantity })),
                delivery: { method: delivery.name },
                turnstileToken: window.turnstileToken || "",
                idempotencyKey: idem
            })
        });
        try {
            data = await res.json();
        } catch (e) {
            data = null;
        }
    } catch (e) {
        data = null;
    }

    // HTTP 409: the backend could not reserve stock for one or more items
    // (e.g. just sold in another tab). Surface a friendly, item-specific
    // notice instead of the generic fallback, and abort so no phantom order
    // is left pending.
    if (res && res.status === 409) {
        setPlacing(false);
        clearStkStatus();
        showCheckoutError(friendlyStockError((data && data.error) || "Insufficient stock", lines));
        return;
    }

    if (!res || !res.ok || !data || !data.ok || !data.number) {
        setPlacing(false);
        clearStkStatus();
        showCheckoutError((data && data.error) || "We could not send the M-Pesa prompt. Try again or pay via M-Pesa Paybill instead.");
        return;
    }

    showStkStatus("Prompt sent to " + msisdn + ". Enter your M-Pesa PIN now — this page will confirm automatically.");
    if (poLabel) poLabel.textContent = "Awaiting payment…";

    let paid = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        await waitMs(3000);
        try {
            const check = await fetch("/api/payments/status/" + encodeURIComponent(data.number));
            if (check.ok) {
                const state = await check.json();
                if (state && state.status === "paid") {
                    paid = true;
                    break;
                }
            }
        } catch (e) {}
    }

    if (!paid) {
        setPlacing(false);
        showStkStatus("We have not confirmed your payment yet (order " + data.number + "). If you paid, it will confirm shortly — otherwise retry, or complete it via M-Pesa Paybill with account " + data.number + ".");
        return;
    }

    const order = buildOrder(email, lines);
    order.number = data.number;
    order.orderNumber = data.number;
    order.id = data.number;
    order.total = typeof data.total === "number" ? data.total : order.total;
    order.payment = { method: "mobile", reference: data.checkoutRequestId || "", status: "paid" };
    saveOrder(order);
    saveAccountPreferences();

    try { localStorage.removeItem("xCart"); } catch (e) {}
    if (typeof CartStore !== "undefined" && CartStore) {
        try { if (typeof CartStore.syncBadges === "function") CartStore.syncBadges(); } catch (e) {}
    }
    try { localStorage.removeItem("xCheckoutRedirect"); } catch (e) {}

    window.location.href = "order-confirmation.html";
}

// Inline error banner (no reload): created once, reused for validation + empty cart.
    function checkoutErrorEl() {
        let el = document.getElementById("checkoutError");
        if (el) return el;
        el = document.createElement("div");
        el.id = "checkoutError";
        el.className = "checkout-error";
        el.setAttribute("role", "alert");
        el.setAttribute("aria-live", "assertive");
        el.hidden = true;
        const anchor = document.querySelector(".place-order-section");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
        return el;
    }

function showCheckoutError(message) {
    const el = checkoutErrorEl();
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
}

function clearCheckoutError() {
    const el = document.getElementById("checkoutError");
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
}

// Place order: validate -> POST to API -> snapshot -> clear the bag -> Order
// Confirmation. Only the M-Pesa (STK) flow can ever report "paid", because
// that is the only flow with a server-side confirmation path. Card orders
// stay pending: card checkout is a demonstration that processes no payment.
if (placeOrderButton) {
    placeOrderButton.addEventListener("click", async () => {
        // Re-entry guard: a second click while an order is in flight can
        // never start a second submission.
        if (placeOrderButton.disabled) return;
        clearCheckoutError();

        if (!validateCheckoutForm()) return;

        const lines = cartLines();
        if (!lines.length) {
            showCheckoutError("Your bag is empty. Add a product before placing an order.");
            return;
        }

        const payMethod = selectedPaymentMethod();
        let payReference = "";
        if (payMethod === "paybill") {
            const codeEl = document.getElementById("mpesaCode");
            payReference = codeEl ? String(codeEl.value || "").trim().toUpperCase() : "";
            if (payReference.length < 6) {
                showFieldError(codeEl, "Enter the M-Pesa transaction code from your confirmation SMS.");
                showCheckoutError("Enter the M-Pesa transaction code from your payment confirmation SMS.");
                if (codeEl && typeof codeEl.focus === "function") codeEl.focus();
                return;
            }
        }
        if (payMethod === "mobile") {
            const msisdnEl = document.getElementById("mobileMoneyNumber");
            const digits = String((msisdnEl && msisdnEl.value) || fieldValue("phone")).replace(/\D/g, "");
            if (digits.length < 9) {
                if (msisdnEl) {
                    showFieldError(msisdnEl, "Enter your M-Pesa number so we can send the payment prompt.");
                    msisdnEl.focus();
                }
                showCheckoutError("Enter your M-Pesa phone number so we can send the payment prompt.");
                return;
            }
        }

        const email = fieldValue("email");

        // Idempotency: one key per bag (sessionStorage), reused across
        // double-clicks, retries and refreshes so duplicate orders cannot be
        // created. Only a bag change mints a new key.
        const idempotencyKey = checkoutIdempotencyKey(lines);

        // M-Pesa prompt goes through the STK flow (server-created order +
        // PIN prompt + polling). Card and Paybill use the classic flow below.
        if (payMethod === "mobile") {
            await placeStkOrder(email, lines, idempotencyKey);
            return;
        }

        // No payment processor for cards: honest snapshot + payload.
        // "pending" means exactly that — payment has NOT been processed.
        const order = buildOrder(email, lines);
        order.payment = {
            method: payMethod,
            reference: payReference,
            status: "pending",
            simulated: payMethod === "card",
            note: payMethod === "card"
                ? "Card checkout is a demonstration. No payment was processed."
                : "Waiting for M-Pesa payment confirmation."
        };

        // Prepare API payload (server re-prices items from its own database;
        // client totals are informational only)
        const delivery = selectedDelivery();
        const payload = {
            email: order.email,
            firstName: order.customer.firstName,
            lastName: order.customer.lastName,
            phone: order.address.phone,
            address: order.address.address,
            apartment: order.address.apartment,
            city: order.address.city,
            postal: order.address.postal,
            country: order.address.country,
            items: lines.map(l => ({ id: l.id, quantity: l.quantity })),
            delivery: { method: delivery.name },
            payment: { method: payMethod, reference: payReference },
            number: (payMethod === "paybill" && paybillOrderNumber) ? paybillOrderNumber : undefined,
            turnstileToken: window.turnstileToken || "",
            idempotencyKey: idempotencyKey
        };

        // Try API first — server order data (number, D1-priced totals) wins.
        let apiSuccess = false;
        setPlacing(true);
        try {
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                // Merge server order data (number, totals from server)
                order.number = data.order.number;
                order.orderNumber = data.order.number;
                order.id = data.order.id;
                order.subtotal = data.order.subtotal;
                order.shipping = data.order.shipping;
                order.shippingCost = data.order.shipping;
                order.total = data.order.total;
                order.items = data.order.items.map(i => ({
                    ...i,
                    name: i.product_name,
                    product: i.product_name,
                    unitPrice: i.price,
                    lineTotal: i.lineTotal,
                    category: lines.find(l => l.id === i.product_id)?.category || ""
                }));
                apiSuccess = true;
            } else {
                const err = await res.json().catch(() => ({}));
                // HTTP 409 = stock ran out between cart and checkout. Do not
                // fall through to the local fallback (that would create a
                // phantom order the server rejected); show a friendly,
                // item-specific error and keep the customer on the page.
                if (res.status === 409) {
                    setPlacing(false);
                    showCheckoutError(friendlyStockError(err.error || "Insufficient stock", lines));
                    return;
                }
                console.warn("Order API failed:", err.error || res.status);
            }
        } catch (e) {
            console.warn("Order API unavailable, falling back to localStorage:", e);
        }
        setPlacing(false);

        // Always save to localStorage for confirmation page (works offline).
        // The snapshot always says "pending" — the confirmation page words
        // the outcome honestly (received / awaiting payment / demo card).
        saveOrder(order);
        saveAccountPreferences();

        // Clear the bag through the store so badges + other tabs resync.
        if (typeof CartStore !== "undefined" && CartStore && typeof CartStore.clear === "function") {
            try { CartStore.clear(); } catch (e) {}
        } else {
            try { localStorage.removeItem("xCart"); } catch (e) {}
        }
        if (typeof CartStore !== "undefined" && CartStore) {
            try { if (typeof CartStore.syncBadges === "function") CartStore.syncBadges(); } catch (e) {}
        }
        try { localStorage.removeItem("xCheckoutRedirect"); } catch (e) {}
        clearIdempotencyKey();

        window.location.href = "order-confirmation.html";
    });
}

updateTotal();