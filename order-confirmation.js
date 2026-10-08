// =========================
// ORDER CONFIRMATION PAGE
// Renders the order snapshot written by checkout.js. The point of this page is
// reassurance: the order went through, here is what was bought, and your
// privacy is handled. Nothing else.
// =========================

const LAST_ORDER_KEY = "xLastOrder";
const ORDERS_KEY = "xOrders";

const firstNameEl = document.getElementById("customer-firstname");
const orderIdEl = document.getElementById("order-id");
const orderItemsEl = document.getElementById("order-items-container");
const subtotalEl = document.getElementById("order-subtotal");
const shippingEl = document.getElementById("order-shipping");
const totalEl = document.getElementById("order-total");
const deliveryDatesEl = document.getElementById("delivery-dates");
const deliveryMethodEl = document.getElementById("delivery-method");
const addressEl = document.getElementById("shipping-address-container");
const summaryEl = document.querySelector(".order-summary");
const deliveryEl = document.querySelector(".delivery-info");

function readJSON(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function readAccount() {
    const user = readJSON("xUser");
    return user && typeof user === "object" ? user : null;
}

function setText(el, text) {
    if (el) el.textContent = text;
}

// Whole-shilling KES formatting used across the storefront.
function formatKES(value) {
    const n = Math.round(Number(value) || 0);
    return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// One row per product line: product, quantity, unit price and line total.
function buildItem(item) {
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    const lineTotal = (typeof item.lineTotal === "number") ? item.lineTotal : price * quantity;
    const unitPrice = (typeof item.unitPrice === "number") ? item.unitPrice : price;
    const category = item.category ? '<span class="order-item-category">' + item.category + "</span>" : "";
    return (
        '<div class="order-item">' +
        '<div class="order-item-image"><span></span></div>' +
        "<div class=\"order-item-info\">" +
        "<strong>" + (item.name || item.product || "Product") + "</strong>" +
        category +
        '<span class="order-item-qty">Qty ' + quantity + " × $" + unitPrice + "</span>" +
        "</div>" +
        '<b class="order-item-price">$' + lineTotal + "</b>" +
        "</div>"
    );
}

function buildAddress(address) {
    if (!address) return "";
    const lines = [];
    const person = [address.firstName, address.lastName].filter(Boolean).join(" ").trim();
    if (person) lines.push("<p>" + person + "</p>");

    const street = [address.address, address.apartment].filter(Boolean).join(", ").trim();
    if (street) lines.push("<p>" + street + "</p>");

    const postalZip = address.postal || address.zip;
    const placeParts = [address.city, postalZip, address.country].filter(Boolean).join(", ").trim();
    if (placeParts) lines.push("<p>" + placeParts + "</p>");

    if (address.phone) lines.push("<p>" + address.phone + "</p>");

    return lines.join("");
}

// Fallback for a direct visit with no stored order: keep the page calm and
// useful instead of showing an empty shell.
function renderNoOrder() {
    setText(document.getElementById("confirmation-title"), "NO ORDER FOUND");

    const icon = document.querySelector(".confirmation-icon");
    if (icon) icon.hidden = true;

    const thanks = document.querySelector(".thank-you-msg");
    if (thanks) thanks.hidden = true;

    const intro = document.querySelector(".preparing-msg");
    if (intro) {
        intro.textContent = "We could not find an order on this device. Browse the collection and find something worth making space for.";
    }

    const numberBlock = document.querySelector(".order-number");
    if (numberBlock) numberBlock.hidden = true;

    if (summaryEl) summaryEl.hidden = true;
    if (deliveryEl) deliveryEl.hidden = true;

    document.querySelectorAll(".divider").forEach((el) => {
        el.hidden = true;
    });

    const notice = document.querySelector(".discreet-packaging-notice");
    if (notice) notice.hidden = true;
}

function renderConfirmation() {
    // Direct-access protection: without xLastOrder there is no fake order.
    const order = readJSON(LAST_ORDER_KEY);

    if (!order || !Array.isArray(order.items) || !order.items.length) {
        renderNoOrder();
        return;
    }

    const account = readAccount();
    const firstName = (order.customer && order.customer.firstName) ||
        (order.address && order.address.firstName) ||
        (account && account.firstName) ||
        "Customer";
    setText(firstNameEl, firstName);

    // Keep a fresh order number if an older snapshot stored a bare id.
    setText(orderIdEl, order.number || order.orderNumber || order.id || "X48291");

    if (orderItemsEl) orderItemsEl.innerHTML = order.items.map(buildItem).join("");

    // Paybill orders are confirmed asynchronously (bank callback or manual
    // review), so say "received, awaiting payment" instead of "confirmed".
    const payMethod = order.payment && order.payment.method;
    const payRef = order.payment && order.payment.reference;
    if (payMethod === "paybill") {
        setText(document.getElementById("confirmation-title"), "ORDER RECEIVED");
        const intro = document.querySelector(".preparing-msg");
        if (intro) {
            intro.textContent = "We received your order and are waiting for your M-Pesa payment" +
                (payRef ? " (code " + payRef + ")" : "") +
                ". We will confirm and dispatch as soon as it clears.";
        }
    }

    const subtotal = typeof order.subtotal === "number"
        ? order.subtotal
        : order.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const shipping = typeof order.shippingCost === "number" ? order.shippingCost :
        (typeof order.shipping === "number" ? order.shipping : 5);
    const total = typeof order.total === "number" ? order.total : subtotal + shipping;

    setText(subtotalEl, formatKES(subtotal));
    setText(shippingEl, formatKES(shipping));
    setText(totalEl, formatKES(total));

    if (order.delivery) {
        const from = order.delivery.from;
        const to = order.delivery.to;
        if (from && to) setText(deliveryDatesEl, from + " – " + to);
        if (deliveryMethodEl) {
            deliveryMethodEl.textContent = order.delivery.method +
                (order.delivery.window ? " · " + order.delivery.window : "");
        }
    }

    const addressHTML = buildAddress(order.address);
    if (addressEl) {
        if (addressHTML) {
            addressEl.innerHTML = addressHTML;
        } else {
            const block = addressEl.closest(".shipping-address");
            if (block) block.hidden = true;
        }
    }
}

renderConfirmation();