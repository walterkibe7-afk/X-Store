// =========================
// ACCOUNT (API + localStorage fallback)
// =========================

(function () {
    // =========================
    // ACCOUNT (API + localStorage fallback)
    // =========================

    function escapeHTML(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

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

    function bounceToLogin() {
        try {
            localStorage.removeItem("xLoggedIn");
            localStorage.removeItem("xUser");
        } catch (e) {}
        window.location.href = "login.html";
    }

    if (loggedIn !== "true" || !savedUser) {
        bounceToLogin();
        return;
    }

    if (typeof fetch === "function") {
        try {
            fetch("/api/auth/me", { credentials: "include" })
                .then(function (res) {
                    if (res && res.status === 401) {
                        bounceToLogin();
                    }
                })
                .catch(function () {
                    // Offline fallback: retain localStorage session
                });
        } catch (e) {
            // Synchronous error / offline fallback: retain localStorage session
        }
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
        const ordersCard = document.querySelector('[data-card="orders"]');
        if (ordersCard) {
            const existing = ordersCard.querySelector(".account-orders");
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            if (filtered.length) {
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
        }
    });

    // ---- Wishlist (Saved items) ----
    const WISHLIST_KEY = "xWishlist";
    const wishlistList = document.getElementById("wishlistList");
    const wishlistEmpty = document.getElementById("wishlistEmpty");

    function readWishlist() {
        try {
            const raw = localStorage.getItem(WISHLIST_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(function (w) {
                return w && typeof w.id === "string" && w.id.length > 0;
            }) : [];
        } catch (e) {
            return [];
        }
    }

    function renderWishlist() {
        if (!wishlistList || !wishlistEmpty) return;
        const items = readWishlist();
        if (items.length === 0) {
            wishlistEmpty.style.display = "block";
            wishlistList.hidden = true;
            return;
        }
        wishlistEmpty.style.display = "none";
        wishlistList.hidden = false;
        wishlistList.innerHTML = items.map(function (item) {
            const price = (typeof item.price === "number" && !isNaN(item.price))
                ? formatKES(item.price)
                : "";
            return '<div class="wishlist-line">' +
                '<a href="product.html?id=' + encodeURIComponent(item.id) + '" class="wishlist-link">' +
                (item.image ? '<img src="' + item.image + '" alt="" class="wishlist-thumb">' : "") +
                '<span class="wishlist-name">' + (item.name || item.id) + '</span>' +
                (price ? '<span class="wishlist-price">' + price + '</span>' : "") +
                '</a>' +
                '<button class="wishlist-remove" data-id="' + escapeHTML(item.id) + '">Remove</button>' +
                '</div>';
        }).join("");

        // Wire up remove buttons
        wishlistList.querySelectorAll(".wishlist-remove").forEach(function (btn) {
            btn.addEventListener("click", function () {
                const id = this.getAttribute("data-id");
                const items = readWishlist().filter(function (w) { return w.id !== id; });
                try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(items)); } catch (e) {}
                renderWishlist();
            });
        });
    }

    // Initial render.
    renderWishlist();

    // Re-render when the wishlist changes in this tab (heart toggle on shop/index)
    // or in another tab (storage event).
    if (typeof window !== "undefined") {
        window.addEventListener("wishlist:updated", renderWishlist);
        window.addEventListener("storage", function (event) {
            if (event && event.key === WISHLIST_KEY) renderWishlist();
        });
    }

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            try {
                await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            } catch (e) {}
            try {
                localStorage.removeItem("xLoggedIn");
                localStorage.removeItem("xRememberLogin");
                localStorage.removeItem("xUser");
            } catch (e) {}
            window.location.href = "index.html";
        });
    }
})();