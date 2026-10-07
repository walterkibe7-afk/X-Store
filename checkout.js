// =========================
// CHECKOUT PAGE
// =========================

// Require login before checkout
(function () {
    let loggedIn = null;
    try {
        loggedIn = localStorage.getItem("xLoggedIn");
    } catch (e) {}
    if (loggedIn !== "true") {
        try {
            localStorage.setItem("xCheckoutRedirect", "checkout.html");
        } catch (e) {}
        window.location.href = "login.html";
    }
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
            '<span>$' + price + ' each &times; ' + qty + '</span></div>' +
            '<b>$' + (price * qty) + '</b>' +
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
    const shipping = selected ? parsePrice(selected.textContent) : 5;
    if (shippingEl) shippingEl.textContent = "$" + shipping;
    if (subtotalEl && subtotalEl !== shippingEl) subtotalEl.textContent = "$" + cartSubtotal();
    if (totalEl) totalEl.textContent = "$" + (cartSubtotal() + shipping);
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
paymentMethods.forEach((method) => {
    method.addEventListener("click", () => {
        paymentMethods.forEach((item) => item.classList.remove("active"));
        method.classList.add("active");
        const isMobile = method.textContent.trim() === "Mobile money";
        if (paymentFields) paymentFields.style.display = isMobile ? "none" : "block";
        if (mobileMoneyFields) mobileMoneyFields.style.display = isMobile ? "block" : "none";
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
    if (!option) return { name: "Standard delivery", window: "3-7 business days", cost: 5 };
    const nameEl = (option && typeof option.querySelector === "function") ? option.querySelector("strong") : null;
    const windowEl = (option && typeof option.querySelector === "function") ? option.querySelector("span") : null;
    const costEl = (option && typeof option.querySelector === "function") ? option.querySelector("b") : null;
    let cost = costEl ? parsePrice(costEl.textContent) : 0;
    if (!cost) {
        const text = (option && option.textContent) ? option.textContent : "";
        cost = parsePrice(text) || 5;
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

// Place order: validate -> snapshot -> clear the bag -> Order Confirmation.
// Front-end mockup only: no real payment is processed.
if (placeOrderButton) {
    placeOrderButton.addEventListener("click", () => {
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
        // Only inputs actually rendered by this checkout design can block an
        // order, so fixtures that omit optional nodes (or older markup without
        // the postal field) still place successfully.
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

        const email = fieldValue("email");
        const order = buildOrder(email, lines);
        saveOrder(order);

        // The order exists, so the consent choices made on this form can be kept.
        saveAccountPreferences();

        // The order is placed, so the bag is emptied (only after success).
        // The xCart key is removed outright rather than reset to an empty
        // array, so a stored cart never lingers after a completed checkout.
        try {
            localStorage.removeItem("xCart");
        } catch (e) {}
        if (typeof CartStore !== "undefined" && CartStore) {
            try {
                if (typeof CartStore.syncBadges === "function") CartStore.syncBadges();
            } catch (e) {}
        }
        try {
            localStorage.removeItem("xCheckoutRedirect");
        } catch (e) {}

        window.location.href = "order-confirmation.html";
    });
}

updateTotal();