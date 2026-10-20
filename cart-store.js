// =========================
// CART STORE
// Single source of truth for cart contents, shared by every page.
// Backed by localStorage so the cart survives navigation and reloads.
// =========================

const CART_KEY = "xCart";
// The cart is bound to the origin it was first created on. Browsers scope
// localStorage per origin, EXCEPT for local file:// pages, where unrelated
// HTML files (even other projects) share one bucket. Without this stamp a cart
// written while testing any other local page can show up here as a "populated"
// shop on first open. Legitimate carts on a real (https) origin always match
// their own origin, so they are never cleared by this check.
const CART_ORIGIN_KEY = "xCartOrigin";

function currentOrigin() {
    try {
        const origin = window.location ? window.location.origin : "null";
        // "null" = opaque origin; nothing meaningful to bind to, allow as-is.
        return (!origin || origin === "null") ? "" : origin;
    } catch (e) {
        return "";
    }
}

// Run once when cart-store.js loads. Clears the stored cart only when it was
// genuinely created on a different origin (another project / dev port) —
// a same-origin cart, i.e. the current visitor's own cart, is kept untouched.
function enforceCartOrigin() {
    try {
        const origin = currentOrigin();
        if (!origin) return;
        const stamp = localStorage.getItem(CART_ORIGIN_KEY);
        if (stamp === origin) return;
        if (stamp && stamp !== origin) {
            localStorage.removeItem(CART_KEY);
            // eslint-disable-next-line no-console
            console.info("[cart] Cleared a cart created on '" + stamp +
                "'. The browser storage was shared by another origin, so the shop starts empty.");
        }
        localStorage.setItem(CART_ORIGIN_KEY, origin);
    } catch (e) {
        // Storage unavailable (private mode etc.): cart just works in-memory.
    }
}

function readCart() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isValidLine) : [];
    } catch (e) {
        return [];
    }
}

function isValidLine(line) {
    return line &&
        typeof line.id === "string" && line.id.length > 0 &&
        typeof line.name === "string" &&
        typeof line.price === "number" && isFinite(line.price) &&
        typeof line.quantity === "number" && line.quantity > 0;
}

function writeCart(lines) {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(lines));
        // Keep the origin stamp written by enforceCartOrigin() in place even
        // if storages was cleared between loads.
        const origin = currentOrigin();
        if (origin && localStorage.getItem(CART_ORIGIN_KEY) !== origin) {
            localStorage.setItem(CART_ORIGIN_KEY, origin);
        }
    } catch (e) {}
    return lines;
}

// Merge a product into the cart, summing quantities when it is already present.
function addToCart(product, quantity) {
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const lines = readCart();
    const existing = lines.find((line) => line.id === product.id);

    if (existing) {
        existing.quantity += qty;
    } else {
        lines.push({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            quantity: qty,
            category: product.category || "",
            description: product.description || "",
            image: product.image || ""
        });
    }

    return writeCart(lines);
}

function setQuantity(id, quantity) {
    const qty = parseInt(quantity, 10) || 0;
    let lines = readCart();

    if (qty <= 0) {
        lines = lines.filter((line) => line.id !== id);
    } else {
        lines = lines.map((line) => (line.id === id ? Object.assign({}, line, { quantity: qty }) : line));
    }

    return writeCart(lines);
}

function removeFromCart(id) {
    return writeCart(readCart().filter((line) => line.id !== id));
}

function clearCart() {
    return writeCart([]);
}

// Total number of units, used for the navbar badge.
function cartCount() {
    return readCart().reduce((sum, line) => sum + line.quantity, 0);
}

function cartSubtotal() {
    return readCart().reduce((sum, line) => sum + line.price * line.quantity, 0);
}

function cartIsEmpty() {
    return readCart().length === 0;
}

// Keep every navbar badge on the page in sync with the stored cart.
function syncCartBadges() {
    const count = cartCount();
    document.querySelectorAll(".cart-count").forEach((badge) => {
        badge.textContent = count;
    });
    return count;
}

// Cross-tab synchronization.
// The `storage` event fires ONLY in other tabs/windows (never in the tab that
// performed the write), which is exactly the cross-tab signal we need. When it
// arrives, localStorage is already updated by the browser, so a fresh read()
// pulls the other tab's value into this tab's view. We then re-sync the navbar
// badges and re-broadcast a local `cart:updated` CustomEvent so any open cart
// drawer / summary that listens for it re-renders immediately.
function setupCartStorageSync() {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    window.addEventListener("storage", function (event) {
        // `key === null` fires when localStorage was cleared wholesale; treat
        // that as a cart change too.
        if (event && event.key !== CART_KEY && event.key !== null) return;
        try {
            // Re-read so any in-memory projection reflects the other tab now.
            const lines = readCart();
            syncCartBadges();
            window.dispatchEvent(new CustomEvent("cart:updated", {
                detail: { source: "storage", lines: lines }
            }));
        } catch (e) {
            window.dispatchEvent(new CustomEvent("cart:updated", {
                detail: { source: "storage" }
            }));
        }
    });
}

setupCartStorageSync();

// Bind the cart to this origin before anything reads it (see CART_ORIGIN_KEY).
enforceCartOrigin();

window.CartStore = {
    add: addToCart,
    setQuantity: setQuantity,
    remove: removeFromCart,
    clear: clearCart,
    lines: readCart,
    count: cartCount,
    subtotal: cartSubtotal,
    isEmpty: cartIsEmpty,
    syncBadges: syncCartBadges
};