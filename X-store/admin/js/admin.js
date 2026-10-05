/* =========================
   X ADMIN — CORE
   ========================= */

const Admin = (function () {
    const STORAGE_KEY = "xAdminAuth";
    const DEV_CREDENTIALS = { email: "admin@x.com", password: "admin123" };

    let currentUser = null;
    let currentPage = "dashboard";

    const categories = {
        intimate: ["Toys", "Lubricants"],
        wellness: ["Body & Massage", "Gummies", "Self-Care"]
    };

    function init() {
        loadSession();
        setupSidebarToggle();
        setupNavigation();
        updateAuthUI();
    }

    function loadSession() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.token && parsed.expires > Date.now()) {
                    currentUser = parsed.user;
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function saveSession(user, remember) {
        const token = generateToken();
        const expires = remember ? Date.now() + 30 * 24 * 60 * 60 * 1000 : Date.now() + 24 * 60 * 60 * 1000;
        const data = { token, user, expires };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        currentUser = user;
    }

    function clearSession() {
        localStorage.removeItem(STORAGE_KEY);
        currentUser = null;
    }

    function generateToken() {
        return "admin_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    function login(email, password, remember) {
        if (email === DEV_CREDENTIALS.email && password === DEV_CREDENTIALS.password) {
            const user = { id: "admin-1", name: "Admin", email, role: "admin" };
            saveSession(user, remember);
            return { success: true, user };
        }
        return { success: false, error: "Invalid email or password" };
    }

    function logout() {
        clearSession();
        window.location.href = "login.html";
    }

    function requireAuth() {
        if (!currentUser) {
            window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname);
            return false;
        }
        return true;
    }

    function setupSidebarToggle() {
        const toggleBtn = document.getElementById("sidebarToggle");
        const sidebar = document.querySelector(".admin-sidebar");
        const overlay = document.querySelector(".sidebar-overlay");

        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener("click", () => {
                sidebar.classList.toggle("open");
                if (overlay) overlay.classList.toggle("open");
            });
        }

        if (overlay) {
            overlay.addEventListener("click", () => {
                sidebar.classList.remove("open");
                overlay.classList.remove("open");
            });
        }

        document.querySelectorAll(".nav-item").forEach(item => {
            item.addEventListener("click", () => {
                if (window.innerWidth <= 1024) {
                    sidebar.classList.remove("open");
                    if (overlay) overlay.classList.remove("open");
                }
            });
        });
    }

    function setupNavigation() {
        const navItems = document.querySelectorAll(".nav-item[data-page]");
        navItems.forEach(item => {
            item.addEventListener("click", () => {
                const page = item.dataset.page;
                navigateTo(page);
            });
        });
    }

    function navigateTo(page) {
        currentPage = page;
        document.querySelectorAll(".nav-item[data-page]").forEach(item => {
            item.classList.toggle("active", item.dataset.page === page);
        });

        const content = document.getElementById("pageContent");
        if (content) {
            loadPageContent(page, content);
        }

        updatePageTitle(page);
    }

    function updatePageTitle(page) {
        const titles = {
            dashboard: "Dashboard",
            products: "Products",
            orders: "Orders",
            customers: "Customers",
            settings: "Settings"
        };
        const titleEl = document.getElementById("pageTitle");
        if (titleEl) titleEl.textContent = titles[page] || "Dashboard";
    }

    async function loadPageContent(page, container) {
        container.innerHTML = '<div class="loading">Loading...</div>';

        try {
            switch (page) {
                case "dashboard":
                    await loadDashboard(container);
                    break;
                case "products":
                    await loadProductsPage(container);
                    break;
                case "orders":
                    await loadOrdersPage(container);
                    break;
                case "customers":
                    await loadCustomersPage(container);
                    break;
                case "settings":
                    await loadSettingsPage(container);
                    break;
                default:
                    container.innerHTML = '<div class="empty-state"><p>Page not found</p></div>';
            }
        } catch (error) {
            console.error("Failed to load page:", error);
            container.innerHTML = '<div class="empty-state"><p>Failed to load page</p></div>';
        }
    }

    async function loadDashboard(container) {
        const stats = await getDashboardStats();
        const recentOrders = await getRecentOrders(5);

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalProducts}</div>
                    <div class="stat-label">Total Products</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.activeProducts}</div>
                    <div class="stat-label">Active Products</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalOrders}</div>
                    <div class="stat-label">Total Orders</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalCustomers}</div>
                    <div class="stat-label">Total Customers</div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Recent Orders</h2>
                    <a href="#orders" class="btn btn-ghost btn-sm" onclick="Admin.navigateTo('orders')">View All</a>
                </div>
                <div class="card-body">
                    ${renderOrdersTable(recentOrders, true)}
                </div>
            </div>
        `;
    }

    async function loadProductsPage(container) {
        const products = await getProducts();
        container.innerHTML = `
            <div class="search-filter-bar">
                <div class="search-input-wrapper">
                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="search" class="form-input" id="productSearch" placeholder="Search products..." aria-label="Search products">
                </div>
                <div class="filter-group">
                    <select class="form-select filter-select" id="categoryFilter">
                        <option value="">All Categories</option>
                        <option value="intimate">Intimate</option>
                        <option value="wellness">Wellness</option>
                    </select>
                    <select class="form-select filter-select" id="statusFilter">
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
                <a href="product-edit.html" class="btn btn-primary">+ Add Product</a>
            </div>
            <div class="table-container">
                <table class="admin-table" id="productsTable">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Category</th>
                            <th>Price</th>
                            <th>Status</th>
                            <th>Badge</th>
                            <th>Updated</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="productsTableBody">
                        ${renderProductsRows(products)}
                    </tbody>
                </table>
            </div>
        `;

        setupProductFilters();
        setupProductActions();
    }

    async function loadOrdersPage(container) {
        const orders = await getOrders();
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Orders</h2>
                </div>
                <div class="card-body">
                    <div class="table-container">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>Order #</th>
                                    <th>Customer</th>
                                    <th>Items</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderOrdersTable(orders)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    async function loadCustomersPage(container) {
        const customers = await getCustomers();
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Customers</h2>
                </div>
                <div class="card-body">
                    <div class="table-container">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Email</th>
                                    <th>Orders</th>
                                    <th>Total Spent</th>
                                    <th>Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderCustomersTable(customers)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    async function loadSettingsPage(container) {
        const settings = await getSettings();
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Store Settings</h2>
                </div>
                <div class="card-body">
                    <form id="settingsForm" class="settings-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Store Name <span class="required">*</span></label>
                                <input type="text" class="form-input" name="storeName" value="${escapeHtml(settings.storeName)}" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Store Email <span class="required">*</span></label>
                                <input type="email" class="form-input" name="storeEmail" value="${escapeHtml(settings.storeEmail)}" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Currency <span class="required">*</span></label>
                                <select class="form-select" name="currency" required>
                                    <option value="USD" ${settings.currency === "USD" ? "selected" : ""}>USD ($)</option>
                                    <option value="EUR" ${settings.currency === "EUR" ? "selected" : ""}>EUR (€)</option>
                                    <option value="GBP" ${settings.currency === "GBP" ? "selected" : ""}>GBP (£)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Shipping Fee <span class="required">*</span></label>
                                <input type="number" class="form-input" name="shippingFee" value="${settings.shippingFee}" min="0" step="0.01" required>
                            </div>
                        </div>
                        <div class="mt-24">
                            <button type="submit" class="btn btn-primary">Save Settings</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.getElementById("settingsForm").addEventListener("submit", handleSettingsSubmit);
    }

    async function handleSettingsSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const settings = Object.fromEntries(formData);
        await saveSettings(settings);
        showToast("Settings saved successfully");
    }

    function setupProductFilters() {
        const searchInput = document.getElementById("productSearch");
        const categoryFilter = document.getElementById("categoryFilter");
        const statusFilter = document.getElementById("statusFilter");
        const tableBody = document.getElementById("productsTableBody");

        if (!tableBody) return;

        function filterProducts() {
            const search = searchInput?.value.toLowerCase() || "";
            const category = categoryFilter?.value || "";
            const status = statusFilter?.value || "";

            const rows = tableBody.querySelectorAll("tr");
            rows.forEach(row => {
                const name = row.dataset.name?.toLowerCase() || "";
                const cat = row.dataset.category || "";
                const stat = row.dataset.status || "";

                const matchesSearch = !search || name.includes(search);
                const matchesCategory = !category || cat === category;
                const matchesStatus = !status || stat === status;

                row.style.display = (matchesSearch && matchesCategory && matchesStatus) ? "" : "none";
            });
        }

        searchInput?.addEventListener("input", filterProducts);
        categoryFilter?.addEventListener("change", filterProducts);
        statusFilter?.addEventListener("change", filterProducts);
    }

    function setupProductActions() {
        document.querySelectorAll(".action-edit").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                window.location.href = `product-edit.html?id=${id}`;
            });
        });

        document.querySelectorAll(".action-delete").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                confirmDeleteProduct(id, name);
            });
        });
    }

    async function confirmDeleteProduct(id, name) {
        if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

        try {
            await softDeleteProduct(id);
            showToast("Product deactivated");
            await loadProductsPage(document.getElementById("pageContent"));
        } catch (error) {
            console.error("Delete failed:", error);
            showToast("Failed to delete product", "error");
        }
    }

    function renderProductsRows(products) {
        return products.map(p => `
            <tr data-name="${escapeHtml(p.name)}" data-category="${p.categorySlug}" data-status="${p.active ? 'active' : 'inactive'}">
                <td>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <img src="${escapeHtml(p.image_hero || 'https://via.placeholder.com/60')}" alt="" style="width:48px;height:48px;border-radius:6px;object-fit:cover;border:1px solid var(--admin-border);background:var(--admin-bg);">
                        <div>
                            <div style="font-weight:500;">${escapeHtml(p.name)}</div>
                            <div style="font-size:12px;color:var(--admin-text-muted);">${escapeHtml(p.id)}</div>
                        </div>
                    </div>
                </td>
                <td>${formatCategory(p.category)} / ${escapeHtml(p.subcategory)}</td>
                <td>$${p.price.toFixed(2)}</td>
                <td><span class="badge ${p.active ? 'badge-active' : 'badge-inactive'}">${p.active ? 'Active' : 'Inactive'}</span></td>
                <td>${renderBadge(p.badge)}</td>
                <td>${formatDate(p.updated_at)}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-ghost btn-sm action-edit" data-id="${p.id}" aria-label="Edit ${escapeHtml(p.name)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn btn-ghost btn-sm action-delete" data-id="${p.id}" data-name="${escapeHtml(p.name)}" aria-label="Delete ${escapeHtml(p.name)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");
    }

    function renderOrdersTable(orders, dashboard = false) {
        if (!orders.length) {
            return '<div class="empty-state"><div class="empty-state-icon">📦</div><h3 class="empty-state-title">No orders yet</h3><p class="empty-state-text">Orders will appear here when customers make purchases.</p></div>';
        }

        const rows = orders.map(order => `
            <tr>
                <td><strong>#${escapeHtml(order.id)}</strong></td>
                <td>${escapeHtml(order.shipping_name || order.customer_id)}</td>
                <td>${order.item_count || 0} item${(order.item_count || 0) !== 1 ? 's' : ''}</td>
                <td>$${Number(order.total).toFixed(2)}</td>
                <td><span class="badge badge-${order.status}">${capitalize(order.status)}</span></td>
                <td>${formatDate(order.created_at)}</td>
            </tr>
        `).join("");

        return `<table class="admin-table"><thead><tr><th>Order #</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function renderCustomersTable(customers) {
        if (!customers.length) {
            return '<div class="empty-state"><div class="empty-state-icon">👥</div><h3 class="empty-state-title">No customers yet</h3><p class="empty-state-text">Customers will appear here when they create accounts or place orders.</p></div>';
        }

        return customers.map(c => `
            <tr>
                <td>${escapeHtml(c.first_name + " " + c.last_name)}</td>
                <td>${escapeHtml(c.email)}</td>
                <td>${c.order_count || 0}</td>
                <td>$${Number(c.total_spent || 0).toFixed(2)}</td>
                <td>${formatDate(c.created_at)}</td>
            </tr>
        `).join("");
    }

    function renderBadge(badge) {
        if (!badge) return '<span class="text-muted">—</span>';
        const badgeClass = badge.toLowerCase().replace(/\s+/g, "-");
        return `<span class="badge badge-${badgeClass}">${escapeHtml(badge)}</span>`;
    }

    function formatCategory(cat) {
        return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    function formatDate(dateStr) {
        if (!dateStr) return "—";
        try {
            return new Date(dateStr).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric"
            });
        } catch {
            return dateStr;
        }
    }

    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, """)
            .replace(/'/g, "&#039;");
    }

    function showToast(message, type = "success") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 1100;
            padding: 12px 20px; border-radius: var(--admin-radius);
            background: ${type === "success" ? "var(--admin-success)" : "var(--admin-danger)"};
            color: white; font-weight: 500; box-shadow: var(--admin-shadow-hover);
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = "slideOut 0.3s ease forwards";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function updateAuthUI() {
        const userNameEl = document.getElementById("userName");
        if (userNameEl && currentUser) {
            userNameEl.textContent = currentUser.name;
        }
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", logout);
        }
    }

    function getSubcategories(category) {
        return categories[category] || [];
    }

    function validateProduct(data) {
        const errors = {};
        if (!data.name?.trim()) errors.name = "Product name is required";
        if (!data.slug?.trim()) errors.slug = "Slug is required";
        if (!data.category) errors.category = "Category is required";
        if (!data.subcategory) errors.subcategory = "Subcategory is required";
        if (!data.price || data.price < 0) errors.price = "Valid price is required";
        if (data.compare_price !== undefined && data.compare_price < 0) errors.compare_price = "Compare price must be positive";
        if (data.category && data.subcategory && !categories[data.category]?.includes(data.subcategory)) {
            errors.subcategory = "Invalid subcategory for selected category";
        }
        return { valid: Object.keys(errors).length === 0, errors };
    }

    async function apiRequest(path, options = {}) {
        const baseUrl = "/api";
        const headers = {
            "Content-Type": "application/json",
            ...options.headers
        };

        if (currentUser) {
            headers["Authorization"] = `Bearer ${getAuthToken()}`;
        }

        const response = await fetch(baseUrl + path, {
            ...options,
            headers
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: "Request failed" }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    function getAuthToken() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.token && parsed.expires > Date.now()) {
                    return parsed.token;
                }
            }
        } catch (e) {}
        return null;
    }

    function getDevProducts() {
        try {
            const stored = localStorage.getItem("xAdminProducts");
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return [];
    }

    function saveDevProducts(products) {
        localStorage.setItem("xAdminProducts", JSON.stringify(products));
    }

    async function getProducts() {
        try {
            return await apiRequest("/products");
        } catch {
            let products = getDevProducts();
            if (!products.length) {
                products = getDefaultProducts();
                saveDevProducts(products);
            }
            return products;
        }
    }

    async function getProduct(id) {
        try {
            return await apiRequest(`/products/${id}`);
        } catch {
            const products = await getProducts();
            return products.find(p => p.id === id) || null;
        }
    }

    async function createProduct(data) {
        try {
            return await apiRequest("/products", { method: "POST", body: JSON.stringify(data) });
        } catch {
            const products = await getProducts();
            const newProduct = { ...data, id: generateId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            products.unshift(newProduct);
            saveDevProducts(products);
            return newProduct;
        }
    }

    async function updateProduct(id, data) {
        try {
            return await apiRequest(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) });
        } catch {
            const products = await getProducts();
            const index = products.findIndex(p => p.id === id);
            if (index >= 0) {
                products[index] = { ...products[index], ...data, updated_at: new Date().toISOString() };
                saveDevProducts(products);
                return products[index];
            }
            throw new Error("Product not found");
        }
    }

    async function softDeleteProduct(id) {
        try {
            await apiRequest(`/products/${id}`, { method: "DELETE" });
        } catch {
            const products = await getProducts();
            const index = products.findIndex(p => p.id === id);
            if (index >= 0) {
                products[index].active = 0;
                products[index].updated_at = new Date().toISOString();
                saveDevProducts(products);
            }
        }
    }

    async function getOrders() {
        try {
            return await apiRequest("/orders");
        } catch {
            return getDevOrders();
        }
    }

    async function getRecentOrders(limit) {
        const orders = await getOrders();
        return orders.slice(0, limit);
    }

    async function getOrdersStats() {
        const orders = await getOrders();
        return orders.length;
    }

    function getDevOrders() {
        try {
            const stored = localStorage.getItem("xAdminOrders");
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return [];
    }

    async function getCustomers() {
        try {
            return await apiRequest("/customers");
        } catch {
            return getDevCustomers();
        }
    }

    function getDevCustomers() {
        try {
            const stored = localStorage.getItem("xAdminCustomers");
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return [];
    }

    async function getDashboardStats() {
        const [products, orders, customers] = await Promise.all([getProducts(), getOrders(), getCustomers()]);
        return {
            totalProducts: products.length,
            activeProducts: products.filter(p => p.active).length,
            totalOrders: orders.length,
            totalCustomers: customers.length
        };
    }

    async function getSettings() {
        try {
            return await apiRequest("/settings");
        } catch {
            return {
                storeName: "X",
                storeEmail: "hello@x.com",
                currency: "USD",
                shippingFee: 5
            };
        }
    }

    async function saveSettings(settings) {
        try {
            await apiRequest("/settings", { method: "PUT", body: JSON.stringify(settings) });
        } catch {
            localStorage.setItem("xAdminSettings", JSON.stringify(settings));
        }
    }

    function getDefaultProducts() {
        return [
            { id: "silk-touch", name: "Silk Touch", slug: "silk-touch", category: "Intimate", categorySlug: "intimate", subcategory: "Toys", price: 59, compare_price: null, description: "Thoughtfully designed for a more personal kind of self-care.", details: "Premium materials, compact design and a smooth easy-to-clean surface.", image_hero: "https://via.placeholder.com/600x600", image_lifestyle: "", image_detail: "", badge: "BEST SELLER", rating: 5, review_count: 42, featured: 1, active: 1, created_at: "2024-01-15T10:00:00Z", updated_at: "2024-01-15T10:00:00Z" },
            { id: "after-dark-oil", name: "After Dark Oil", slug: "after-dark-oil", category: "Wellness", categorySlug: "wellness", subcategory: "Body & Massage", price: 28, compare_price: null, description: "A rich, fast-absorbing body oil for after-hours rituals.", details: "A lightweight oil that sinks in fast, with a warm cedar and vetiver scent.", image_hero: "https://via.placeholder.com/600x600", image_lifestyle: "", image_detail: "", badge: null, rating: 5, review_count: 28, featured: 0, active: 1, created_at: "2024-01-20T10:00:00Z", updated_at: "2024-01-20T10:00:00Z" },
            { id: "midnight-gummies", name: "Midnight Gummies", slug: "midnight-gummies", category: "Wellness", categorySlug: "wellness", subcategory: "Gummies", price: 24, compare_price: null, description: "A gentle nightly gummy to help you unwind.", details: "A soft berry-flavoured gummy taken in the evening.", image_hero: "https://via.placeholder.com/600x600", image_lifestyle: "", image_detail: "", badge: "NEW", rating: 5, review_count: 19, featured: 0, active: 1, created_at: "2024-02-01T10:00:00Z", updated_at: "2024-02-01T10:00:00Z" },
            { id: "velvet-mini", name: "Velvet Mini", slug: "velvet-mini", category: "Intimate", categorySlug: "intimate", subcategory: "Toys", price: 45, compare_price: null, description: "Compact, discreet and quietly powerful.", details: "A compact size with a soft-touch finish.", image_hero: "https://via.placeholder.com/600x600", image_lifestyle: "", image_detail: "", badge: null, rating: 5, review_count: 36, featured: 1, active: 1, created_at: "2024-01-25T10:00:00Z", updated_at: "2024-01-25T10:00:00Z" },
            { id: "slow-down-oil", name: "Slow Down Oil", slug: "slow-down-oil", category: "Wellness", categorySlug: "wellness", subcategory: "Body & Massage", price: 22, compare_price: 30, description: "Warm, slow-burning massage oil with a soft finish.", details: "A slow-burning massage oil that warms between the palms.", image_hero: "https://via.placeholder.com/600x600", image_lifestyle: "", image_detail: "", badge: "SALE", rating: 5, review_count: 51, featured: 0, active: 1, created_at: "2024-01-10T10:00:00Z", updated_at: "2024-01-10T10:00:00Z" },
            { id: "luna", name: "Luna", slug: "luna", category: "Intimate", categorySlug: "intimate", subcategory: "Toys", price: 64, compare_price: null, description: "Sculpted, smooth and made to be kept on the nightstand.", details: "A weighted, sculpted form with a smooth surface.", image_hero: "https://via.placeholder.com/600x600", image_lifestyle: "", image_detail: "", badge: null, rating: 5, review_count: 17, featured: 1, active: 1, created_at: "2024-02-10T10:00:00Z", updated_at: "2024-02-10T10:00:00Z" }
        ];
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 10);
    }

    return {
        init,
        login,
        logout,
        requireAuth,
        navigateTo,
        getSubcategories,
        validateProduct,
        getProducts,
        getProduct,
        createProduct,
        updateProduct,
        softDeleteProduct,
        getOrders,
        getCustomers,
        getSettings,
        showToast,
        categories,
        escapeHtml,
        formatDate,
        currentUser: () => currentUser
    };
})();

if (typeof window !== "undefined") {
    window.Admin = Admin;

    document.addEventListener("DOMContentLoaded", () => {
        Admin.init();
    });

    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
        .loading { padding: 48px; text-align: center; color: var(--admin-text-muted); }
    `;
    document.head.appendChild(style);
}