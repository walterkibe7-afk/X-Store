// =========================
// SHOP PAGE
// The grid, the Filter drawer, the Sort menu and Load more are all driven from
// the shared catalogue (products.js), so the toolbar controls really do change
// what is on screen. ?category= still works, because the category chips and the
// global navbar's Wellness / Gifts links point at real URLs.
// =========================

(function () {
    const grid = document.querySelector(".shop-grid");
    if (!grid) return;

    const CATALOGUE = window.PRODUCTS || [];

    // How many cards a single "page" of the grid holds.
    const PAGE_SIZE = 4;

    const chips = Array.prototype.slice.call(document.querySelectorAll(".shop-categories a"));
    const countEl = document.querySelector(".shop-toolbar > p");
    const emptyState = document.querySelector(".shop-empty-state");
    const navLinks = document.querySelectorAll(".nav-links a");

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

    // The categories the chips link to. An unknown slug falls back to
    // "everything" rather than showing a broken, empty page.
    // There are only two primary categories; subcategories are filtered from
    // the drawer instead, under their own parent.
    const KNOWN_CATEGORIES = ["", "intimate", "wellness"];

    // Which nav item should read as "current" for a given category.
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

    // ---- state ----------------------------------------------------------------

    const state = {
        category: categoryFromSearch(window.location.search),
        subcategories: [],
        prices: [],
        sort: "featured",
        shown: PAGE_SIZE
    };

    // ---- filtering / sorting --------------------------------------------------

    function matchesCategory(product) {
        if (state.category && product.categorySlug !== state.category) return false;
        // No chosen subcategory means "every product type inside this category".
        if (state.subcategories.length && state.subcategories.indexOf(product.subcategorySlug) === -1) return false;
        return true;
    }

    function matchesPrice(product) {
        if (!state.prices.length) return true;
        return state.prices.some((band) => {
            if (band === "under-30") return product.price < 30;
            if (band === "30-50") return product.price >= 30 && product.price <= 50;
            if (band === "over-50") return product.price > 50;
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

    // ---- rendering ------------------------------------------------------------

    function escapeHTML(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function cardHTML(product) {
        const badge = product.badge
            ? '<span class="product-badge' + (product.badgeClass ? " " + product.badgeClass : "") + '">' + escapeHTML(product.badge) + "</span>"
            : "";

        const stars = new Array(product.rating + 1).join("&#9733;") + " <small>(" + product.reviews + ")</small>";

        const price = product.oldPrice
            ? "<div><strong>$" + product.price + "</strong><del>$" + product.oldPrice + "</del></div>"
            : "<strong>$" + product.price + "</strong>";

        // The data-* attributes let the shared quick-add (script.js) add the exact
        // product without having to guess anything from the markup.
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
        const matches = matchingProducts();
        const shown = matches.slice(0, state.shown);

        grid.innerHTML = shown.map(cardHTML).join("");

        // The count reports everything that matches, not just the current page.
        if (countEl) {
            countEl.textContent = matches.length + (matches.length === 1 ? " product" : " products");
        }

        if (emptyState) emptyState.hidden = matches.length !== 0;
        if (loadMoreWrap) loadMoreWrap.hidden = matches.length === 0 || state.shown >= matches.length;

        // 1. Select the matching chip.
        chips.forEach((chip) => {
            chip.classList.toggle("category-active", chipCategory(chip) === state.category);
        });

        // 2. Keep the drawer's radio buttons honest after a chip click.
        syncCategoryInputs();

        // 3. Move the navbar's active underline onto the category that is open.
        const navLabel = NAV_LABEL_FOR_CATEGORY[state.category];
        navLinks.forEach((link) => {
            if (navLabel) {
                link.classList.toggle("active-nav", link.textContent.trim() === navLabel);
            } else if (link.textContent.trim() === "Shop") {
                link.classList.add("active-nav");
            }
        });
    }

    function syncCategoryInputs() {
        categoryInputs.forEach((input) => {
            input.checked = input.value === state.category;
        });
        subcategoryInputs.forEach((input) => {
            input.checked = state.subcategories.indexOf(input.value) !== -1;
        });
    }

    // Keep the address bar shareable without reloading the page. Only the
    // primary category goes in the URL; subcategories are a drawer-level view.
    function updateUrl() {
        const url = "shop.html" + (state.category ? "?category=" + state.category : "");
        try {
            if (window.history && typeof window.history.replaceState === "function") {
                window.history.replaceState(null, "", url);
            }
        } catch (e) {}
    }

    // ---- the toolbar -----------------------------------------------------------

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
        priceInputs.forEach((input) => {
            input.checked = false;
        });
        subcategoryInputs.forEach((input) => {
            input.checked = false;
        });
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

    // The empty state offers the same escape hatch.
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

    // Category chips filter in place instead of reloading the page.
    chips.forEach((chip) => {
        chip.addEventListener("click", (event) => {
            event.preventDefault();
            state.category = chipCategory(chip);
            // A chip is a primary-category view, so it starts with no
            // subcategory narrowing rather than keeping the drawer's last pick.
            state.subcategories = [];
            state.shown = PAGE_SIZE;
            render();
            updateUrl();
        });
    });

    // Clicking anywhere else closes the drawer and the sort menu.
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || !target.closest) return;
        if (target.closest(".shop-toolbar")) return;
        closeMenus();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenus();
    });

    render();
})();