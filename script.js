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
let searchField = null;
let startGhost = null;
let stopGhost = null;

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
    if (typeof startGhost === "function") startGhost();
}

function closeSearch(restoreFocus) {
    if (!searchPanel) return;
    searchPanel.hidden = true;
    if (typeof stopGhost === "function") stopGhost();
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
        '<div class="search-field">' +
        '<input type="search" class="search-input" placeholder="" aria-label="Search products" autocomplete="off">' +
        '<div class="search-ghost" aria-hidden="true"><span>Search Silk Touch...</span></div>' +
        '<canvas class="search-vanish" aria-hidden="true"></canvas>' +
        '</div>' +
        '<button type="button" class="search-close" aria-label="Close search">&times;</button>' +
        "</div>" +
        '<ul class="search-results" aria-live="polite"></ul>';

    siteNavbar.appendChild(searchPanel);

    searchInput = searchPanel.querySelector(".search-input");
    searchResults = searchPanel.querySelector(".search-results");
    searchField = searchPanel.querySelector(".search-field");
    const searchGhost = searchPanel.querySelector(".search-ghost");
    const searchGhostText = searchGhost ? searchGhost.querySelector("span") : null;
    const vanishCanvas = searchPanel.querySelector(".search-vanish");

    // Aceternity placeholders-and-vanish-input, ported to vanilla JS.
    // Placeholders rotate every 3s (pausing when the tab is hidden);
    // on Enter the typed text bursts into canvas particles, then the
    // live results stay in place per the brand behaviour.
    const VANISH_PLACEHOLDERS = [
        "Search Silk Touch...",
        "Try \"gummies\"...",
        "Wellness oils...",
        "Toys and lubricants...",
        "Search products or categories"
    ];
    let ghostIndex = 0;
    let ghostTimer = null;
    let vanishing = false;
    function paintGhost() {
        if (!searchGhost || !searchGhostText) return;
        searchGhost.classList.add("leaving");
        window.setTimeout(() => {
            ghostIndex = (ghostIndex + 1) % VANISH_PLACEHOLDERS.length;
            searchGhostText.textContent = VANISH_PLACEHOLDERS[ghostIndex];
            searchGhost.classList.remove("leaving");
        }, 160);
    }
    startGhost = function () {
        if (typeof stopGhost === "function" && ghostTimer) stopGhost();
        ghostTimer = window.setInterval(() => {
            if (document.visibilityState === "visible" && searchInput && !searchInput.value) paintGhost();
        }, 3000);
    };
    stopGhost = function () {
        if (ghostTimer) window.clearInterval(ghostTimer);
        ghostTimer = null;
    };
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") startGhost();
        else stopGhost();
    });
    function vanishBurst(done) {
        if (!searchField || !vanishCanvas || !searchInput) {
            if (typeof done === "function") done();
            return;
        }
        const text = searchInput.value || "";
        if (!text) {
            if (typeof done === "function") done();
            return;
        }
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            searchInput.value = "";
            searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            if (typeof done === "function") done();
            return;
        }
        vanishing = true;
        searchField.classList.add("vanishing");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = searchInput.getBoundingClientRect();
        vanishCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
        vanishCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = vanishCanvas.getContext("2d");
        if (!ctx) {
            vanishing = false;
            searchField.classList.remove("vanishing");
            if (typeof done === "function") done();
            return;
        }
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, rect.height);
        const style = window.getComputedStyle(searchInput);
        ctx.font = style.fontSize + " " + style.fontFamily;
        ctx.fillStyle = "#252326";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 2, rect.height / 2);
        let imageData = null;
        try {
            imageData = ctx.getImageData(0, 0, vanishCanvas.width, vanishCanvas.height);
        } catch (e) {
            imageData = null;
        }
        const particles = [];
        if (imageData) {
            const data = imageData.data;
            const step = 3;
            for (let y = 0; y < vanishCanvas.height; y += step) {
                for (let x = 0; x < vanishCanvas.width; x += step) {
                    const i = (y * vanishCanvas.width + x) * 4;
                    if (data[i + 3] > 128) {
                        particles.push({
                            x: x / dpr,
                            y: y / dpr,
                            vx: (Math.random() - 0.5) * 2.4,
                            vy: (Math.random() - 0.9) * 2.4,
                            r: Math.random() * 1.8 + 0.4,
                            life: 1
                        });
                    }
                }
            }
        }
        const start = performance.now();
        const DURATION = 650;
        function frame(now) {
            const t = Math.min(1, (now - start) / DURATION);
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.fillStyle = "#817586";
            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.06;
                p.life = 1 - t;
                if (p.life <= 0) return;
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.1, p.r * (1 - t)), 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            if (t < 1) {
                window.requestAnimationFrame(frame);
            } else {
                vanishing = false;
                searchField.classList.remove("vanishing");
                ctx.clearRect(0, 0, rect.width, rect.height);
                if (typeof done === "function") done();
            }
        }
        window.requestAnimationFrame(frame);
    }

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

    if (searchInput) searchInput.addEventListener("input", () => {
        if (vanishing) return;
        if (searchField) searchField.classList.toggle("has-value", !!searchInput.value);
        renderSearchResults(searchInput.value);
    });
    if (searchInput) searchInput.addEventListener("keydown", (event) => {
        if (event && event.key === "Enter") {
            event.preventDefault();
            if (vanishing) return;
            vanishBurst(() => {
                searchInput.value = "";
                if (searchField) searchField.classList.remove("has-value");
                renderSearchResults("");
                searchInput.focus();
            });
        }
    });
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

// Nav dropdown toggle
document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".nav-dropdown-trigger");
    if (trigger) {
        const dropdown = trigger.closest(".nav-dropdown");
        dropdown.classList.toggle("open");
        trigger.setAttribute("aria-expanded", dropdown.classList.contains("open"));
        return;
    }
    if (!event.target.closest(".nav-dropdown")) {
        document.querySelectorAll(".nav-dropdown.open").forEach(d => d.classList.remove("open"));
    }
});


// =========================
// ELLE INTRO LOADER (index.html only)
// White veil -> Elle centre -> El()le slot -> 3 slides ->
// winner expands to hero, pushing words off-screen.
// Overlay is hidden by default so no-JS shows the hero.
// =========================

(function runElleIntro() {
    const overlay = document.querySelector("[data-intro]");
    const hero = document.querySelector("[data-hero]");
    if (!overlay || !hero) return;

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
        document.documentElement.classList.add("hero-done");
        return;
    }

    const root = document.documentElement;
    const slides = Array.from(overlay.querySelectorAll(".intro-slide"));
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    overlay.hidden = false;
    root.classList.add("is-intro");

    // Pre-decode slides so the cycle never flashes empty.
    if (window.Image) {
        slides.forEach((img) => {
            const probe = new window.Image();
            probe.src = img.currentSrc || img.src;
        });
    }

    function showSlide(index) {
        slides.forEach((img, i) => img.classList.toggle("is-active", i === index));
    }

    (async () => {
        await wait(650);                    // 1. Elle appears dead centre
        root.classList.add("is-slot");      // 2. square box opens -> El()le
        await wait(750);
        showSlide(0);                       // 3. slideshow inside the box
        await wait(500);
        showSlide(1);
        await wait(500);
        showSlide(2);                       // winner is the hero image
        await wait(600);
        root.classList.add("is-expand");    // 4. expands, pushing words off-screen
        await wait(950);
        overlay.hidden = true;              // 5. Elle bottom-left, CTAs other side
        root.classList.remove("is-intro", "is-slot", "is-expand");
        root.classList.add("hero-done");
    })();
})();

