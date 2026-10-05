// =========================
// ACCOUNT (front-end prototype)
// =========================

(function () {
    function readUser() {
        try {
            return JSON.parse(localStorage.getItem("xUser"));
        } catch (e) {
            return null;
        }
    }
    function readOrders() {
        try {
            const raw = localStorage.getItem("xOrders");
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    let loggedIn = null;
    let savedUser = null;
    try {
        loggedIn = localStorage.getItem("xLoggedIn");
    } catch (e) {}
    savedUser = readUser();
    if (loggedIn !== "true" || !savedUser) {
        window.location.href = "login.html";
        return;
    }
    const nameEl = document.getElementById("customerName");
    if (nameEl && savedUser.firstName) {
        nameEl.textContent = savedUser.firstName;
    }
    // Show previous orders (xOrders) without touching other dashboard cards.
    const orders = readOrders().filter((order) => {
        if (!order || !Array.isArray(order.items) || !order.items.length) return false;
        const email = (order.email || (order.customer && order.customer.email) || "").toLowerCase();
        return !savedUser.email || !email || email === String(savedUser.email).toLowerCase();
    });
    const ordersCard = document.querySelector(".account-card");
    if (ordersCard && orders.length) {
        const existing = ordersCard.querySelector(".account-orders");
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        const list = document.createElement("div");
        list.className = "account-orders";
        list.innerHTML = orders.slice(0, 5).map((order) => {
            const number = order.number || order.orderNumber || order.id || "";
            const total = (typeof order.total === "number") ? "$" + order.total : "";
            const count = order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
            return '<p class="account-order-line">' + number + (total ? " · " + total : "") + " · " + count + " item" + (count === 1 ? "" : "s") + "</p>";
        }).join("");
        ordersCard.appendChild(list);
    }
    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            try {
                localStorage.removeItem("xLoggedIn");
                localStorage.removeItem("xRememberLogin");
            } catch (e) {}
            window.location.href = "index.html";
        });
    }
})();