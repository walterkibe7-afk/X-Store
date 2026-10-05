/* =========================
   X ADMIN — CUSTOMERS PAGE
   ========================= */

const CustomersPage = (function () {
    let customers = [];

    async function init() {
        await loadCustomers();
    }

    async function loadCustomers() {
        try {
            customers = await Admin.getCustomers();
            renderTable();
        } catch (error) {
            console.error("Failed to load customers:", error);
            Admin.showToast("Failed to load customers", "error");
        }
    }

    function renderTable() {
        const container = document.getElementById("pageContent");
        if (!container) return;

        if (customers.length === 0) {
            container.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">👥</div>
                            <h3 class="empty-state-title">No customers yet</h3>
                            <p class="empty-state-text">Customers will appear here when they create accounts or place orders.</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

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
                                ${customers.map(c => `
                                    <tr>
                                        <td>${Admin.escapeHtml(c.first_name + " " + c.last_name)}</td>
                                        <td>${Admin.escapeHtml(c.email)}</td>
                                        <td>${c.order_count || 0}</td>
                                        <td>$${Number(c.total_spent || 0).toFixed(2)}</td>
                                        <td>${Admin.formatDate(c.created_at)}</td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    return { init };
})();

if (typeof window !== "undefined") {
    window.CustomersPage = CustomersPage;
}