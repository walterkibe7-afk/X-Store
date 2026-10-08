// =========================
// RECEIPT PAGE
// Renders a printable receipt for the most recent order (xLastOrder) or a
// specific order picked with ?n=<order number> from the local order history
// (xOrders). Same data source as order-confirmation, so the receipt can never
// show an order the customer didn't place on this device.
// =========================

(function () {
    var LAST_ORDER_KEY = "xLastOrder";
    var ORDERS_KEY = "xOrders";

    function readJSON(key) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setText(el, text) {
        if (el) el.textContent = text;
    }

    function esc(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // Whole-shilling KES formatting used across the storefront.
    function formatKES(value) {
        var n = Math.round(Number(value) || 0);
        return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // ?n= matches against number / orderNumber / id, otherwise the latest order.
    function findOrder() {
        var wanted = null;
        try { wanted = new URLSearchParams(window.location.search).get("n"); } catch (e) {}
        if (wanted) {
            var history = readJSON(ORDERS_KEY);
            if (Array.isArray(history)) {
                var match = history.find(function (order) {
                    if (!order) return false;
                    var n = order.number || order.orderNumber || order.id;
                    return String(n) === String(wanted);
                });
                if (match) return match;
            }
        }
        return readJSON(LAST_ORDER_KEY);
    }

    function formatDate(iso) {
        if (!iso) return "—";
        var d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) +
            " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }

    function itemRow(item) {
        var price = Number(item.price) || 0;
        var quantity = Number(item.quantity) || 0;
        var unitPrice = (typeof item.unitPrice === "number") ? item.unitPrice : price;
        var lineTotal = (typeof item.lineTotal === "number") ? item.lineTotal : price * quantity;
        return (
            '<div class="order-item">' +
            '<div class="order-item-image"><span></span></div>' +
            '<div class="order-item-info">' +
            "<strong>" + esc(item.name || item.product || "Product") + "</strong>" +
            '<span class="order-item-qty">Qty ' + quantity + " × $" + unitPrice + "</span>" +
            "</div>" +
            '<b class="order-item-price">$' + lineTotal + "</b>" +
            "</div>"
        );
    }

    function addressHTML(address) {
        if (!address) return "<p>—</p>";
        var lines = [];
        var person = [address.firstName, address.lastName].filter(Boolean).join(" ").trim();
        if (person) lines.push("<p>" + esc(person) + "</p>");
        var street = [address.address, address.apartment].filter(Boolean).join(", ").trim();
        if (street) lines.push("<p>" + esc(street) + "</p>");
        var place = [address.city, address.postal || address.zip, address.country].filter(Boolean).join(", ").trim();
        if (place) lines.push("<p>" + esc(place) + "</p>");
        if (address.phone) lines.push("<p>" + esc(address.phone) + "</p>");
        return lines.length ? lines.join("") : "<p>—</p>";
    }

    function paymentHTML(order) {
        var method = order.payment && order.payment.method;
        var ref = order.payment && order.payment.reference;
        if (method === "paybill") {
            return "<p>M-Pesa Paybill" + (ref ? " · Ref " + esc(ref) : "") + "</p><p>Awaiting confirmation</p>";
        }
        if (method) {
            return "<p>" + esc(String(method).toUpperCase()) + (ref ? " · " + esc(ref) : "") + "</p>";
        }
        return "<p>Cash on delivery / Card at checkout</p>";
    }

    var order = findOrder();
    var noOrderEl = document.getElementById("receipt-no-order");
    var bodyEl = document.getElementById("receipt-body");

    if (!order || !Array.isArray(order.items) || !order.items.length) {
        if (noOrderEl) noOrderEl.hidden = false;
        if (bodyEl) bodyEl.hidden = true;
        return;
    }

    if (noOrderEl) noOrderEl.hidden = true;
    if (bodyEl) bodyEl.hidden = false;

    setText(document.getElementById("receipt-number"), order.number || order.orderNumber || order.id || "—");
    setText(document.getElementById("receipt-date"), formatDate(order.createdAt || order.date || order.orderDate));
    document.getElementById("receipt-address").innerHTML = addressHTML(order.address);
    document.getElementById("receipt-payment").innerHTML = paymentHTML(order);
    document.getElementById("receipt-items").innerHTML = order.items.map(itemRow).join("");

    var subtotal = typeof order.subtotal === "number"
        ? order.subtotal
        : order.items.reduce(function (sum, item) { return sum + Number(item.price) * Number(item.quantity); }, 0);
    var shipping = typeof order.shippingCost === "number" ? order.shippingCost :
        (typeof order.shipping === "number" ? order.shipping : 5);
    var total = typeof order.total === "number" ? order.total : subtotal + shipping;

    setText(document.getElementById("receipt-subtotal"), formatKES(subtotal));
    setText(document.getElementById("receipt-shipping"), formatKES(shipping));
    setText(document.getElementById("receipt-total"), formatKES(total));

    var printBtn = document.getElementById("print-receipt");
    if (printBtn) {
        printBtn.addEventListener("click", function () { window.print(); });
    }
})();
