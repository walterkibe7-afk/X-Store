// =========================
// PRODUCT PAGE
// Fetches single product from API by ID from URL (?id=).
// =========================

(function () {
    // Whole-shilling KES formatting used across the storefront.
    function formatKES(value) {
        const n = Math.round(Number(value) || 0);
        return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function requestedId() {
        const match = /[?&]id=([^&#]*)/.exec(window.location.search || "");
        if (!match) return "";
        try {
            return decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
        } catch (e) {
            return "";
        }
    }

    const id = requestedId();

    const mainImage = document.querySelector(".main-product-image");
    const minusButton = document.querySelector(".quantity-minus");
    const plusButton = document.querySelector(".quantity-plus");
    const quantityElement = document.querySelector(".quantity");
    const addButton = document.querySelector(".product-add");
    const buyNowButton = document.querySelector(".buy-now");

    function escapeHTML(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (char) {
            return { "&": "&", "<": "<", ">": ">", '"': '"', "'": "'" }[char];
        });
    }

    function productUrl(productId) {
        return "product.html?id=" + encodeURIComponent(productId);
    }

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

    if (!id) {
        showNotFound();
        return;
    }

    // Map API product to storefront format
    function adaptProduct(p) {
        const imageClasses = ["image-a", "image-b", "image-c", "image-d", "image-e", "image-f", "image-g", "image-h"];
        const idx = imageClasses.findIndex(c => p.id.includes(c.replace('image-', ''))) % imageClasses.length;
        const imageClass = imageClasses[Math.max(0, idx >= 0 ? idx : 0)];

        return {
            id: p.id,
            name: p.name,
            category: p.category,
            categorySlug: p.category.toLowerCase(),
            subcategory: p.subcategory,
            subcategorySlug: p.subcategory.toLowerCase().replace(/\s+/g, '-'),
            price: p.price,
            oldPrice: p.compare_price,
            badge: p.badge,
            badgeClass: p.badge ? p.badge.toLowerCase().replace(/\s+/g, '-') : '',
            rating: p.rating,
            reviews: p.review_count,
            featured: !!p.featured,
            newest: false,
            image: imageClass,
            description: p.description,
            details: p.details,
            care: '',
            shipping: ''
        };
    }

    async function loadProduct() {
        try {
            console.log("Loading product:", id);
            const res = await fetch("/api/products/" + encodeURIComponent(id));
            console.log("Response status:", res.status);
            if (!res.ok) {
                console.warn("API returned", res.status, "- trying local catalogue");
                const local = (window.PRODUCTS || []).find(p => p.id === id);
                if (local) {
                    renderProduct(adaptProduct(local));
                    return;
                }
                showNotFound();
                return;
            }
            const { product } = await res.json();
            console.log("Product loaded:", product);
            renderProduct(adaptProduct(product));
        } catch (e) {
            console.warn("API unavailable, trying local catalogue:", e);
            const local = (window.PRODUCTS || []).find(p => p.id === id);
            if (local) {
                renderProduct(adaptProduct(local));
                return;
            }
            showNotFound();
        }
    }

    function renderProduct(PRODUCT) {
        document.title = PRODUCT.name + " - Elle";

        var crumb = document.querySelector(".breadcrumb-current");
        if (crumb) crumb.textContent = PRODUCT.name;

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
            price.textContent = formatKES(PRODUCT.price);
            if (PRODUCT.oldPrice) {
                var wasPrice = document.createElement("del");
                wasPrice.textContent = formatKES(PRODUCT.oldPrice);
                price.appendChild(wasPrice);
            }
        }

        var description = document.querySelector(".product-description");
        if (description) description.textContent = PRODUCT.description || "";

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

        // Load related products from API
        loadRelatedProducts(PRODUCT);

        // Quantity, add to cart, buy now
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

        // Thumbnails
        document.querySelectorAll(".thumbnail").forEach(function (thumbnail) {
            thumbnail.addEventListener("click", function () {
                document.querySelectorAll(".thumbnail").forEach(function (item) {
                    item.classList.remove("active");
                });
                thumbnail.classList.add("active");
applyProductImage(PRODUCT);
            });
        });

        // Gallery wishlist heart
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
    }

    function applyProductImage(PRODUCT) {
        if (!mainImage || !PRODUCT) return;
        // Clear all image classes
        ["image-a", "image-b", "image-c", "image-d", "image-e", "image-f", "image-g", "image-h"].forEach(function (cls) {
            mainImage.classList.remove(cls);
            document.querySelectorAll(".thumbnail").forEach(function (thumbnail) {
                thumbnail.classList.remove(cls);
            });
        });
        // Apply current product's image
        if (PRODUCT.image) {
            mainImage.classList.add(PRODUCT.image);
            document.querySelectorAll(".thumbnail").forEach(function (thumbnail) {
                thumbnail.classList.add(PRODUCT.image);
            });
        }
    }

    async function loadRelatedProducts(currentProduct) {
        try {
            const res = await fetch("/api/products?active=true&limit=20");
            const { products } = await res.json();
            const allProducts = products.map(adaptProduct);
            renderRelated(allProducts, currentProduct);
        } catch (e) {
            console.warn("API unavailable, using local catalogue for related:", e);
            const allProducts = (window.PRODUCTS || []).map(adaptProduct);
            renderRelated(allProducts, currentProduct);
        }
    }

    function renderRelated(allProducts, currentProduct) {
        var relatedGrid = document.querySelector(".related-grid");
        if (!relatedGrid) return;

        function relatedProducts() {
            var sameCategory = allProducts.filter(function (item) {
                return item.id !== currentProduct.id && item.categorySlug === currentProduct.categorySlug;
            });
            var others = allProducts.filter(function (item) {
                return item.id !== currentProduct.id && item.categorySlug !== currentProduct.categorySlug;
            });
            return sameCategory.concat(others).slice(0, 4);
        }

        relatedGrid.innerHTML = relatedProducts().map(function (item, index) {
            return '<article class="related-product" data-product-id="' + escapeHTML(item.id) + '">' +
                '<a href="' + escapeHTML(productUrl(item.id)) + '" class="related-image related-image-' + (index + 1) + '">' +
                (item.badge ? "<span>" + escapeHTML(item.badge) + "</span>" : "") +
                '<button class="heart-button" aria-label="Add to wishlist">\u2661</button>' +
                '<button class="related-add" aria-label="Add ' + escapeHTML(item.name) + ' to cart">Add to cart</button>' +
                "</a>" +
                '<div class="related-info"><div><h3>' + escapeHTML(item.name) + "</h3><p>" + escapeHTML(item.category) + "</p></div>" +
                "<strong>" + formatKES(item.price) + "</strong></div>" +
                "</article>";
        }).join("");

        Array.prototype.forEach.call(relatedGrid.querySelectorAll(".related-product"), function (card) {
            var button = card.querySelector(".related-add");
            var related = relatedProducts().find(p => p.id === card.getAttribute("data-product-id"));
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

    loadProduct();
})();