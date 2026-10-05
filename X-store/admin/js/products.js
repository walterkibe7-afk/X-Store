/* =========================
   X ADMIN — PRODUCTS PAGE
   ========================= */

const ProductsPage = (function () {
    let products = [];
    let filteredProducts = [];

    async function init() {
        await loadProducts();
        setupEventListeners();
    }

    async function loadProducts() {
        try {
            products = await Admin.getProducts();
            filteredProducts = [...products];
            renderTable();
        } catch (error) {
            console.error("Failed to load products:", error);
            Admin.showToast("Failed to load products", "error");
        }
    }

    function setupEventListeners() {
        const searchInput = document.getElementById("productSearch");
        const categoryFilter = document.getElementById("categoryFilter");
        const statusFilter = document.getElementById("statusFilter");

        if (searchInput) {
            searchInput.addEventListener("input", debounce(filterTable, 150));
        }
        if (categoryFilter) {
            categoryFilter.addEventListener("change", filterTable);
        }
        if (statusFilter) {
            statusFilter.addEventListener("change", filterTable);
        }
    }

    function filterTable() {
        const search = document.getElementById("productSearch")?.value.toLowerCase() || "";
        const category = document.getElementById("categoryFilter")?.value || "";
        const status = document.getElementById("statusFilter")?.value || "";

        filteredProducts = products.filter(p => {
            const matchesSearch = !search ||
                p.name.toLowerCase().includes(search) ||
                p.id.toLowerCase().includes(search) ||
                p.category.toLowerCase().includes(search) ||
                p.subcategory.toLowerCase().includes(search);
            const matchesCategory = !category || p.categorySlug === category;
            const matchesStatus = !status || (status === "active" ? p.active : !p.active);
            return matchesSearch && matchesCategory && matchesStatus;
        });

        renderTable();
    }

    function renderTable() {
        const tbody = document.getElementById("productsTableBody");
        if (!tbody) return;

        if (filteredProducts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state" style="padding:48px;">
                        <div class="empty-state-icon">📦</div>
                        <h3 class="empty-state-title">No products found</h3>
                        <p class="empty-state-text">${products.length === 0 ? "Add your first product to get started." : "Try adjusting your search or filters."}</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filteredProducts.map(p => `
            <tr data-name="${Admin.escapeHtml(p.name)}" data-category="${p.categorySlug}" data-status="${p.active ? 'active' : 'inactive'}">
                <td>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <img src="${Admin.escapeHtml(p.image_hero || 'https://via.placeholder.com/60')}" alt="" style="width:48px;height:48px;border-radius:6px;object-fit:cover;border:1px solid var(--admin-border);background:var(--admin-bg);">
                        <div>
                            <div style="font-weight:500;">${Admin.escapeHtml(p.name)}</div>
                            <div style="font-size:12px;color:var(--admin-text-muted);">${Admin.escapeHtml(p.id)}</div>
                        </div>
                    </div>
                </td>
                <td>${formatCategory(p.category)} / ${Admin.escapeHtml(p.subcategory)}</td>
                <td>$${Number(p.price).toFixed(2)}</td>
                <td><span class="badge ${p.active ? 'badge-active' : 'badge-inactive'}">${p.active ? 'Active' : 'Inactive'}</span></td>
                <td>${renderBadge(p.badge)}</td>
                <td>${Admin.formatDate(p.updated_at)}</td>
                <td>
                    <div class="table-actions">
                        <a href="product-edit.html?id=${p.id}" class="btn btn-ghost btn-sm" aria-label="Edit ${Admin.escapeHtml(p.name)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </a>
                        <button class="btn btn-ghost btn-sm action-delete" data-id="${p.id}" data-name="${Admin.escapeHtml(p.name)}" aria-label="Delete ${Admin.escapeHtml(p.name)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");

        setupRowActions();
    }

    function setupRowActions() {
        document.querySelectorAll(".action-delete").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                if (!confirm(`Are you sure you want to deactivate "${name}"?`)) return;

                try {
                    await Admin.softDeleteProduct(id);
                    Admin.showToast("Product deactivated");
                    await loadProducts();
                } catch (error) {
                    console.error("Delete failed:", error);
                    Admin.showToast("Failed to deactivate product", "error");
                }
            });
        });
    }

    function renderBadge(badge) {
        if (!badge) return '<span class="text-muted">—</span>';
        const badgeClass = badge.toLowerCase().replace(/\s+/g, "-");
        return `<span class="badge badge-${badgeClass}">${Admin.escapeHtml(badge)}</span>`;
    }

    function formatCategory(cat) {
        return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
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
    window.ProductsPage = ProductsPage;
}