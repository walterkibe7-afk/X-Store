// =========================
// FIND YOUR MATCH QUIZ
// Fetches products from API for matching.
// =========================

// Whole-shilling KES formatting used across the storefront.
function formatKES(value) {
    const n = Math.round(Number(value) || 0);
    return "KSh " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const startButton = document.querySelector(".quiz-start");
const quizSection = document.querySelector(".quiz-flow-section");
const questions = document.querySelectorAll(".question");
const nextButton = document.querySelector(".quiz-next");
const backButton = document.querySelector(".quiz-back");
const questionNumber = document.querySelector("#question-number");
const progressPercent = document.querySelector("#progress-percent");
const progressBar = document.querySelector("#progress-bar");
const quizProgress = document.querySelector(".quiz-progress");
const quizNavigation = document.querySelector(".quiz-navigation");
const results = document.querySelector(".quiz-results");
const restartButton = document.querySelector("#restart-quiz");
const saveResults = document.querySelector("#save-results");
const quizEmail = document.querySelector("#quiz-email");

let CATALOGUE = [];

async function loadCatalogue() {
    try {
        const res = await fetch("/api/products?active=true&limit=100");
        const { products } = await res.json();
        CATALOGUE = products.map(adaptProduct);
    } catch (e) {
        console.error("Failed to load products for quiz:", e);
        CATALOGUE = [];
    }
}

function adaptProduct(p) {
    const imageClasses = ["image-a", "image-b", "image-c", "image-d", "image-e", "image-f", "image-g", "image-h"];
    const idx = imageClasses.findIndex(c => p.id.includes(c.replace('image-', ''))) % imageClasses.length;
    const imageClass = imageClasses[Math.max(0, idx >= 0 ? idx : 0)];

    return {
        id: p.id,
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        price: p.price,
        oldPrice: p.compare_price,
        badge: p.badge,
        badgeClass: p.badge ? p.badge.toLowerCase().replace(/\s+/g, '-') : '',
        rating: p.rating,
        reviews: p.review_count,
        featured: !!p.featured,
        newest: false,
        image: imageClass,
        description: p.description,
        details: p.details,
        care: '',
        shipping: ''
    };
}

loadCatalogue();

let currentQuestion = 1;
const totalQuestions = questions.length;
const answers = {};

// =========================
// MATCHING
//
// Every answer points at real catalogue ids. Q1 states intent most directly, so
// it carries the most weight; Q5 is a preference on top, and is resolved
// against each product's real price rather than a copied list of prices.
// =========================

const Q1_WEIGHT = 3;
const ANSWER_WEIGHT = 2;
const PRICE_WEIGHT = 5;

// Keyed by question number, matching how `answers` is stored, so an answer can
// never be read from the wrong question.
const MATCH_SCORES = {
    // Q1 - what are you looking for today?
    1: {
        explore: { "silk-touch": Q1_WEIGHT, "velvet-mini": Q1_WEIGHT, luna: Q1_WEIGHT },
        selfcare: { "after-dark-oil": Q1_WEIGHT, "slow-down-oil": Q1_WEIGHT, "night-ritual": Q1_WEIGHT },
        wellness: { "midnight-gummies": Q1_WEIGHT, "night-ritual": Q1_WEIGHT, "slow-down-oil": Q1_WEIGHT },
        gift: { "the-duo": Q1_WEIGHT }
    },

    // Q2 - your vibe
    2: {
        simple: { "slow-down-oil": ANSWER_WEIGHT, "midnight-gummies": ANSWER_WEIGHT },
        sensory: { "after-dark-oil": ANSWER_WEIGHT, "night-ritual": ANSWER_WEIGHT },
        playful: { luna: ANSWER_WEIGHT, "velvet-mini": ANSWER_WEIGHT },
        ritual: { "night-ritual": ANSWER_WEIGHT, "silk-touch": ANSWER_WEIGHT }
    },

    // Q3 - experience
    3: {
        new: { "midnight-gummies": ANSWER_WEIGHT, "night-ritual": ANSWER_WEIGHT },
        curious: { "velvet-mini": ANSWER_WEIGHT, "the-duo": ANSWER_WEIGHT },
        familiar: { "silk-touch": ANSWER_WEIGHT, luna: ANSWER_WEIGHT },
        experienced: { luna: ANSWER_WEIGHT, "after-dark-oil": ANSWER_WEIGHT }
    },

    // Q4 - what matters
    4: {
        comfort: { "velvet-mini": ANSWER_WEIGHT, luna: ANSWER_WEIGHT },
        quality: { "silk-touch": ANSWER_WEIGHT, luna: ANSWER_WEIGHT },
        simplicity: { "slow-down-oil": ANSWER_WEIGHT, "midnight-gummies": ANSWER_WEIGHT },
        discovery: { "the-duo": ANSWER_WEIGHT, "after-dark-oil": ANSWER_WEIGHT }
    }
};

// Q5 - preferred price range. "any" is absent on purpose: it adds no points,
// so it never fights the other four answers.
const PRICE_BANDS = {
    5: {
        under30: { min: 0, max: 3000 },
        "30to50": { min: 3000, max: 6000 },
        "50to75": { min: 6000, max: 100000 }
    }
};

function inBand(price, band) {
    return price >= band.min && price <= band.max;
}

// Walks the catalogue in order and keeps the first product with the highest
// score, so a tie is always broken by the catalogue's own order. No randomness.
function pickMatch() {
    let best = null;
    let bestScore = -1;

    CATALOGUE.forEach((product) => {
        let score = 0;

        Object.keys(MATCH_SCORES).forEach((question) => {
            const chosen = answers[question];
            if (!chosen) return;
            const awarded = MATCH_SCORES[question][chosen] && MATCH_SCORES[question][chosen][product.id];
            if (awarded) score += awarded;
        });

        Object.keys(PRICE_BANDS).forEach((question) => {
            const chosen = answers[question];
            if (chosen && PRICE_BANDS[question][chosen] && inBand(product.price, PRICE_BANDS[question][chosen])) {
                score += PRICE_WEIGHT;
            }
        });

        if (score > bestScore) {
            bestScore = score;
            best = product;
        }
    });

    return best;
}

function renderMatch(product) {
    if (!product) return;

    const image = document.querySelector(".result-image");
    if (image) {
        CATALOGUE.forEach((item) => {
            if (item.image) image.classList.remove(item.image);
        });
        if (product.image) image.classList.add(product.image);
    }

    const category = document.querySelector(".result-category");
    if (category) category.textContent = String(product.category || "").toUpperCase();

    const name = document.querySelector(".result-name");
    if (name) name.textContent = product.name;

    const description = document.querySelector(".result-description");
    if (description) description.textContent = product.description || "";

    const price = document.querySelector(".result-price");
    if (price) price.textContent = formatKES(product.price);

    const link = document.querySelector(".result-link");
    if (link) link.setAttribute("href", "product.html?id=" + encodeURIComponent(product.id));
}

function scrollToQuiz() {
    if (!quizSection) return;
    const top = quizSection.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: "smooth" });
}

