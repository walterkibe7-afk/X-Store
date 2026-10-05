// =========================
// CART STORE
// Single source of truth for cart contents, shared by every page.
// Backed by localStorage so the cart survives navigation and reloads.
// =========================

const CART_KEY = "xCart";

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