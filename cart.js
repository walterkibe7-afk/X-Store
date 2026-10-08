// =========================
// CART PAGE
// Renders whatever CartStore holds. With an empty bag the product list is
// replaced by an empty state and checkout is disabled.
// =========================

// Flat rate used by the summary; checkout uses the same KSh 650 standard delivery.
const SHIPPING_FLAT_RATE = 650;

// Whole-shilling KES formatting used across the storefront.
function formatKES(value) {
    const n = Math.round(Number(value) || 0);
    return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const cartProductsEl = document.getElementById("cartProducts");
const cartLinesEl = document.getElementById("cartLines");
const cartRecommendationEl = document.getElementById("cartRecommendation");
const cartEmptyEl = document.getElementById("cartEmpty");
const subtotalElement = document.querySelector(".summary-subtotal");
const totalElement = document.querySelector(".summary-total-price");
const shippingElement = document.querySelector(".summary-shipping-price");
const itemCountElement = document.getElementById("cartItemCount");
const cartCountEl = document.querySelector(".cart-count");
const checkoutButton = document.getElementById("checkoutButton");
const signinHint = document.getElementById("checkoutSigninHint");

function isLoggedIn() {
    try {
        return localStorage.getItem("xLoggedIn") === "true";
    } catch (e) {
        return false;
    }
}

// The catalogue knows each product's artwork; backfill it onto any line
// that was stored before the image travelled with the cart entry.
function hydrateLines(lines) {
    const byId = {};
    (window.PRODUCTS || []).forEach((item) => {
        byId[item.id] = item;
    });
    return lines.map((line) => {
        const product = byId[line.id];
        if (!product) return line;
        const hydrated = Object.assign({}, line);
        if (!hydrated.category && product.category) hydrated.category = product.category;
        if (!hydrated.description && product.description) hydrated.description = product.description;
        if (!hydrated.imageClass && product.image) hydrated.imageClass = product.image;
        return hydrated;
    });
}

// Rebuild the line-item list from the store on every change.
function renderCart() {
    const lines = hydrateLines(CartStore.lines());
    const empty = lines.length === 0;

    if (cartLinesEl) cartLinesEl.innerHTML = empty ? "" : lines.map(buildLine).join("");

    const subtotal = CartStore.subtotal();
    // Flat rate shown in the cart and again on checkout, so the two agree.
    const shipping = empty ? 0 : SHIPPING_FLAT_RATE;

    if (subtotalElement) subtotalElement.textContent = formatKES(subtotal);
    if (shippingElement) shippingElement.textContent = formatKES(shipping);
    if (totalElement) totalElement.textContent = formatKES(subtotal + shipping);

    // The header counts UNITS: 1 x Silk Touch + 2 x After Dark Oil reads "3 ITEMS".
    if (itemCountElement) {
        const units = lines.reduce((sum, line) => sum + line.quantity, 0);
        itemCountElement.textContent = units + (units === 1 ? " ITEM" : " ITEMS");
        itemCountElement.hidden = empty;
    }

    CartStore.syncBadges();

    if (cartEmptyEl) cartEmptyEl.hidden = !empty;
    if (cartRecommendationEl) cartRecommendationEl.hidden = empty;

    // The summary rows only make sense once there is something to total.
    const subtotalRow = subtotalElement ? subtotalElement.closest(".summary-row") : null;
    if (subtotalRow) subtotalRow.hidden = empty;

    const shippingRow = shippingElement ? shippingElement.closest(".summary-row") : null;
    if (shippingRow) shippingRow.hidden = empty;

    const totalRow = totalElement ? totalElement.closest(".summary-total") : null;
    if (totalRow) totalRow.hidden = empty;

    const divider = document.querySelector(".summary-divider");
    if (divider) divider.hidden = empty;

    renderCheckoutState();
}

function buildLine(line) {
    return (
        '<article class="cart-product" data-id="' + line.id + '">' +
        '<div class="cart-product-image' + (line.imageClass ? " " + line.imageClass : "") + '"><span></span></div>' +
        '<div class="cart-product-details">' +
        '<div class="cart-product-top">' +
        "<div>" +
        (line.category ? '<p class="cart-category">' + line.category + "</p>" : "") +
        "<h2>" + line.name + "</h2>" +
        (line.description ? '<p class="cart-description">' + line.description + "</p>" : "") +
        "</div>" +
        '<div class="cart-prices">' +
        '<span class="cart-unit-price">$' + line.price + " each</span>" +
        '<strong class="cart-product-price">$' + (line.price * line.quantity) + "</strong>" +
        "</div>" +
        "</div>" +
        '<div class="cart-product-bottom">' +
        '<div class="cart-quantity">' +
        '<button class="quantity-minus" data-id="' + line.id + '" aria-label="Decrease quantity">-</button>' +
        '<span class="quantity">' + line.quantity + "</span>" +
        '<button class="quantity-plus" data-id="' + line.id + '" aria-label="Increase quantity">+</button>' +
        "</div>" +
        '<button class="remove-product" data-id="' + line.id + '">Remove</button>' +
        "</div>" +
        "</div>" +
        "</article>"
    );
}

// Event delegation: one listener covers every rendered line.
if (cartLinesEl) {
    cartLinesEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || !target.classList) return;

        if (target.classList.contains("quantity-plus")) {
            const line = CartStore.lines().find((l) => l.id === target.dataset.id);
            if (line) CartStore.setQuantity(line.id, line.quantity + 1);
            renderCart();
            return;
        }

        if (target.classList.contains("quantity-minus")) {
            const line = CartStore.lines().find((l) => l.id === target.dataset.id);
            if (line) CartStore.setQuantity(line.id, line.quantity - 1);
            renderCart();
            return;
        }

        if (target.classList.contains("remove-product")) {
            CartStore.remove(target.dataset.id);
            renderCart();
        }
    });
}

