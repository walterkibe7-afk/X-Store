/* =========================
   X ADMIN — ORDERS PAGE
   ========================= */

const OrdersPage = (function () {
    let orders = [];

    async function init() {
        await loadOrders();
        setupEventListeners();
    }

    async function loadOrders() {
        try {
            orders = await Admin.getOrders();
            renderTable();
        } catch (error) {
            console.error("Failed to load orders:", error);
            Admin.showToast("Failed to load orders", "error");
        }
    }

    function setupEventListeners() {
        // Future: add search/filter for orders
    }

    function renderTable() {
        const container = document.getElementById("pageContent");
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">📦</div>
                            <h3 class="empty-state-title">No orders yet</h3>
                            <p class="empty-state-text">Orders will appear here when customers make purchases.</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

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
                                ${orders.map(order => `
                                    <tr>
                                        <td><strong>#${Admin.escapeHtml(order.id)}</strong></td>
                                        <td>${Admin.escapeHtml(order.shipping_name || order.customer_id)}</td>
                                        <td>${order.item_count || 0} item${(order.item_count || 0) !== 1 ? 's' : ''}</td>
                                        <td>$${Number(order.total).toFixed(2)}</td>
                                        <td><span class="badge badge-${order.status}">${capitalize(order.status)}</span></td>
                                        <td>${Admin.formatDate(order.created_at)}</td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    return { init };
})();

if (typeof window !== "undefined") {
    window.OrdersPage = OrdersPage;
}