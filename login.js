// =========================
// LOGIN (front-end prototype)
// =========================

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const forgotPassword = document.getElementById("forgotPassword");

function showLoginMessage(text, type) {
    if (!loginMessage) return;
    loginMessage.textContent = text;
    loginMessage.classList.remove("error", "success");
    if (type) loginMessage.classList.add(type);
}

function readUser() {
    try {
        return JSON.parse(localStorage.getItem("xUser"));
    } catch (e) {
        return null;
    }
}

if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const email = document.getElementById("loginEmail").value.trim().toLowerCase();
        const password = document.getElementById("loginPassword").value;
        const rememberMe = document.getElementById("rememberMe").checked;
        const savedUser = readUser();
        if (!savedUser) {
            showLoginMessage("No account was found. Please create an account first.", "error");
            return;
        }
        if (savedUser.email !== email || savedUser.password !== password) {
            showLoginMessage("The email or password is incorrect.", "error");
            return;
        }
        try {
            localStorage.setItem("xLoggedIn", "true");
            if (rememberMe) {
                localStorage.setItem("xRememberLogin", "true");
            } else {
                localStorage.removeItem("xRememberLogin");
            }
        } catch (e) {}
        showLoginMessage("Login successful.", "success");
        setTimeout(() => {
            let redirect = null;
            try {
                redirect = localStorage.getItem("xCheckoutRedirect");
            } catch (e) {}
            if (redirect === "true" || redirect === "checkout.html") {
                try {
                    localStorage.removeItem("xCheckoutRedirect");
                } catch (e) {}
                window.location.href = "checkout.html";
            } else {
                window.location.href = "account.html";
            }
        }, 700);
    });
}

if (forgotPassword) {
    forgotPassword.addEventListener("click", (event) => {
        event.preventDefault();
        alert("Password reset is not connected yet. A real version will send a reset link to your email.");
    });
}