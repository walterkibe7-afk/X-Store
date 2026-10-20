// =========================
// LOGIN & RECOVERY (API + Google OAuth + Token Reset)
// =========================

const loginSection = document.getElementById("loginSection");
const forgotPasswordSection = document.getElementById("forgotPasswordSection");
const resetPasswordSection = document.getElementById("resetPasswordSection");

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const forgotPasswordLink = document.getElementById("forgotPassword");
const backToLoginFromForgot = document.getElementById("backToLoginFromForgot");

const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const forgotMessage = document.getElementById("forgotMessage");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetMessage = document.getElementById("resetMessage");

const googleBtnContainer = document.getElementById("googleSignInContainer");
const googleSignInFallback = document.getElementById("googleSignInFallback");

const GOOGLE_CLIENT_ID = "540286988119-l52h6ls3vn3d1uiq25elt3hbdv1cdd85.apps.googleusercontent.com";

function showLoginMessage(text, type) {
    if (!loginMessage) return;
    loginMessage.textContent = text;
    loginMessage.classList.remove("error", "success");
    if (type) loginMessage.classList.add(type);
}

function showForgotMessage(text, type) {
    if (!forgotMessage) return;
    forgotMessage.textContent = text;
    forgotMessage.classList.remove("error", "success");
    if (type) forgotMessage.classList.add(type);
}

function showResetMessage(text, type) {
    if (!resetMessage) return;
    resetMessage.textContent = text;
    resetMessage.classList.remove("error", "success");
    if (type) resetMessage.classList.add(type);
}

// Applies the shared loading state to an .auth-button while a request runs.
function setButtonLoading(button, loading) {
    if (!button) return;
    if (loading) {
        button.classList.add("is-loading");
        button.setAttribute("aria-busy", "true");
        button.disabled = true;
    } else {
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
        button.disabled = false;
    }
}

function readUser() {
    try {
        return JSON.parse(localStorage.getItem("xUser"));
    } catch (e) {
        return null;
    }
}

function redirectAfterAuth() {
    let redirect = null;
    try { redirect = localStorage.getItem("xCheckoutRedirect"); } catch (e) {}
    if (redirect === "true" || redirect === "checkout.html") {
        try { localStorage.removeItem("xCheckoutRedirect"); } catch (e) {}
        window.location.href = "checkout.html";
    } else {
        window.location.href = "account.html";
    }
}

async function apiLogin(email, password, rememberMe) {
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            const user = { firstName: data.customer.firstName, lastName: data.customer.lastName, email: data.customer.email };
            try {
                localStorage.setItem("xUser", JSON.stringify(user));
                localStorage.setItem("xLoggedIn", "true");
                if (rememberMe) localStorage.setItem("xRememberLogin", "true");
                else localStorage.removeItem("xRememberLogin");
            } catch (e) {}
            return { ok: true, user };
        }
        return { ok: false, error: data.error || "Login failed" };
    } catch (e) {
        console.warn("API login failed, trying localStorage:", e);
        return { ok: false, error: "api_unavailable" };
    }
}

// -------------------------
// GOOGLE AUTH
// -------------------------

// Google Identity Services only issues credentials to pages served from an
// origin that is explicitly listed in the OAuth client's "Authorized
// JavaScript origins". Opening login.html as a local file (file://D:/...) has
// no registered origin, so Google stops the flow with:
//   "Error 400: invalid_request — ... does not comply with Google's OAuth 2.0
//    policy for secure response handling".
// Detecting that here surfaces a helpful message instead of Google's error
// page, and DOCUMENTED_RUN_HOST below tells the developer the exact origin to
// register (see OAUTH_SETUP.md).
const DOCUMENTED_RUN_HOST = "http://127.0.0.1:8787";

function googleAuthUnsupportedReason() {
    const url = window.location || { protocol: "", hostname: "" };
    if (url.protocol === "file:") {
        return "Google sign-in can't run from a local file (file://). Serve the site over HTTP instead — see OAUTH_SETUP.md.";
    }
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return "Google sign-in requires the site to be served over https:// or http://localhost.";
    }
    return "";
}

