/* =========================
   X ADMIN — PRODUCT EDIT PAGE
   ========================= */

const ProductEdit = (function () {
    let isEditing = false;
    let productId = null;

    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        productId = urlParams.get("id");
        isEditing = !!productId;

        updatePageTitle();
        setupCategorySubcategory();
        setupImagePreviews();
        setupFormSubmit();

        if (isEditing) {
            loadProduct(productId);
        } else {
            generateSlugFromName();
        }
    }

    function updatePageTitle() {
        const titleEl = document.getElementById("pageTitle");
        if (titleEl) {
            titleEl.textContent = isEditing ? "Edit Product" : "Add Product";
        }
    }

    function setupCategorySubcategory() {
        const categorySelect = document.getElementById("category");
        const subcategorySelect = document.getElementById("subcategory");

        if (!categorySelect || !subcategorySelect) return;

        categorySelect.addEventListener("change", () => {
            const category = categorySelect.value;
            const subcategories = Admin.getSubcategories(category);

            subcategorySelect.innerHTML = '<option value="">Select subcategory</option>';
            subcategories.forEach(sub => {
                const option = document.createElement("option");
                option.value = sub;
                option.textContent = sub;
                subcategorySelect.appendChild(option);
            });

            subcategorySelect.disabled = !category;
        });
    }

    function setupImagePreviews() {
        const imageFields = [
            { input: "image_hero", preview: "heroPreview" },
            { input: "image_lifestyle", preview: "lifestylePreview" },
            { input: "image_detail", preview: "detailPreview" }
        ];

        imageFields.forEach(({ input, preview }) => {
            const inputEl = document.getElementById(input);
            const previewEl = document.getElementById(preview);

            if (inputEl && previewEl) {
                inputEl.addEventListener("input", debounce(() => {
                    updateImagePreview(inputEl.value, previewEl);
                }, 300));

                if (inputEl.value) {
                    updateImagePreview(inputEl.value, previewEl);
                }
            }
        });
    }

    function updateImagePreview(url, container) {
        if (!url.trim()) {
            container.innerHTML = "";
            return;
        }

        const img = document.createElement("img");
        img.src = url;
        img.alt = "Preview";
        img.className = "image-preview";
        img.style.maxWidth = "200px";

        img.onerror = () => {
            container.innerHTML = '<div class="image-preview-placeholder">Invalid image URL</div>';
        };

        container.innerHTML = "";
        container.appendChild(img);
    }

    function generateSlugFromName() {
        const nameInput = document.getElementById("name");
        const slugInput = document.getElementById("slug");

        if (nameInput && slugInput) {
            nameInput.addEventListener("input", () => {
                if (!slugInput.dataset.manuallyEdited) {
                    slugInput.value = slugify(nameInput.value);
                }
            });

            slugInput.addEventListener("input", () => {
                slugInput.dataset.manuallyEdited = "true";
            });
        }
    }

    function slugify(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-");
    }

    async function loadProduct(id) {
        try {
            const product = await Admin.getProduct(id);
            if (!product) {
                Admin.showToast("Product not found", "error");
                setTimeout(() => window.location.href = "products.html", 1500);
                return;
            }
            populateForm(product);
        } catch (error) {
            console.error("Failed to load product:", error);
            Admin.showToast("Failed to load product", "error");
        }
    }

    function populateForm(product) {
        const fields = {
            name: "name",
            slug: "slug",
            category: "category",
            subcategory: "subcategory",
            price: "price",
            compare_price: "compare_price",
            badge: "badge",
            description: "description",
            details: "details",
            image_hero: "image_hero",
            image_lifestyle: "image_lifestyle",
            image_detail: "image_detail",
            rating: "rating",
            review_count: "review_count",
            featured: "featured",
            active: "active"
        };

        Object.entries(fields).forEach(([dataKey, inputId]) => {
            const input = document.getElementById(inputId);
            if (!input) return;

            let value = product[dataKey];

            if (input.type === "checkbox") {
                input.checked = Boolean(value);
            } else if (input.tagName === "SELECT") {
                input.value = value || "";
                if (inputId === "subcategory") {
                    const category = product.categorySlug || product.category?.toLowerCase();
                    if (category) {
                        const subcategories = Admin.getSubcategories(category);
                        input.innerHTML = '<option value="">Select subcategory</option>';
                        subcategories.forEach(sub => {
                            const option = document.createElement("option");
                            option.value = sub;
                            option.textContent = sub;
                            option.selected = sub === value;
                            input.appendChild(option);
                        });
                    }
                    input.disabled = false;
                }
            } else {
                input.value = value !== null && value !== undefined ? value : "";
            }
        });

        document.getElementById("slug").dataset.manuallyEdited = "true";
        updateImagePreview(product.image_hero || "", document.getElementById("heroPreview"));
        updateImagePreview(product.image_lifestyle || "", document.getElementById("lifestylePreview"));
        updateImagePreview(product.image_detail || "", document.getElementById("detailPreview"));
    }

    function setupFormSubmit() {
        const form = document.getElementById("productForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = {};

            formData.forEach((value, key) => {
                if (key === "featured" || key === "active") {
                    data[key] = formData.has(key) ? 1 : 0;
                } else if (key === "price" || key === "compare_price" || key === "rating" || key === "review_count") {
                    data[key] = value ? parseFloat(value) : (key === "compare_price" ? null : 0);
                } else {
                    data[key] = value || (key === "compare_price" ? null : "");
                }
            });

            const validation = Admin.validateProduct(data);
            if (!validation.valid) {
                showValidationErrors(validation.errors);
                return;
            }

            clearValidationErrors();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = isEditing ? "Saving..." : "Creating...";

            try {
                let result;
                if (isEditing) {
                    result = await Admin.updateProduct(productId, data);
                    Admin.showToast("Product updated successfully");
                } else {
                    result = await Admin.createProduct(data);
                    Admin.showToast("Product created successfully");
                }

                setTimeout(() => {
                    window.location.href = "products.html";
                }, 800);
            } catch (error) {
                console.error("Save failed:", error);
                Admin.showToast(isEditing ? "Failed to update product" : "Failed to create product", "error");
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    function showValidationErrors(errors) {
        clearValidationErrors();

        Object.entries(errors).forEach(([field, message]) => {
            const input = document.getElementById(field);
            if (!input) return;

            input.style.borderColor = "var(--admin-danger)";

            const errorEl = document.createElement("p");
            errorEl.className = "form-error";
            errorEl.textContent = message;
            input.parentNode.appendChild(errorEl);
        });

        const firstError = Object.keys(errors)[0];
        const firstInput = document.getElementById(firstError);
        if (firstInput) {
            firstInput.focus();
            firstInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    function clearValidationErrors() {
        document.querySelectorAll(".form-error").forEach(el => el.remove());
        document.querySelectorAll(".form-input, .form-select, .form-textarea").forEach(el => {
            el.style.borderColor = "";
        });
    }

    function debounce(fn, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    return { init };
})();

if (typeof window !== "undefined") {
    window.ProductEdit = ProductEdit;
}