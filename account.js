// =========================
// ACCOUNT (API + localStorage fallback)
// =========================

(function () {
    // Whole-shilling KES formatting used across the storefront.
    function formatKES(value) {
        const n = Math.round(Number(value) || 0);
        return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
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

    // Try to fetch orders from API, fall back to localStorage
    async function loadOrders() {
        try {
            const res = await fetch("/api/my-orders", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                return data.orders || [];
            }
        } catch (e) {
            console.warn("API unavailable, using localStorage orders:", e);
        }
        return readOrders();
    }

    loadOrders().then((orders) => {
        const filtered = orders.filter((order) => {
            if (!order || !Array.isArray(order.items) || !order.items.length) return false;
            const email = (order.email || (order.customer && order.customer.email) || "").toLowerCase();
            return !savedUser.email || !email || email === String(savedUser.email).toLowerCase();
        });
        const ordersCard = document.querySelector(".account-card");
        if (ordersCard && filtered.length) {
            const existing = ordersCard.querySelector(".account-orders");
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            const list = document.createElement("div");
            list.className = "account-orders";
            list.innerHTML = filtered.slice(0, 5).map((order) => {
                const number = order.number || order.orderNumber || order.id || "";
                const total = (typeof order.total === "number") ? formatKES(order.total) : "";
                const count = order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                return '<p class="account-order-line">' + number + (total ? " · " + total : "") + " · " + count + " item" + (count === 1 ? "" : "s") + "</p>";
            }).join("");
            ordersCard.appendChild(list);
        }
    });

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            try {
                await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            } catch (e) {}
            try {
                localStorage.removeItem("xLoggedIn");
                localStorage.removeItem("xRememberLogin");
            } catch (e) {}
            window.location.href = "index.html";
        });
    }
})();