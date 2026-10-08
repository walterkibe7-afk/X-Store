// =========================
// SHOP PAGE
// Fetches products from API, then drives grid, Filter drawer, Sort menu, Load more.
// =========================

(function () {
    // Whole-shilling KES formatting used across the storefront.
    function formatKES(value) {
        const n = Math.round(Number(value) || 0);
        return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    const grid = document.querySelector(".shop-grid");
    if (!grid) return;

    // How many cards a single "page" of the grid holds.
    const PAGE_SIZE = 4;

    const chips = Array.prototype.slice.call(document.querySelectorAll(".shop-categories a"));
    const countEl = document.querySelector(".shop-toolbar > p");
    const emptyState = document.querySelector(".shop-empty-state");
    const navLinks = document.querySelectorAll(".nav-links a");
    const shopTrigger = document.querySelector(".nav-dropdown-trigger");

    const filterButton = document.querySelector(".filter-button");
    const filterPanel = document.querySelector(".filter-panel");
    const sortButton = document.querySelector(".sort-button");
    const sortMenu = document.querySelector(".sort-menu");
    const sortLabelEl = sortButton ? sortButton.querySelector("strong") : null;
    const categoryInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="shopCategory"]'));
    const subcategoryInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="shopSubcategory"]'));
    const priceInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="shopPrice"]'));
    const loadMoreWrap = document.querySelector(".load-more");
    const loadMoreButton = loadMoreWrap ? loadMoreWrap.querySelector("button") : null;

    const KNOWN_CATEGORIES = ["", "intimate", "wellness"];
    const NAV_LABEL_FOR_CATEGORY = { intimate: "Intimate", wellness: "Wellness" };

    const SORT_LABELS = {
        "featured": "Featured",
        "newest": "Newest",
        "price-asc": "Price: Low to High",
        "price-desc": "Price: High to Low"
    };

    function categoryFromSearch(search) {
        const match = /[?&]category=([a-z-]+)/.exec(search || "");
        const slug = match ? match[1] : "";
        return KNOWN_CATEGORIES.indexOf(slug) === -1 ? "" : slug;
    }

    function chipCategory(anchor) {
        return categoryFromSearch(anchor.getAttribute("href") || "");
    }

    // Map API product to storefront format. Missing fields degrade to
    // blanks so one malformed row never breaks the whole grid.
    function adaptProduct(p) {
        const src = p || {};
        const category = src.category || "";
        const subcategory = src.subcategory || "";
        const imageMap = {
            "https://via.placeholder.com/600x600": "image-a",
            "https://via.placeholder.com/600x600": "image-b",
            "https://via.placeholder.com/600x600": "image-c",
            "https://via.placeholder.com/600x600": "image-d",
            "https://via.placeholder.com/600x600": "image-e",
            "https://via.placeholder.com/600x600": "image-f",
            "https://via.placeholder.com/600x600": "image-g",
            "https://via.placeholder.com/600x600": "image-h"
        };
        const imageClasses = ["image-a", "image-b", "image-c", "image-d", "image-e", "image-f", "image-g", "image-h"];
        const id = String(src.id || "");
        const firstAlpha = id.replace(/[^a-z]/g, '').charCodeAt(0);
        const idx = imageClasses.indexOf(isNaN(firstAlpha) ? -1 : firstAlpha % imageClasses.length);
        const imageClass = imageClasses[Math.max(0, idx)];

        return {
            id: id,
            name: src.name || "Untitled product",
            category: category,
            categorySlug: category.toLowerCase(),
            subcategory: subcategory,
            subcategorySlug: subcategory.toLowerCase().replace(/\s+/g, '-'),
            price: Number(src.price) || 0,
            oldPrice: src.compare_price,
            badge: src.badge || "",
            badgeClass: src.badge ? String(src.badge).toLowerCase().replace(/\s+/g, '-') : '',
            rating: src.rating || 0,
            reviews: src.review_count || 0,
            featured: !!src.featured,
            newest: false,
            image: imageClass,
            description: src.description || "",
            details: src.details || "",
            care: '',
            shipping: ''
        };
    }

    let CATALOGUE = [];
    let loading = true;

    const state = {
        category: categoryFromSearch(window.location.search),
        subcategories: [],
        prices: [],
        sort: "featured",
        shown: PAGE_SIZE
    };

    function matchesCategory(product) {
        if (state.category && product.categorySlug !== state.category) return false;
        if (state.subcategories.length && state.subcategories.indexOf(product.subcategorySlug) === -1) return false;
        return true;
    }

    function matchesPrice(product) {
        if (!state.prices.length) return true;
        return state.prices.some((band) => {
            if (band === "under-3000") return product.price < 3000;
            if (band === "3000-6000") return product.price >= 3000 && product.price <= 6000;
            if (band === "over-6000") return product.price > 6000;
            return false;
        });
    }

    function sortProducts(list) {
        const sorted = list.slice();

        if (state.sort === "price-asc") {
            sorted.sort((a, b) => a.price - b.price);
        } else if (state.sort === "price-desc") {
            sorted.sort((a, b) => b.price - a.price);
        } else if (state.sort === "newest") {
            sorted.sort((a, b) => (b.newest ? 1 : 0) - (a.newest ? 1 : 0));
        } else {
            sorted.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        }

        return sorted;
    }

    function matchingProducts() {
        return sortProducts(CATALOGUE.filter((product) => matchesCategory(product) && matchesPrice(product)));
    }

    function escapeHTML(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, (char) => ({
            "&": "&",
            "<": "<",
            ">": ">",
            '"': '"',
            "'": "'"
        }[char]));
    }

    function cardHTML(product) {
        const badge = product.badge
            ? '<span class="product-badge' + (product.badgeClass ? " " + product.badgeClass : "") + '">' + escapeHTML(product.badge) + "</span>"
            : "";

        const stars = new Array(product.rating + 1).join("&#9733;") + " <small>(" + product.reviews + ")</small>";

        const price = product.oldPrice
            ? "<div><strong>" + formatKES(product.price) + "</strong><del>" + formatKES(product.oldPrice) + "</del></div>"
            : "<strong>" + formatKES(product.price) + "</strong>";

        return '<article class="shop-product cat-' + escapeHTML(product.categorySlug) + '"' +
            ' data-product-id="' + escapeHTML(product.id) + '"' +
            ' data-name="' + escapeHTML(product.name) + '"' +
            ' data-price="' + product.price + '"' +
            ' data-category="' + escapeHTML(product.category) + '">' +
            '<a href="product.html?id=' + encodeURIComponent(product.id) + '" class="shop-product-image ' + escapeHTML(product.image) + '">' +
            badge +
            '<button class="heart-button" aria-label="Wishlist">&#9825;</button>' +
            '<button class="quick-add">Quick add</button>' +
            "</a>" +
            '<div class="shop-product-info"><div>' +
            '<p class="cat-' + escapeHTML(product.categorySlug) + '">' + escapeHTML(product.category) +
            " &middot; " + escapeHTML(product.subcategory) + "</p>" +
            "<h2>" + escapeHTML(product.name) + "</h2>" +
            '<span class="stars">' + stars + "</span>" +
            "</div>" + price + "</div>" +
            "</article>";
    }

    function render() {
        if (loading) {
            grid.innerHTML = '<div class="loading">Loading products...</div>';
            return;
        }
        const matches = matchingProducts();
        const shown = matches.slice(0, state.shown);

        grid.innerHTML = shown.map(cardHTML).join("");

        if (countEl) {
            countEl.textContent = matches.length + (matches.length === 1 ? " product" : " products");
        }

        if (emptyState) emptyState.hidden = matches.length !== 0;
        if (loadMoreWrap) loadMoreWrap.hidden = matches.length === 0 || state.shown >= matches.length;

        chips.forEach((chip) => {
            chip.classList.toggle("category-active", chipCategory(chip) === state.category);
        });

        syncCategoryInputs();

        const navLabel = NAV_LABEL_FOR_CATEGORY[state.category];
        navLinks.forEach((link) => {
            if (navLabel) {
                link.classList.toggle("active-nav", link.textContent.trim() === navLabel);
            }
        });
        // The dropdown no longer has an "All Products" item, so the Shop
        // trigger itself carries the active state on unfiltered shop views.
        if (shopTrigger) shopTrigger.classList.toggle("active-nav", !navLabel);
    }

    function syncCategoryInputs() {
        categoryInputs.forEach((input) => {
            input.checked = input.value === state.category;
        });
        subcategoryInputs.forEach((input) => {
            input.checked = state.subcategories.indexOf(input.value) !== -1;
        });
    }

    function updateUrl() {
        const url = "shop.html" + (state.category ? "?category=" + state.category : "");
        try {
            if (window.history && typeof window.history.replaceState === "function") {
                window.history.replaceState(null, "", url);
            }
        } catch (e) {}
    }

    function setOpen(panel, button, open) {
        if (panel) panel.hidden = !open;
        if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function closeMenus() {
        setOpen(filterPanel, filterButton, false);
        setOpen(sortMenu, sortButton, false);
    }

    function resetFilters() {
        state.category = "";
        state.subcategories = [];
        state.prices = [];
        state.shown = PAGE_SIZE;
        priceInputs.forEach((input) => { input.checked = false; });
        subcategoryInputs.forEach((input) => { input.checked = false; });
    }

    if (filterButton && filterPanel) {
        filterButton.addEventListener("click", () => {
            const willOpen = filterPanel.hidden;
            closeMenus();
            setOpen(filterPanel, filterButton, willOpen);
        });
    }

    if (sortButton && sortMenu) {
        sortButton.addEventListener("click", () => {
            const willOpen = sortMenu.hidden;
            closeMenus();
            setOpen(sortMenu, sortButton, willOpen);
        });
    }

    const applyButton = document.querySelector(".filter-apply");
    if (applyButton) {
        applyButton.addEventListener("click", () => {
            const chosenCategory = categoryInputs.filter((input) => input.checked)[0];
            state.category = chosenCategory ? chosenCategory.value : "";
            state.subcategories = subcategoryInputs.filter((input) => input.checked).map((input) => input.value);
            state.prices = priceInputs.filter((input) => input.checked).map((input) => input.value);
            state.shown = PAGE_SIZE;
            render();
            updateUrl();
            closeMenus();
        });
    }

    const clearButton = document.querySelector(".filter-clear");
    if (clearButton) {
        clearButton.addEventListener("click", () => {
            resetFilters();
            render();
            updateUrl();
            closeMenus();
        });
    }

    if (emptyState) {
        const emptyClear = emptyState.querySelector(".clear-filters");
        if (emptyClear) {
            emptyClear.addEventListener("click", () => {
                resetFilters();
                render();
                updateUrl();
            });
        }
    }

    if (sortMenu) {
        Array.prototype.slice.call(sortMenu.querySelectorAll("button[data-sort]")).forEach((option) => {
            option.addEventListener("click", () => {
                const sort = option.getAttribute("data-sort");
                if (SORT_LABELS[sort]) {
                    state.sort = sort;
                    state.shown = PAGE_SIZE;
                    if (sortLabelEl) sortLabelEl.textContent = SORT_LABELS[sort];
                    render();
                }
                closeMenus();
            });
        });
    }

    if (loadMoreButton) {
        loadMoreButton.addEventListener("click", () => {
            state.shown += PAGE_SIZE;
            render();
        });
    }

    chips.forEach((chip) => {
        chip.addEventListener("click", (event) => {
            event.preventDefault();
            state.category = chipCategory(chip);
            state.subcategories = [];
            state.shown = PAGE_SIZE;
            render();
            updateUrl();
        });
    });

    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || !target.closest) return;
        if (target.closest(".shop-toolbar")) return;
        closeMenus();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenus();
    });

    async function loadProducts() {
        try {
            const params = new URLSearchParams({ active: "true", limit: "100" });
            const res = await fetch("/api/products?" + params.toString());
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.products;
            if (!Array.isArray(list)) throw new Error("unexpected response shape");
            CATALOGUE = list.map(adaptProduct);
        } catch (e) {
            console.error("Failed to load products:", e && e.message ? e.message : e);
            CATALOGUE = [];
        } finally {
            loading = false;
            render();
        }
    }

    loadProducts();
})();