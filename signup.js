// =========================
// SIGNUP (front-end prototype)
// =========================

const signupForm = document.getElementById("signupForm");
const signupMessage = document.getElementById("signupMessage");

function showSignupMessage(text, type) {
    if (!signupMessage) return;
    signupMessage.textContent = text;
    signupMessage.classList.remove("error", "success");
    if (type) signupMessage.classList.add(type);
}

function readUser() {
    try {
        return JSON.parse(localStorage.getItem("xUser"));
    } catch (e) {
        return null;
    }
}

if (signupForm) {
    signupForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const firstName = document.getElementById("firstName").value.trim();
        const lastName = document.getElementById("lastName").value.trim();
        const email = document.getElementById("signupEmail").value.trim().toLowerCase();
        const password = document.getElementById("signupPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const terms = document.getElementById("terms");
        if (!firstName || !lastName || !email) {
            showSignupMessage("Please complete all fields.", "error");
            return;
        }
        if (password.length < 8) {
            showSignupMessage("Your password must be at least 8 characters.", "error");
            return;
        }
        if (password !== confirmPassword) {
            showSignupMessage("The passwords do not match.", "error");
            return;
        }
        const existingUser = readUser();
        if (existingUser && existingUser.email === email) {
            showSignupMessage("An account with this email already exists.", "error");
            return;
        }
        // The form is novalidate, so the browser's required check on the terms
        // checkbox never runs. This is the last gate before the account exists,
        // so it has to be enforced here or consent is silently skipped.
        if (terms && !terms.checked) {
            showSignupMessage("Please accept the Terms and Conditions to create an account.", "error");
            return;
        }
        const user = { firstName, lastName, email, password };
        try {
            localStorage.setItem("xUser", JSON.stringify(user));
            localStorage.setItem("xLoggedIn", "true");
        } catch (e) {
            showSignupMessage("Storage is unavailable in this browser.", "error");
            return;
        }
        showSignupMessage("Your account has been created.", "success");
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