function updateQuiz() {
    questions.forEach((q) => q.classList.remove("active"));
    const active = document.querySelector('[data-question="' + currentQuestion + '"]');
    if (active) active.classList.add("active");
    if (questionNumber) questionNumber.textContent = currentQuestion;
    const percent = Math.round((currentQuestion / totalQuestions) * 100);
    if (progressPercent) progressPercent.textContent = percent + "%";
    if (progressBar) progressBar.style.width = percent + "%";
    if (backButton) backButton.disabled = currentQuestion === 1;
    if (nextButton) nextButton.textContent = currentQuestion === totalQuestions ? "See my match →" : "Next →";
    const saved = answers[currentQuestion];
    if (active) {
        active.querySelectorAll(".answer-grid button").forEach((btn) => {
            btn.classList.toggle("selected", btn.dataset.value === saved);
        });
    }
}

function showResults() {
    questions.forEach((q) => q.classList.remove("active"));
    if (quizNavigation) quizNavigation.style.display = "none";
    if (quizProgress) quizProgress.style.display = "none";
    // The match is worked out from the answers every time it is shown, so it can
    // never go stale.
    renderMatch(pickMatch());
    if (results) results.classList.add("show");
    scrollToQuiz();
}

function resetQuiz() {
    currentQuestion = 1;
    // Clearing the answers also clears the score: it is derived, never stored.
    Object.keys(answers).forEach((k) => delete answers[k]);
    questions.forEach((q) => {
        q.classList.remove("active");
        q.querySelectorAll(".answer-grid button").forEach((b) => b.classList.remove("selected"));
    });
    if (questions[0]) questions[0].classList.add("active");
    if (results) results.classList.remove("show");
    if (quizNavigation) quizNavigation.style.display = "flex";
    if (quizProgress) quizProgress.style.display = "block";
    if (saveResults) {
        saveResults.textContent = "Send results";
        saveResults.disabled = false;
    }
    if (quizEmail) quizEmail.value = "";
    updateQuiz();
    scrollToQuiz();
}

if (startButton) startButton.addEventListener("click", scrollToQuiz);

questions.forEach((question) => {
    const buttons = question.querySelectorAll(".answer-grid button");
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove("selected"));
            button.classList.add("selected");
            const num = parseInt(question.dataset.question, 10);
            answers[num] = button.dataset.value;
        });
    });
});

if (nextButton) {
    nextButton.addEventListener("click", () => {
        if (!answers[currentQuestion]) {
            const active = document.querySelector('[data-question="' + currentQuestion + '"]');
            if (active) {
                active.classList.add("shake");
                setTimeout(() => active.classList.remove("shake"), 400);
            }
            return;
        }
        if (currentQuestion < totalQuestions) {
            currentQuestion++;
            updateQuiz();
            return;
        }
        showResults();
    });
}

if (backButton) {
    backButton.addEventListener("click", () => {
        if (currentQuestion > 1) {
            currentQuestion--;
            updateQuiz();
        }
    });
}

if (restartButton) restartButton.addEventListener("click", resetQuiz);

if (saveResults) {
    saveResults.addEventListener("click", () => {
        const email = quizEmail ? quizEmail.value.trim() : "";
        if (!email) {
            if (quizEmail) quizEmail.focus();
            return;
        }
        // Prototype: there is no backend, so this must not claim that anything
        // was delivered. It just acknowledges the click.
        saveResults.textContent = "Got it ✓";
        saveResults.disabled = true;
    });
}

updateQuiz();