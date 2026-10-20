/* Elle motion story v3 — word-locked Lenis + GSAP engine.
   Every pop time below is a MEASURED word start from faster-whisper
   (assets/vo/elle-explainer-timings.json, force-aligned to the script):
     Not[0.00] where[0.44] You're[1.52] Intimate[2.60]
     Too[5.86] awkward[6.98] guesswork[8.22] So[10.18]
     five[11.86] questions[12.54] vibe[13.28] focus[14.10] matters[15.12]
     match[16.74] no[18.26] Everything[19.40] arrives[19.74]
     secure[22.38] real[23.52]
     Take[24.10] Elle[25.04] quiz[25.52] find[26.22] feel[27.60]
   Rule: an element pops exactly ON its spoken word — never before, never after.
   Transitions slide inside VO silences and finish before the next word:
     T1 5.40->5.82 (gap 5.32-5.86) ... T2 11.22->11.54 (before 11.58)
     T3 16.14->16.56 (gap 16.08-16.58) ... T4 23.82->24.08 (before 24.10)
   All tweens fromTo() with explicit endpoints — scrub-safe & deterministic. */
import gsap from 'gsap'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const CAPTURE = !!window.__CAPTURE__

const SCENES = 5
const DURATION = 30.0 // VO ends 29.04 — hold the endcard through 30.0

const TRANSITIONS = [
  { at: 5.40,  dur: 0.42 }, // hook    -> problem (before "Too" 5.86)
  { at: 11.22, dur: 0.32 }, // problem -> guide   (before "Answer" 11.58)
  { at: 16.14, dur: 0.42 }, // guide   -> match   (before "We" 16.58)
  { at: 23.82, dur: 0.26 }, // match   -> cta     (before "Take" 24.10)
]

const mtl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } })
const reel = document.getElementById('reel')

// ---- Reel slides (Lenis-inertial easing), each inside a VO silence ----
TRANSITIONS.forEach((tr, i) => {
  mtl.to(reel, {
    y: `${-100 * (i + 1)}vh`,
    duration: tr.dur,
    ease: 'power2.inOut',
  }, tr.at)
})

// ---- Word-locked pops (selector, measured word start, duration) ----
// fromTo() everywhere: plain from() is not scrub-safe under frame capture.
const pop = (sel, at, dur = 0.4, from = { y: 22, opacity: 0 }, to = {}) =>
  mtl.fromTo(sel, from, { y: 0, opacity: 1, duration: dur, ...to }, at)

// 1 · hook — hero photo (slow ken-burns), title lines masked-reveal on their words
mtl.fromTo('.hero .bg', { scale: 1.12 }, { scale: 1.0, duration: 5.4, ease: 'none' }, 0)

// Ambient orb drift — non-text, so no word-lock constraint; deterministic
// fromTo over the full duration keeps every scrub frame identical.
const drift = (sel, from, to) => mtl.fromTo(sel, from, { ...to, duration: DURATION, ease: 'none' }, 0)
drift('#problem .o1', { x: -40, y: -20 }, { x: 50, y: 40 })
drift('#problem .o2', { x: 40, y: 30 }, { x: -50, y: -20 })
drift('#guide .o1',   { x: -30, y: 30 }, { x: 45, y: -30 })
drift('#guide .o2',   { x: 30, y: -20 }, { x: -40, y: 35 })
drift('#match .o1',   { x: 45, y: -30 }, { x: -35, y: 25 })
drift('#match .o2',   { x: -45, y: 25 }, { x: 30, y: -35 })
drift('#cta .o1',     { x: -25, y: -25 }, { x: 35, y: 30 })
drift('#cta .o2',     { x: 25, y: 25 }, { x: -35, y: -30 })
// Masked reveal ALSO fades opacity — the mask alone hides the line pre-word,
// the opacity guard makes it doubly invisible (and QA-verifiable) before its beat.
mtl.fromTo('#t-l1', { yPercent: 115, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5 }, 0.00)   // "Not"
mtl.fromTo('#t-l2', { yPercent: 115, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5 }, 0.44)   // "where"
pop('#t-s1', 1.52)   // "You're"
pop('#t-s2', 2.60)   // "Intimate"

