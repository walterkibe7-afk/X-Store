// =========================
// HELP PAGE
// FAQ accordion and the front-end contact form. Nothing here talks to a
// backend: submitting the form only shows a confirmation message.
// =========================

// One open FAQ answer at a time.
//
// The buttons carry aria-expanded in the markup, but nothing yet points each
// one at the panel it controls, so assistive tech is told the state without
// being told what changed. Ids are assigned here (rather than hand-written in
// the eight repeated HTML blocks) so the button and the panel can never drift.
document.querySelectorAll(".faq-item").forEach((item, index) => {
    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    const toggle = item.querySelector(".faq-toggle");
    if (!button || !answer) return;

    if (!answer.id) {
        answer.id = "faq-answer-" + (index + 1);
    }
    button.setAttribute("aria-controls", answer.id);

    button.addEventListener("click", () => {
        const willOpen = answer.hidden;

        document.querySelectorAll(".faq-item.open").forEach((other) => {
            if (other !== item) {
                other.classList.remove("open");
                const otherAnswer = other.querySelector(".faq-answer");
                const otherButton = other.querySelector(".faq-question");
                const otherToggle = other.querySelector(".faq-toggle");
                if (otherAnswer) otherAnswer.hidden = true;
                if (otherButton) otherButton.setAttribute("aria-expanded", "false");
                if (otherToggle) otherToggle.textContent = "+";
            }
        });

        item.classList.toggle("open", willOpen);
        answer.hidden = !willOpen;
        button.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (toggle) toggle.textContent = willOpen ? "\u2212" : "+";
    });
});

// The form is front-end only: no page reload, no fake API call.
const contactForm = document.querySelector(".contact-form");
if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const success = contactForm.querySelector(".contact-success");
        if (success) success.hidden = false;
    });
}