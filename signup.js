// =========================
// SIGNUP (API + Google OAuth + Offline fallback)
// =========================

const signupForm = document.getElementById("signupForm");
const signupMessage = document.getElementById("signupMessage");
const googleSignUpContainer = document.getElementById("googleSignUpContainer");
const googleSignUpFallback = document.getElementById("googleSignUpFallback");

const GOOGLE_CLIENT_ID = "540286988119-l52h6ls3vn3d1uiq25elt3hbdv1cdd85.apps.googleusercontent.com";

// Turnstile token captured via data-callback on the widget.
window.turnstileToken = "";
window.onTurnstileSuccess = function(token) {
    window.turnstileToken = token;
};
// Demo mode: the script loads render=explicit, so nothing auto-scans. When
// a real site key is injected server-side, signup.js on this page renders
// the widget manually (see the loader below); an empty/placeholder key stays
// hidden instead of erroring against a blank key.
document.querySelectorAll(".cf-turnstile").forEach(function (widget) {
    const siteKey = widget.getAttribute("data-sitekey") || "";
    if (!siteKey || siteKey.indexOf("__") === 0) {
        widget.style.display = "none";
    }
});
function initSignupTurnstile() {
    const widget = document.querySelector(".cf-turnstile");
    if (!widget) return;
    const siteKey = widget.getAttribute("data-sitekey") || "";
    if (!siteKey || siteKey.indexOf("__") === 0) return; // stays hidden
    const tryRender = function (attempts) {
        const api = (typeof window !== "undefined" && window.turnstile) || null;
        if (!api || typeof api.render !== "function") {
            if (attempts > 50) return;
            return setTimeout(function () { tryRender(attempts + 1); }, 150);
        }
        widget.innerHTML = "";
        api.render(widget, { sitekey: siteKey, callback: window.onTurnstileSuccess });
    };
    tryRender(0);
}
initSignupTurnstile();

function showSignupMessage(text, type) {
    if (!signupMessage) return;
    signupMessage.textContent = text;
    signupMessage.classList.remove("error", "success");
    if (type) signupMessage.classList.add(type);
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

async function apiSignup(firstName, lastName, email, password) {
    try {
        const res = await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ firstName, lastName, email, password, cf_turnstile_response: window.turnstileToken || "" })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            const user = { firstName: data.customer.firstName, lastName: data.customer.lastName, email: data.customer.email };
            try {
                localStorage.setItem("xUser", JSON.stringify(user));
                localStorage.setItem("xLoggedIn", "true");
            } catch (e) {}
            return { ok: true, user };
        }
        return { ok: false, error: data.error || "Signup failed", status: res.status };
    } catch (e) {
        console.warn("API signup failed, trying localStorage:", e);
        return { ok: false, error: "api_unavailable" };
    }
}

// -------------------------
// GOOGLE AUTH
// -------------------------
// -------------------------
// GOOGLE AUTH
// -------------------------

// See login.js: GIS only works from an origin registered in the Google Cloud
// Console. file:// and unregistered origins make Google answer with
// "Error 400: invalid_request", so the flow is guarded before it starts.
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
    // Fit the button to the container: a hard-coded 370px width used to push
    // the page wider than the viewport on 320-430px phones.
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
        showSignupMessage("Google authentication could not be completed.", "error");
        return;
    }
    showSignupMessage("Setting up your account with Google...", "success");
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
            showSignupMessage("Account ready! Redirecting...", "success");
            setTimeout(redirectAfterAuth, 600);
        } else {
            showSignupMessage(data.error || "Google sign-up failed. Please try again.", "error");
        }
    } catch (err) {
        console.error("Google auth request error:", err);
        showSignupMessage("Connection error during Google sign-up. Please try again.", "error");
    }
}

let googleInitAttempts = 0;
function initGoogleAuth() {
    // Never start Google on an origin Google cannot verify (see login.js).
    const unsupported = googleAuthUnsupportedReason();
    if (unsupported) {
        showSignupMessage(unsupported, "error");
        if (googleSignUpFallback) googleSignUpFallback.setAttribute("title", unsupported);
        return;
    }
    if (typeof window.google === "undefined" || !window.google.accounts || !window.google.accounts.id) {
        if (++googleInitAttempts < 25) {
            setTimeout(initGoogleAuth, 150);
        } else {
            showSignupMessage("Google sign-in could not load. Check your connection and refresh the page.", "error");
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

        if (googleSignUpContainer) {
            renderGoogleButton(googleSignUpContainer);
            if (typeof ResizeObserver === "function") {
                let lastWidth = googleSignUpContainer.clientWidth;
                new ResizeObserver(() => {
                    if (!googleSignUpContainer.clientWidth || Math.abs(googleSignUpContainer.clientWidth - lastWidth) < 24) return;
                    lastWidth = googleSignUpContainer.clientWidth;
                    googleSignUpContainer.innerHTML = "";
                    renderGoogleButton(googleSignUpContainer);
                }).observe(googleSignUpContainer);
            }
            if (googleSignUpFallback) {
                googleSignUpFallback.style.display = "none";
            }
        }
    } catch (e) {
        console.warn("Google initialization warning:", e);
    }
}

if (googleSignUpFallback) {
    googleSignUpFallback.addEventListener("click", () => {
        if (googleAuthUnsupportedReason()) {
            showSignupMessage("Google sign-in needs a served origin: " + DOCUMENTED_RUN_HOST + " locally, or your deployed https domain. See OAUTH_SETUP.md.", "error");
            return;
        }
        if (typeof window.google !== "undefined" && window.google.accounts && window.google.accounts.id) {
            showSignupMessage("Choose an account in the Google prompt.", "");
            window.google.accounts.id.prompt();
        } else {
            showSignupMessage("Google services are loading. Please try again in a moment.", "error");
        }
    });
}

// -------------------------
// FORM LISTENER
// -------------------------
if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
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
        if (terms && !terms.checked) {
            showSignupMessage("Please accept the Terms and Conditions to create an account.", "error");
            return;
        }

        // Try API first
        const submitButton = signupForm.querySelector(".auth-button");
        setButtonLoading(submitButton, true);
        const apiResult = await apiSignup(firstName, lastName, email, password);
        setButtonLoading(submitButton, false);
        if (apiResult.ok) {
            showSignupMessage("Your account has been created. Redirecting...", "success");
            setTimeout(redirectAfterAuth, 700);
            return;
        }

        // Fallback to localStorage if API unavailable
        if (apiResult.error === "api_unavailable") {
            const user = { firstName, lastName, email };
            try {
                localStorage.setItem("xUser", JSON.stringify(user));
                localStorage.setItem("xLoggedIn", "true");
            } catch (e) {
                showSignupMessage("Storage is unavailable in this browser.", "error");
                return;
            }
            showSignupMessage("Your account has been created (offline). Redirecting...", "success");
            setTimeout(redirectAfterAuth, 700);
            return;
        }

        // API error (duplicate email, validation, etc.)
        if (apiResult.status === 409) {
            showSignupMessage("An account with this email already exists.", "error");
        } else {
            showSignupMessage(apiResult.error || "Signup failed. Please try again.", "error");
        }
    });
}

// Start Google Identity Services
initGoogleAuth();