function renderGoogleButton(container) {
    // Size the button to the container so it never overflows narrow phones.
    // A fixed pixel width was previously hard-coded (370px), which pushed the
    // page beyond the viewport on 320-430px screens.
    const width = Math.min(Math.max(container.clientWidth || 0, 200), 400);
    window.google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        type: "standard",
        shape: "rectangular",
        text: "continue_with",
        logo_alignment: "left",
        width: width
    });
}

async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
        showLoginMessage("Google authentication could not be completed.", "error");
        return;
    }
    showLoginMessage("Verifying with Google...", "success");
    try {
        const res = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            const user = {
                firstName: data.customer.firstName,
                lastName: data.customer.lastName,
                email: data.customer.email
            };
            try {
                localStorage.setItem("xUser", JSON.stringify(user));
                localStorage.setItem("xLoggedIn", "true");
            } catch (e) {}
            showLoginMessage("Welcome back! Redirecting...", "success");
            setTimeout(redirectAfterAuth, 600);
        } else {
            showLoginMessage(data.error || "Google sign-in failed. Please try again.", "error");
        }
    } catch (err) {
        console.error("Google auth request error:", err);
        showLoginMessage("Connection error during Google sign-in. Please try again.", "error");
    }
}

let googleInitAttempts = 0;
function initGoogleAuth() {
    // Never start Google on an origin Google cannot verify: doing so is what
    // produced the redirects to "Error 400: invalid_request".
    const unsupported = googleAuthUnsupportedReason();
    if (unsupported) {
        showLoginMessage(unsupported, "error");
        if (googleSignInFallback) googleSignInFallback.setAttribute("title", unsupported);
        return;
    }
    if (typeof window.google === "undefined" || !window.google.accounts || !window.google.accounts.id) {
        if (++googleInitAttempts < 25) {
            setTimeout(initGoogleAuth, 150);
        } else {
            showLoginMessage("Google sign-in could not load. Check your connection and refresh the page.", "error");
        }
        return;
    }
    try {
        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            // Chrome routes One Tap through FedCM; opting in keeps the prompt
            // working under current Chrome privacy settings.
            use_fedcm_for_prompt: true
        });

        if (googleBtnContainer) {
            renderGoogleButton(googleBtnContainer);
            // Re-render if the layout shifts the available width (orientation
            // change on mobile etc.). renderButton replaces cleanly when given
            // the same container after clearing it.
            if (typeof ResizeObserver === "function") {
                let lastWidth = googleBtnContainer.clientWidth;
                new ResizeObserver(() => {
                    if (!googleBtnContainer.clientWidth || Math.abs(googleBtnContainer.clientWidth - lastWidth) < 24) return;
                    lastWidth = googleBtnContainer.clientWidth;
                    googleBtnContainer.innerHTML = "";
                    renderGoogleButton(googleBtnContainer);
                }).observe(googleBtnContainer);
            }
            // Hide fallback button once Google renders its own control.
            if (googleSignInFallback) {
                googleSignInFallback.style.display = "none";
            }
        }
    } catch (e) {
        console.warn("Google initialization warning:", e);
    }
}

if (googleSignInFallback) {
    googleSignInFallback.addEventListener("click", () => {
        if (googleAuthUnsupportedReason()) {
            showLoginMessage("Google sign-in needs a served origin: " + DOCUMENTED_RUN_HOST + " locally, or your deployed https domain. See OAUTH_SETUP.md.", "error");
            return;
        }
        if (typeof window.google !== "undefined" && window.google.accounts && window.google.accounts.id) {
            showLoginMessage("Choose an account in the Google prompt.", "");
            window.google.accounts.id.prompt();
        } else {
            showLoginMessage("Google services are loading. Please try again in a moment.", "error");
        }
    });
}

