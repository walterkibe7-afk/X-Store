// =========================
// CHECKOUT PAGE
// =========================

// Require login before checkout - check API first, fall back to localStorage
(function () {
    let loggedIn = null;
    try {
        loggedIn = localStorage.getItem("xLoggedIn");
    } catch (e) {}
    
    // Quick check - if localStorage says logged in, allow (will verify on API call later)
    if (loggedIn === "true") return;
    
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

const deliveryOptions = document.querySelectorAll(".delivery-option");
const paymentMethods = document.querySelectorAll(".payment-method");
const paymentFields = document.querySelector(".payment-fields");
const mobileMoneyFields = document.querySelector(".mobile-money-fields");
const summaryEl = document.querySelector(".checkout-summary");
const subtotalEl = document.querySelector(".summary-line strong");
const shippingEl = document.querySelector(".shipping-line strong");
const totalEl = document.querySelector(".checkout-total strong");
const placeOrderButton = document.querySelector(".place-order");

function parsePrice(text) {
    if (!text) return 0;
    const n = parseFloat(text.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n;
}

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

function renderSummary() {
    if (!summaryEl) return;
    const lines = cartLines().map(function (line) {
        const product = line && line.id ? productById(line.id) : null;
        if (!product) return line;
        const merged = Object.assign({}, line);
        if (!merged.name && product.name) merged.name = product.name;
        if ((merged.price === null || merged.price === undefined || merged.price === "" || isNaN(Number(merged.price))) && product.price !== null && product.price !== undefined) {
            merged.price = Number(product.price);
        }
        if (!merged.category && product.category) merged.category = product.category;
        return merged;
    });
    const existing = summaryEl.querySelectorAll(".checkout-product");
    existing.forEach(function (node, index) {
        if (index > 0 && node.parentNode) node.parentNode.removeChild(node);
    });
    let first = summaryEl.querySelector(".checkout-product");
    lines.forEach(function (line, index) {
        const qty = Number(line.quantity) || 0;
        const price = Number(line.price) || 0;
        const name = escapeHTML(line.name || "Product");
        const category = escapeHTML(line.category || "");
        const html =
            '<div class="checkout-product">' +
            '<div class="checkout-product-image"><span>' + qty + '</span></div>' +
            '<div class="checkout-product-info"><strong>' + name + '</strong>' +
            (category ? '<span>' + category + '</span>' : '') +
            '<span>' + formatKES(price) + ' each &times; ' + qty + '</span></div>' +
            '<b>' + formatKES(price * qty) + '</b>' +
            '</div>';
        if (index === 0 && first) {
            first.outerHTML = html;
            first = summaryEl.querySelector(".checkout-product");
        } else {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            const node = wrapper.firstChild;
            const anchor = summaryEl.querySelector(".summary-line");
            if (node && anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
            else if (node) summaryEl.appendChild(node);
        }
    });
    if (!lines.length && first && first.parentNode) first.parentNode.removeChild(first);
}

function updateTotal() {
    renderSummary();
    const selected = document.querySelector(".delivery-option.selected b");
    const shipping = selected ? parsePrice(selected.textContent) : 650;
    if (shippingEl) shippingEl.textContent = formatKES(shipping);
    if (subtotalEl && subtotalEl !== shippingEl) subtotalEl.textContent = formatKES(cartSubtotal());
    if (totalEl) totalEl.textContent = formatKES(cartSubtotal() + shipping);
}

// Delivery method
deliveryOptions.forEach((option) => {
    option.addEventListener("click", () => {
        deliveryOptions.forEach((item) => item.classList.remove("selected"));
        option.classList.add("selected");
        const radio = option.querySelector("input");
        if (radio) radio.checked = true;
        updateTotal();
    });
});

if (typeof window !== "undefined" && window && typeof window.addEventListener === "function") {
    window.addEventListener("storage", updateTotal);
}

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
const paybillFields = document.querySelector(".paybill-fields");
function selectedPaymentMethod() {
    const active = document.querySelector(".payment-method.active");
    return (active && active.getAttribute("data-method")) || "card";
}
paymentMethods.forEach((method) => {
    method.addEventListener("click", () => {
        paymentMethods.forEach((item) => item.classList.remove("active"));
        method.classList.add("active");
        const selected = selectedPaymentMethod();
        if (paymentFields) paymentFields.style.display = selected === "card" ? "block" : "none";
        if (mobileMoneyFields) mobileMoneyFields.style.display = selected === "mobile" ? "block" : "none";
        if (paybillFields) paybillFields.style.display = selected === "paybill" ? "block" : "none";
        if (selected === "paybill") ensurePaybillNumber();
    });
});

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
// shown on the confirmation page.
function selectedDelivery() {
    let option = null;
    try { option = document.querySelector(".delivery-option.selected"); } catch (e) { option = null; }
    if (!option && typeof document.querySelectorAll === "function") {
        try {
            const options = document.querySelectorAll(".delivery-option");
            if (options && options.length) option = options[0];
        } catch (e) {}
    }
    if (!option) return { name: "Standard delivery", window: "3-7 business days", cost: 650 };
    const nameEl = (option && typeof option.querySelector === "function") ? option.querySelector("strong") : null;
    const windowEl = (option && typeof option.querySelector === "function") ? option.querySelector("span") : null;
    const costEl = (option && typeof option.querySelector === "function") ? option.querySelector("b") : null;
    let cost = costEl ? parsePrice(costEl.textContent) : 0;
    if (!cost) {
        const text = (option && option.textContent) ? option.textContent : "";
        cost = parsePrice(text) || 650;
    }
    return {
        name: (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : "Standard delivery",
        window: (windowEl && windowEl.textContent) ? windowEl.textContent.trim() : "3-7 business days",
        cost: cost
    };
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

function setPlacing(placing) {
    if (placeOrderButton) placeOrderButton.disabled = !!placing;
}

// M-Pesa prompt (STK) flow: create the pending order server-side, push the
// PIN prompt, then poll until Safaricom confirms. Only a confirmed payment
// clears the cart and leaves checkout.
async function placeStkOrder(email, lines) {
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
            headers: { "Content-Type": "application/json" },
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
                delivery: { method: delivery.name }
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

    if (!res || !res.ok || !data || !data.ok || !data.number) {
        setPlacing(false);
        clearStkStatus();
        showCheckoutError((data && data.error) || "We could not send the M-Pesa prompt. Try again or pay via M-Pesa Paybill instead.");
        return;
    }

    showStkStatus("Prompt sent to " + msisdn + ". Enter your M-Pesa PIN now — this page will confirm automatically.");

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

// Place order: validate -> POST to API -> snapshot -> clear the bag -> Order Confirmation.
// If API fails (offline/dev), complete locally so demo never breaks.
if (placeOrderButton) {
    placeOrderButton.addEventListener("click", async () => {
        clearCheckoutError();
        const candidates = [
            { id: "email", label: "Email" },
            { id: "firstName", label: "First name" },
            { id: "lastName", label: "Last name" },
            { id: "address", label: "Address" },
            { id: "city", label: "City" },
            { id: "postal", label: "Postal / ZIP code" },
            { id: "phone", label: "Phone" }
        ];
        const required = candidates.filter((field) => document.getElementById(field.id));
        let firstInvalid = null;
        required.forEach((field) => {
            const input = document.getElementById(field.id);
            if (!input) return;
            const value = String(input.value || "").trim();
            let valid = value.length > 0;
            if (valid && field.id === "email") valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            if (typeof input.classList !== "undefined") {
                if (valid) input.classList.remove("input-error");
                else input.classList.add("input-error");
            }
            if (!valid && !firstInvalid) firstInvalid = { input: input, label: field.label };
        });
        if (firstInvalid) {
            showCheckoutError("Please complete the required checkout fields: " + firstInvalid.label + ".");
            if (firstInvalid.input && typeof firstInvalid.input.focus === "function") firstInvalid.input.focus();
            return;
        }

        const lines = cartLines();
        if (!lines.length) {
            showCheckoutError("Your cart is empty. Add a product before placing an order.");
            return;
        }

        const payMethod = selectedPaymentMethod();
        let payReference = "";
        if (payMethod === "paybill") {
            const codeEl = document.getElementById("mpesaCode");
            payReference = codeEl ? String(codeEl.value || "").trim().toUpperCase() : "";
            if (payReference.length < 6) {
                showCheckoutError("Enter the M-Pesa transaction code from your payment confirmation SMS.");
                if (codeEl && typeof codeEl.focus === "function") codeEl.focus();
                return;
            }
        }

        const email = fieldValue("email");

        // M-Pesa prompt goes through the STK flow (server-created order +
        // PIN prompt + polling). Card and Paybill use the classic flow below.
        if (selectedPaymentMethod() === "mobile") {
            await placeStkOrder(email, lines);
            return;
        }

        const order = buildOrder(email, lines);
        order.payment = { method: payMethod, reference: payReference, status: payMethod === "card" ? "paid" : "pending" };
        
        // Prepare API payload
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
            number: (payMethod === "paybill" && paybillOrderNumber) ? paybillOrderNumber : undefined
        };

        // Try API first
        let apiSuccess = false;
        try {
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
                console.warn("Order API failed:", err.error || res.status);
            }
        } catch (e) {
            console.warn("Order API unavailable, falling back to localStorage:", e);
        }

        // Always save to localStorage for confirmation page (works offline)
        saveOrder(order);
        saveAccountPreferences();

        try { localStorage.removeItem("xCart"); } catch (e) {}
        if (typeof CartStore !== "undefined" && CartStore) {
            try { if (typeof CartStore.syncBadges === "function") CartStore.syncBadges(); } catch (e) {}
        }
        try { localStorage.removeItem("xCheckoutRedirect"); } catch (e) {}

        window.location.href = "order-confirmation.html";
    });
}

updateTotal();