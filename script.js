// =========================
// CART
// =========================

const cartCounter = document.querySelector(".cart-count");

// Reflect the stored cart in the navbar badge as soon as the page loads.
if (typeof CartStore !== "undefined") {
    CartStore.syncBadges();
}

// Keep the badge live when the cart changes in another tab.
window.addEventListener("storage", (event) => {
    if (event && event.key === "xCart" && typeof CartStore !== "undefined") {
        CartStore.syncBadges();
    }
});

// Quick add and the wishlist hearts use event delegation, so they keep working
// for product cards that are rendered after this script runs (the shop grid is
// built from the shared catalogue in products.js).

const QUICK_ADD_LABEL = "Quick add";

function quickAddProduct(button) {
    if (typeof CartStore === "undefined") {
        if (cartCounter) {
            const current = parseInt(cartCounter.textContent, 10) || 0;
            cartCounter.textContent = current + 1;
        }
        return;
    }

    const card = button.closest(".product-card, .shop-product");
    const nameEl = card ? card.querySelector("h3, h2") : null;
    const priceEl = card ? card.querySelector(".product-details strong, .shop-product-info strong") : null;
    const categoryEl = card ? card.querySelector(".product-category, .shop-product-info p") : null;
    const price = parseFloat((priceEl ? priceEl.textContent : "0").replace(/[^0-9.]/g, ""));
    const name = nameEl ? nameEl.textContent.trim() : "Product";

    // Cards rendered from the catalogue carry the exact values in data-*
    // attributes, which is more reliable than reading them back out of the DOM.
    const dataId = card ? card.getAttribute("data-product-id") : null;
    const dataName = card ? card.getAttribute("data-name") : null;
    const dataPrice = card ? card.getAttribute("data-price") : null;
    const dataCategory = card ? card.getAttribute("data-category") : null;

    CartStore.add(
        {
            id: dataId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name: dataName || name,
            price: dataPrice !== null ? Number(dataPrice) : (isNaN(price) ? 0 : price),
            category: dataCategory || (categoryEl ? categoryEl.textContent.trim() : ""),
            description: "",
            image: card ? card.getAttribute("data-image") : null
        },
        1
    );
    CartStore.syncBadges();
}

document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || !target.closest) return;

    const quickAdd = target.closest(".quick-add");
    if (quickAdd) {
        event.preventDefault();
        event.stopPropagation();
        quickAddProduct(quickAdd);
        quickAdd.textContent = "Added \u2713";
        setTimeout(() => {
            quickAdd.textContent = QUICK_ADD_LABEL;
        }, 1200);
        return;
    }

    // Wishlist hearts are purely visual state, so a simple toggle is enough.
    const heart = target.closest(".heart-button");
    if (heart) {
        event.preventDefault();
        event.stopPropagation();
        const filled = heart.textContent.trim() === "\u2665";
        heart.textContent = filled ? "\u2661" : "\u2665";
        // The glyph swap is invisible to assistive tech, so the pressed state
        // has to be exposed or the toggle announces nothing after activation.
        heart.setAttribute("aria-pressed", filled ? "false" : "true");
    }
});


// =========================
// NEWSLETTER
// =========================

const newsletterForm = document.querySelector(".newsletter-form");

if (newsletterForm) {
newsletterForm.addEventListener("submit", (event) => {

    event.preventDefault();

    const input = newsletterForm.querySelector("input");
    const button = newsletterForm.querySelector("button");

    if (!input.value.trim()) {
        return;
    }

    button.innerHTML = "You're in ✓";

    input.value = "";

});
}


// =========================
// MOBILE MENU
// =========================

const menuButton = document.querySelector(".menu-button");
const navLinks = document.querySelector(".nav-links");
const siteNavbar = document.querySelector(".navbar");

function mobileMenuIsOpen() {
    return !!navLinks && navLinks.classList.contains("mobile-open");
}

function setMobileMenu(open, restoreFocus) {
    if (!navLinks || !menuButton) return;
    navLinks.classList.toggle("mobile-open", !!open);
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    // Dismissing with the keyboard must not strand focus on a hidden link.
    if (!open && restoreFocus) menuButton.focus();
}

if (menuButton && navLinks) {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-controls", "site-nav");

    menuButton.addEventListener("click", () => {
        setMobileMenu(!mobileMenuIsOpen());
    });

    // Following a navigation link should always dismiss the menu.
    navLinks.addEventListener("click", (event) => {
        const link = event.target && event.target.closest ? event.target.closest("a") : null;
        if (link) setMobileMenu(false);
    });
}


// =========================
// ACCOUNT LINK
// =========================

const accountLink = document.querySelector('a.icon-button[aria-label="Account"]');