// 2 · problem — each card pops on its spoken phrase
pop('#p-c1', 5.86, 0.38, { y: 18, opacity: 0, scale: 0.95 })  // "Too many choices"
pop('#p-c2', 6.98, 0.38, { y: 18, opacity: 0, scale: 0.95 })  // "awkward packaging"
pop('#p-c3', 8.22, 0.38, { y: 18, opacity: 0, scale: 0.95 })  // "guesswork"
pop('#p-pivot', 10.18, 0.45)                                  // "So Elle guides you."

// 3 · guide — headline on "five", phone on "questions", chips on their words
pop('#g-h', 11.86, 0.45)
pop('#g-phone', 12.54, 0.5, { y: 40, opacity: 0, scale: 0.96 })
pop('#g-w1', 13.28, 0.35, { y: 14, opacity: 0, scale: 0.9 })  // "your vibe,"
pop('#g-w2', 14.10, 0.35, { y: 14, opacity: 0, scale: 0.9 })  // "your focus,"
pop('#g-w3', 15.12, 0.35, { y: 14, opacity: 0, scale: 0.9 })  // "what matters"

// 4 · match — "Matched." on "match", lines + phone + checkout/support chips
pop('#m-h', 16.74, 0.45)
pop('#m-l1', 18.26, 0.4)                                      // "no guesswork."
pop('#m-l2', 19.40, 0.45)                                     // "Everything arrives…"
pop('#m-phone', 19.74, 0.5, { y: 40, opacity: 0, scale: 0.96 }) // "arrives"
pop('#m-w1', 22.38, 0.35, { y: 14, opacity: 0, scale: 0.9 })  // "secure"
pop('#m-w2', 23.52, 0.28, { y: 14, opacity: 0, scale: 0.9 })  // "real" (settles pre-slide)

// 5 · end — lead on "Take", logo on spoken "Elle", pill on "quiz", lines on their words
pop('#e-l1', 24.10, 0.45)
pop('#e-logo', 25.04, 0.5, { scale: 0.8, opacity: 0 })        // "Elle"
pop('#e-btn', 25.52, 0.4, { y: 16, opacity: 0, scale: 0.9 })  // "quiz"
pop('#e-l2', 26.22, 0.4)                                      // "find"
pop('#e-l3', 27.60, 0.4)                                      // "feel good…"

// Reading progress
mtl.fromTo('.progress', { scaleX: 0 }, { scaleX: 1, duration: DURATION, ease: 'none' }, 0)

// ---- Public API (used by the Playwright capture script) ----
window.__ELLE__ = {
  duration: DURATION,
  scenes: SCENES,
  seek(t) {
    mtl.time(Math.max(0, Math.min(DURATION, t)))
  },
  ready: false,
}

// Render frame 0 once fonts are ready so text uses DM Sans.
Promise.all([document.fonts.ready]).then(() => {
  mtl.time(0)
  window.__ELLE__.ready = true
  document.documentElement.dataset.ready = '1'
})

// ---- Live browser experience (skipped during capture) ----
// Inertia-smoothed wheel -> timeline, mirroring Lenis lerp(0.1).
if (!CAPTURE && !reduced) {
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
  let target = 0 // 0..1 progress
  const maxScroll = (SCENES - 1) * window.innerHeight
  lenis.on('scroll', ({ scroll }) => {
    target = Math.max(0, Math.min(1, scroll / maxScroll))
  })
  // Keep native scroll usable so Lenis produces values.
  document.body.style.overflow = 'auto'
  document.body.style.height = `${SCENES * 100}svh`
  const render = (time) => {
    lenis.raf(time)
    gsap.to(mtl, { time: target * DURATION, duration: 0.35, ease: 'power2.out', overwrite: true })
  }
  gsap.ticker.add(render)
  gsap.ticker.lagSmoothing(0)
}
