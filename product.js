// =========================
// PRODUCT PAGE
// One product.html serves every product. The id in the URL (?id=) says which
// one, and everything on the page -- name, category, rating, price, image,
// description, the accordion copy and the related rail -- is read from the
// shared catalogue (products.js) rather than being written out here.
// =========================

(function () {
    const CATALOGUE = window.PRODUCTS || [];

    // ---- which product was asked for? -----------------------------------------

    function requestedId() {
        const match = /[?&]id=([^&#]*)/.exec(window.location.search || "");
        if (!match) return "";
        try {
            return decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
        } catch (e) {
            return "";
        }
    }

    function findProduct(id) {
        for (let i = 0; i < CATALOGUE.length; i++) {
            if (CATALOGUE[i].id === id) return CATALOGUE[i];
        }
        return null;
    }

    const id = requestedId();
    const PRODUCT = id ? findProduct(id) : null;

    // ---- shared bits ----------------------------------------------------------

    const mainImage = document.querySelector(".main-product-image");
    const minusButton = document.querySelector(".quantity-minus");
    const plusButton = document.querySelector(".quantity-plus");
    const quantityElement = document.querySelector(".quantity");
    const addButton = document.querySelector(".product-add");
    const buyNowButton = document.querySelector(".buy-now");

    function escapeHTML(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (char) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
        });
    }

    function productUrl(productId) {
        return "product.html?id=" + encodeURIComponent(productId);
    }

    // ---- not found ------------------------------------------------------------
    //
    // A bad or missing id must never quietly show some other product, so the
    // real product page is taken off screen and the visitor is offered the shop.

    function showNotFound() {
        try {
            document.title = "Product not found - X";
        } catch (e) {}

        var crumb = document.querySelector(".breadcrumb-current");
        if (crumb) crumb.textContent = "Product not found";

        [".product-main", ".why-section", ".reviews-section", ".related-section", ".product-quiz"].forEach(function (selector) {
            var section = document.querySelector(selector);
            if (section) section.hidden = true;
        });

        var notFound = document.querySelector(".product-not-found");
        if (notFound) notFound.hidden = false;
    }

    if (!PRODUCT) {
        showNotFound();
        return;
    }

    // ---- render the product ---------------------------------------------------

    document.title = PRODUCT.name + " - X";

    var crumb = document.querySelector(".breadcrumb-current");
    if (crumb) crumb.textContent = PRODUCT.name;

    // The category label carries the product's primary category plus its
    // product type, so the page says "INTIMATE · TOYS" rather than just the
    // broad parent. The cat-* class is what tints the label per category.
    var category = document.querySelector(".product-category");
    if (category) {
        var categoryLabel = String(PRODUCT.category || "").toUpperCase();
        if (PRODUCT.subcategory) categoryLabel += " \u00B7 " + String(PRODUCT.subcategory).toUpperCase();
        category.textContent = categoryLabel;
        if (PRODUCT.categorySlug) {
            category.classList.add("cat-" + PRODUCT.categorySlug);
            var productInfo = document.querySelector(".product-info");
            if (productInfo) productInfo.classList.add("cat-" + PRODUCT.categorySlug);
        }
    }

    var title = document.querySelector(".product-info h1");
    if (title) title.textContent = PRODUCT.name;

    var stars = document.querySelector(".product-rating .stars");
    if (stars) {
        stars.textContent = new Array(Number(PRODUCT.rating || 0) + 1).join("\u2605");
    }

    var reviews = document.querySelector(".product-rating a");
    if (reviews) {
        reviews.textContent = PRODUCT.reviews + (Number(PRODUCT.reviews) === 1 ? " review" : " reviews");
    }

    var price = document.querySelector(".product-price");
    if (price) {
        price.textContent = "$" + PRODUCT.price;
        if (PRODUCT.oldPrice) {
            var wasPrice = document.createElement("del");
            wasPrice.textContent = "$" + PRODUCT.oldPrice;
            price.appendChild(wasPrice);
        }
    }

    var description = document.querySelector(".product-description");
    if (description) description.textContent = PRODUCT.description || "";

    // The catalogue stores the image as a CSS class, painted by this page's own
    // .main-product-image.image-* rules.
    applyProductImage();

    var badge = document.querySelector(".main-product-image .product-badge");
    if (badge) {
        if (PRODUCT.badge) {
            badge.textContent = PRODUCT.badge;
            if (PRODUCT.badgeClass) badge.classList.add(PRODUCT.badgeClass);
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
    }

    var accordions = [
        [".accordion-description", PRODUCT.description],
        [".accordion-details", PRODUCT.details],
        [".accordion-care", PRODUCT.care],
        [".accordion-shipping", PRODUCT.shipping]
    ];
    accordions.forEach(function (pair) {
        var target = document.querySelector(pair[0]);
        if (target) target.textContent = pair[1] || "";
    });

    // ---- related products, from the same catalogue ---------------------------

    function relatedProducts() {
        var sameCategory = CATALOGUE.filter(function (item) {
            return item.id !== PRODUCT.id && item.categorySlug === PRODUCT.categorySlug;
        });
        var others = CATALOGUE.filter(function (item) {
            return item.id !== PRODUCT.id && item.categorySlug !== PRODUCT.categorySlug;
        });
        return sameCategory.concat(others).slice(0, 4);
    }

    var relatedGrid = document.querySelector(".related-grid");

    if (relatedGrid) {
        relatedGrid.innerHTML = relatedProducts().map(function (item, index) {
            return '<article class="related-product" data-product-id="' + escapeHTML(item.id) + '">' +
                '<a href="' + escapeHTML(productUrl(item.id)) + '" class="related-image related-image-' + (index + 1) + '">' +
                (item.badge ? "<span>" + escapeHTML(item.badge) + "</span>" : "") +
                '<button class="heart-button" aria-label="Add to wishlist">\u2661</button>' +
                '<button class="related-add" aria-label="Add ' + escapeHTML(item.name) + ' to cart">Add to cart</button>' +
                "</a>" +
                '<div class="related-info"><div><h3>' + escapeHTML(item.name) + "</h3><p>" + escapeHTML(item.category) + "</p></div>" +
                "<strong>$" + item.price + "</strong></div>" +
                "</article>";
        }).join("");

        // The add button reads the product back out of the catalogue by id, so it
        // can never invent a product the shop does not know about.
        Array.prototype.forEach.call(relatedGrid.querySelectorAll(".related-product"), function (card) {
            var button = card.querySelector(".related-add");
            var related = findProduct(card.getAttribute("data-product-id"));
            if (!button || !related) return;

            button.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                CartStore.add(related, 1);
                CartStore.syncBadges();
                button.textContent = "Added \u2713";
                setTimeout(function () {
                    button.textContent = "Add to cart";
                }, 1200);
            });
        });
    }

    // ---- quantity, add to cart and buy now ------------------------------------
    //
    // Both buttons act on PRODUCT, the product actually on screen.

    const PRODUCT_PRICE = PRODUCT.price;
    let quantity = 1;

    function updateQuantity() {
        if (quantityElement) quantityElement.textContent = quantity;
        if (addButton) addButton.textContent = "Add to cart - $" + (PRODUCT_PRICE * quantity);
        if (buyNowButton) buyNowButton.textContent = "Buy now - $" + (PRODUCT_PRICE * quantity);
    }

    function commitProductToCart() {
        CartStore.add(PRODUCT, quantity);
        CartStore.syncBadges();
    }

    if (plusButton && minusButton) {
        plusButton.addEventListener("click", function () {
            quantity++;
            updateQuantity();
        });

        minusButton.addEventListener("click", function () {
            if (quantity > 1) {
                quantity--;
                updateQuantity();
            }
        });
    }

    if (addButton) {
        addButton.addEventListener("click", function () {
            commitProductToCart();
            addButton.textContent = "Added to cart \u2713";
            setTimeout(updateQuantity, 1500);
        });
    }

    // Buy now goes straight to checkout, but only for signed-in shoppers.
    function isLoggedIn() {
        try {
            return localStorage.getItem("xLoggedIn") === "true";
        } catch (e) {
            return false;
        }
    }

    if (buyNowButton) {
        buyNowButton.addEventListener("click", function () {
            commitProductToCart();

            if (!isLoggedIn()) {
                try {
                    localStorage.setItem("xCheckoutRedirect", "checkout.html");
                } catch (e) {}
                window.location.href = "login.html";
                return;
            }

            try {
                localStorage.removeItem("xCheckoutRedirect");
            } catch (e) {}
            window.location.href = "checkout.html";
        });
    }

    // ---- thumbnails -----------------------------------------------------------
    //
    // The catalogue carries one image per product, so there is no second angle to
    // show. Clicking a thumbnail marks it active and keeps the gallery on the
    // product's own image rather than swapping in an unrelated colour.

function applyProductImage() {
    if (!PRODUCT.image) return;
    CATALOGUE.forEach(function (item) {
        if (!item.image) return;
        if (mainImage) {
            mainImage.style.background = "";
            mainImage.classList.remove(item.image);
        }
        // Every thumbnail shows this product's image; there are no other
        // images in the catalogue to switch between.
        document.querySelectorAll(".thumbnail").forEach(function (thumbnail) {
            thumbnail.style.background = "";
            thumbnail.classList.remove(item.image);
        });
    });
    if (mainImage) mainImage.classList.add(PRODUCT.image);
    document.querySelectorAll(".thumbnail").forEach(function (thumbnail) {
        thumbnail.classList.add(PRODUCT.image);
    });
}

    document.querySelectorAll(".thumbnail").forEach(function (thumbnail) {
        thumbnail.addEventListener("click", function () {
            document.querySelectorAll(".thumbnail").forEach(function (item) {
                item.classList.remove("active");
            });
            thumbnail.classList.add("active");
            applyProductImage();
        });
    });

    // ---- gallery wishlist heart ----------------------------------------------

    const galleryHeart = document.querySelector(".gallery-heart");
    if (galleryHeart) {
        galleryHeart.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            galleryHeart.classList.toggle("liked");
            const liked = galleryHeart.classList.contains("liked");
            galleryHeart.textContent = liked ? "\u2665" : "\u2661";
            galleryHeart.setAttribute("aria-pressed", liked ? "true" : "false");
        });
    }

    updateQuantity();
})();