if (accountLink) {

    let loggedIn = null;

    try {
        loggedIn = localStorage.getItem("xLoggedIn");
    } catch (e) {}

    if (loggedIn === "true") {
        accountLink.setAttribute("href", "account.html");
        accountLink.setAttribute("aria-label", "My account");
    } else {
        accountLink.setAttribute("href", "login.html");
    }

}


// =========================
// SIMPLE SCROLL EFFECT
// =========================

window.addEventListener("scroll", () => {

    const navbar = document.querySelector(".navbar");

    if (!navbar) return;

    if (window.scrollY > 40) {
        navbar.classList.add("scrolled");
    } else {
        navbar.classList.remove("scrolled");
    }

});


// =========================
// SEARCH
// One panel, built once from this script, so every page that loads script.js
// shares the exact same search interface instead of growing its own.
// =========================

// The search panel reads the same catalogue as the shop grid (products.js),
// so there is only ever one copy of a product's details.
const SEARCH_PRODUCTS = (window.PRODUCTS || []).map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    subcategory: product.subcategory || "",
    price: product.price
}));

const searchButton = document.querySelector('.icon-button[aria-label="Search"]');
let searchPanel = null;
let searchInput = null;
let searchResults = null;

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

// A product matches on its name OR its category OR its product type, so
// searching "gummies" or "toys" finds the right product just as "wellness" does.
function matchProducts(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return SEARCH_PRODUCTS.slice();
    return SEARCH_PRODUCTS.filter((product) =>
        product.name.toLowerCase().indexOf(q) !== -1 ||
        product.category.toLowerCase().indexOf(q) !== -1 ||
        product.subcategory.toLowerCase().indexOf(q) !== -1
    );
}

function renderSearchResults(query) {
    if (!searchResults) return;

    const matches = matchProducts(query);

    if (!matches.length) {
        searchResults.innerHTML =
            '<li class="search-empty">No products match &ldquo;' + escapeHTML(query) + '&rdquo;.</li>';
        return;
    }

    searchResults.innerHTML = matches.map((product) =>
        '<li><a href="product.html?id=' + encodeURIComponent(product.id) + '">' +
        '<span class="search-result-name">' + product.name + "</span>" +
        '<span class="search-result-category">' + product.category + "</span>" +
        '<span class="search-result-price">$' + product.price + "</span>" +
        "</a></li>"
    ).join("");
}

function searchIsOpen() {
    return !!searchPanel && !searchPanel.hidden;
}

function openSearch() {
    if (!searchPanel) return;
    searchPanel.hidden = false;
    if (searchButton) searchButton.setAttribute("aria-expanded", "true");
    renderSearchResults(searchInput ? searchInput.value : "");
    if (searchInput) {
        searchInput.focus();
        searchInput.select();
    }
}

function closeSearch(restoreFocus) {
    if (!searchPanel) return;
    searchPanel.hidden = true;
    if (searchButton) searchButton.setAttribute("aria-expanded", "false");
    // The panel is hidden, so focus cannot be left inside it: send it back to
    // the control that opened the panel.
    if (restoreFocus && searchButton) searchButton.focus();
}

if (searchButton && siteNavbar) {
    searchPanel = document.createElement("div");
    searchPanel.id = "site-search";
    searchPanel.className = "search-panel";
    searchPanel.hidden = true;
    searchPanel.innerHTML =
        '<div class="search-panel-inner">' +
        '<input type="search" class="search-input" placeholder="Search products or categories" aria-label="Search products" autocomplete="off">' +
        '<button type="button" class="search-close" aria-label="Close search">&times;</button>' +
        "</div>" +
        '<ul class="search-results" aria-live="polite"></ul>';

    siteNavbar.appendChild(searchPanel);

    searchInput = searchPanel.querySelector(".search-input");
    searchResults = searchPanel.querySelector(".search-results");

    searchButton.setAttribute("aria-expanded", "false");
    searchButton.setAttribute("aria-controls", "site-search");

    searchButton.addEventListener("click", () => {
        if (searchIsOpen()) {
            closeSearch(true);
        } else {
            setMobileMenu(false);
            openSearch();
        }
    });

    if (searchInput) searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
    const searchClose = searchPanel.querySelector(".search-close");
    if (searchClose) searchClose.addEventListener("click", () => closeSearch(true));
}

// Clicking away from the navbar dismisses whichever layer is open.
document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || !siteNavbar || siteNavbar.contains(target)) return;
    if (searchIsOpen()) closeSearch();
    if (mobileMenuIsOpen()) setMobileMenu(false);
});

// Escape always backs out, and always hands focus back to the trigger so the
// keyboard user is not dropped at the top of the document.
document.addEventListener("keydown", (event) => {
    if (!event || event.key !== "Escape") return;
    if (searchIsOpen()) closeSearch(true);
    if (mobileMenuIsOpen()) setMobileMenu(false, true);
});