// Require login before checkout
function renderCheckoutState() {
    if (!checkoutButton) return;

    const empty = CartStore.isEmpty();

    if (empty) {
        checkoutButton.textContent = "Your bag is empty";
        checkoutButton.setAttribute("aria-disabled", "true");
        if (signinHint) signinHint.hidden = true;
        return;
    }

    checkoutButton.removeAttribute("aria-disabled");

    if (isLoggedIn()) {
        checkoutButton.textContent = "Continue to checkout";
        if (signinHint) signinHint.hidden = true;
    } else {
        checkoutButton.textContent = "Sign in to continue";
        if (signinHint) signinHint.hidden = false;
    }
}

if (checkoutButton) {
    checkoutButton.addEventListener("click", (event) => {
        if (CartStore.isEmpty()) {
            event.preventDefault();
            return;
        }

        if (!isLoggedIn()) {
            event.preventDefault();
            try {
                localStorage.setItem("xCheckoutRedirect", "checkout.html");
            } catch (e) {}
            window.location.href = "login.html";
        } else {
            try {
                localStorage.removeItem("xCheckoutRedirect");
            } catch (e) {}
        }
    });
}

// Add recommendation
const recommendButton = document.querySelector(".cart-recommendation button");
if (recommendButton) {
    recommendButton.addEventListener("click", () => {
        CartStore.add(
            {
                id: "after-dark-oil",
                name: "After Dark Oil",
                price: 3650,
                category: "Wellness", subcategory: "Body & Massage"
            },
            1
        );
        renderCart();
        recommendButton.textContent = "Added ✓";
        setTimeout(() => {
            recommendButton.textContent = "Add";
        }, 1200);
    });
}

// Promo code
const promo = document.querySelector(".promo");
const promoToggle = document.querySelector(".promo-toggle");
if (promo && promoToggle) {
    const promoPanel = promo.querySelector(".promo-content");
    if (promoPanel) {
        // Match the pattern the shop filters use: the toggle has to name the
        // panel it opens, not just announce that something opened.
        if (!promoPanel.id) promoPanel.id = "promo-code-panel";
        promoToggle.setAttribute("aria-controls", promoPanel.id);
    }
    promoToggle.setAttribute("aria-expanded", promo.classList.contains("open") ? "true" : "false");
    promoToggle.addEventListener("click", () => {
        const open = promo.classList.toggle("open");
        // The panel only moves by class, so its state has to be published for
        // assistive tech the same way the shop filters do it.
        promoToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
}

renderCart();