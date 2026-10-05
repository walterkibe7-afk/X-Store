/* =========================
   X ADMIN — SETTINGS PAGE
   ========================= */

const SettingsPage = (function () {
    async function init() {
        await loadSettings();
        setupEventListeners();
    }

    async function loadSettings() {
        try {
            const settings = await Admin.getSettings();
            renderForm(settings);
        } catch (error) {
            console.error("Failed to load settings:", error);
            Admin.showToast("Failed to load settings", "error");
        }
    }

    function setupEventListeners() {
        const form = document.getElementById("settingsForm");
        if (form) {
            form.addEventListener("submit", handleSubmit);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const settings = Object.fromEntries(formData);

        try {
            await Admin.saveSettings(settings);
            Admin.showToast("Settings saved successfully");
        } catch (error) {
            console.error("Failed to save settings:", error);
            Admin.showToast("Failed to save settings", "error");
        }
    }

    function renderForm(settings) {
        const container = document.getElementById("pageContent");
        if (!container) return;

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
                                <input type="text" class="form-input" name="storeName" value="${Admin.escapeHtml(settings.storeName)}" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Store Email <span class="required">*</span></label>
                                <input type="email" class="form-input" name="storeEmail" value="${Admin.escapeHtml(settings.storeEmail)}" required>
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

        setupEventListeners();
    }

    return { init };
})();

if (typeof window !== "undefined") {
    window.SettingsPage = SettingsPage;
}