// -------------------------
// FORM LISTENERS
// -------------------------
if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = loginForm.querySelector(".auth-button");
        const email = document.getElementById("loginEmail").value.trim().toLowerCase();
        const password = document.getElementById("loginPassword").value;
        const rememberMe = document.getElementById("rememberMe").checked;

        if (!email || !password) {
            showLoginMessage("Please enter your email and password.", "error");
            return;
        }

        // Try API first (button shows its loading state while we wait).
        setButtonLoading(submitButton, true);
        const apiResult = await apiLogin(email, password, rememberMe);
        setButtonLoading(submitButton, false);
        if (apiResult.ok) {
            showLoginMessage("Login successful.", "success");
            setTimeout(redirectAfterAuth, 600);
            return;
        }

        // If API is unavailable or offline, check localStorage
        if (apiResult.error === "api_unavailable") {
            const savedLocalUser = readUser();
            if (savedLocalUser && savedLocalUser.email === email) {
                try {
                    localStorage.setItem("xLoggedIn", "true");
                    if (rememberMe) localStorage.setItem("xRememberLogin", "true");
                    else localStorage.removeItem("xRememberLogin");
                } catch (e) {}
                showLoginMessage("Login successful.", "success");
                setTimeout(redirectAfterAuth, 600);
                return;
            }
        }

        showLoginMessage(apiResult.error || "The email or password is incorrect.", "error");
    });
}

// -------------------------
// PASSWORD RESET NAVIGATION & FLOW
// -------------------------
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (e) => {
        e.preventDefault();
        const currentEmail = document.getElementById("loginEmail")?.value?.trim() || "";
        if (currentEmail) {
            const forgotEmailInput = document.getElementById("forgotEmail");
            if (forgotEmailInput) forgotEmailInput.value = currentEmail;
        }
        if (loginSection) loginSection.style.display = "none";
        if (forgotPasswordSection) forgotPasswordSection.style.display = "block";
        if (resetPasswordSection) resetPasswordSection.style.display = "none";
    });
}

if (backToLoginFromForgot) {
    backToLoginFromForgot.addEventListener("click", (e) => {
        e.preventDefault();
        if (forgotPasswordSection) forgotPasswordSection.style.display = "none";
        if (loginSection) loginSection.style.display = "block";
    });
}

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("forgotEmail")?.value?.trim()?.toLowerCase();
        if (!email) {
            showForgotMessage("Please enter your email address.", "error");
            return;
        }
        showForgotMessage("Sending reset link...", "");
        const forgotButton = forgotPasswordForm.querySelector(".auth-button");
        setButtonLoading(forgotButton, true);
        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                showForgotMessage(data.message || "A reset link has been sent to your email.", "success");
            } else {
                showForgotMessage(data.error || "Failed to send reset email. Please try again.", "error");
            }
        } catch (err) {
            showForgotMessage("Network error. Please check your connection and try again.", "error");
        } finally {
            setButtonLoading(forgotButton, false);
        }
    });
}

// Check for reset_token in URL query string
const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get("reset_token");
if (resetToken) {
    if (loginSection) loginSection.style.display = "none";
    if (forgotPasswordSection) forgotPasswordSection.style.display = "none";
    if (resetPasswordSection) resetPasswordSection.style.display = "block";
}

if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById("newPassword")?.value || "";
        const confirmNewPassword = document.getElementById("confirmNewPassword")?.value || "";

        if (newPassword.length < 8) {
            showResetMessage("Password must be at least 8 characters.", "error");
            return;
        }
        if (newPassword !== confirmNewPassword) {
            showResetMessage("Passwords do not match.", "error");
            return;
        }

        showResetMessage("Updating password...", "");
        const resetButton = resetPasswordForm.querySelector(".auth-button");
        setButtonLoading(resetButton, true);
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: resetToken, newPassword })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                showResetMessage(data.message || "Password updated successfully!", "success");
                setTimeout(() => {
                    window.location.href = "login.html";
                }, 1200);
            } else {
                showResetMessage(data.error || "Reset failed. The link may have expired.", "error");
            }
        } catch (err) {
            showResetMessage("Network error. Please try again.", "error");
        } finally {
            setButtonLoading(resetButton, false);
        }
    });
}

// Start Google Identity Services
initGoogleAuth();