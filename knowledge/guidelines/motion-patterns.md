# Motion patterns

## scroll-reveal-fade-up
tags: motion, scroll-reveal, fade-up, entrance, subtle, universal, minimal, saas, trustworthy, calm, premium

Content fades in and rises slightly as it enters the viewport. The default; almost never wrong.

**This one is already built and applied for you.** Every section on the page receives the locked
`reveal` class, which is CSS scroll-driven (`animation-timeline: view()`), carries the run's committed
easing, and is reduced-motion safe. Do NOT hand-roll it. Writing your own costs more than it gains:
an `IntersectionObserver` that fails to run leaves the content invisible with no fallback, per-section
timings drift so the page ends up with several unrelated entrance speeds, and `transition-all`
animates layout properties, which is the usual source of scroll jank.

**If a single block inside a section should arrive separately**, add `reveal` to that block. That is
the whole API.
**Pitfalls** — re-animating on every scroll pass is the most irritating thing on the web; the locked
reveal is tied to scroll position, so it cannot do that.

## stagger-children
tags: motion, stagger, children, entrance, cards, grid, universal, saas, playful, premium

Sibling elements enter in sequence rather than together.

**Spec** — 60–90ms between children. Beyond ~6 items the tail feels slow — stagger the first row only,
or drop to 40ms.
**Already built.** Gallery and modular sections receive `reveal-stagger`, whose offset comes from each child's real position in the viewport rather than an invented delay — so it survives any item count and any reflow. Do not import a library; only React is available.
**Pairs with** — `layout-patterns#bento-grid`, `layout-patterns#card-gallery`.
**Pitfalls** — never stagger a pricing table; making the user watch tiers arrive one by one delays a decision
they came to make. Stagger decoration, not choices.

## parallax-depth
tags: motion, parallax, depth, layers, hero, premium, editorial, immersive, primitive, parallax-slow, calm

Background media drifts slower than the foreground content, implying depth.

**USE THE PRIMITIVE — do not hand-build this.** The tested implementation is
`knowledge/motion-primitives/parallax-depth.json` (id: `parallax-depth`). It is retrieved and wired in
automatically when the run's locked motion language is `parallax-slow` or `subtle` AND the section's
composition is cinematic / immersive / editorial / gallery. Its `intensity` param (`subtle` | `medium`) is
the only knob — the drift is clamped against an oversized layer whose overscan always exceeds the shift,
so an edge gap cannot appear, and `prefers-reduced-motion` freezes it. Do not restate its numbers here.

**When it applies** — full-bleed media sections where depth carries the brand (premium/editorial, calm).
**When it does NOT** — parallax on body copy fights reading; skip it on text. Skip on touch-first layouts.
**Why not freehand it** — a scratch section may import **React only**, so it cannot express a scroll-linked
parallax at all; and hand-rolled overscan math is exactly where edge gaps come from. If no primitive is
retrieved for this section, express depth with static composition (scale contrast, overlap, cropping)
instead — do not attempt the motion.

## horizontal-pan-on-scroll
tags: motion, horizontal-pan, scroll-motion, pinned, scrub, aggressive, motorsport, premium, fashion, brand-motion, aspirational, needs-primitive

> ⚠ **ASPIRATIONAL — NOT A BUILD INSTRUCTION.** No tested primitive exists for this yet (the
> `horizontal-pan` effect slot is reserved but unbuilt), and a scratch section may import **React only**,
> so pinning + scrub cannot be expressed freehand. **Do not generate this from scratch.** Until a primitive
> ships, express lateral movement with a plain CSS `scroll-snap` horizontal track — which is also the
> required touch/reduced-motion fallback anyway. Prose below is for building the primitive later.

The section pins; its content translates on X as vertical scroll progresses.

**Spec** — pin the section, map `scrollProgress → translateX(-N%)` with `scrub`. Total pinned distance under
~2 viewport heights.
**Library** — GSAP `ScrollTrigger` (`pin: true, scrub: 1, end: '+=2000'`). This is the pattern GSAP exists for;
Framer Motion can do it with `useScroll` + `useTransform` but pinning is fiddlier.
**Pairs with** — `layout-patterns#horizontal-scroll-gallery`.
**Suits** — aggressive/motorsport (the gesture *is* speed), premium/fashion (a runway), any brand whose story
is lateral movement.
**Pitfalls** — this is the single most-abused pattern on award sites. If the horizontal gesture doesn't mean
something about the brand, it's a scroll-jack and users bounce. Must fall back to a plain horizontal
scroll-snap track on touch and under reduced-motion.

## sticky-pin-narrative
tags: motion, sticky-pin, pinned, scroll, storytelling, technical, developer, premium, product, aspirational, needs-primitive

> ⚠ **ASPIRATIONAL — NOT A BUILD INSTRUCTION.** No tested primitive exists for this yet, and a scratch
> section may import **React only**, so it cannot be built correctly freehand. **Do not generate this from
> scratch.** The `pinned-crossfade` primitive is queued to cover it; until that ships, express the same
> intent with a plain `position: sticky` column (no state swap) or a vertical stack. The prose below is
> recorded for building the primitive later, not for the model to implement now.

One column pins while the other scrolls; the pinned side swaps state at each step.

**Spec** — pin the media column; on each step's `onEnter`, cross-fade the pinned visual (200–300ms).
Steps are content, not slides — each must stand alone if motion is off.
**Library** — GSAP `ScrollTrigger` with `pin` + per-step triggers · Framer Motion `useScroll` with
`useTransform` ranges · CSS `position: sticky` alone if the pinned side doesn't change state.
**Pairs with** — `layout-patterns#sticky-scroll-narrative`.
**Pitfalls** — use `position: sticky` before reaching for JS. Never pin on touch. Degrades to a vertical stack.

## smooth-scroll
tags: motion, smooth-scroll, lenis, scroll, premium, editorial, immersive, universal, aspirational, needs-primitive

> ⚠ **ASPIRATIONAL — NOT A BUILD INSTRUCTION.** Lenis IS part of this project now: the scroll feel is committed per run and applied for you, so never import or configure it yourself. (Historically it was not a dependency and was
> deliberately deferred: it is a page-level scroll-physics layer, not a per-section primitive, so it
> cannot be introduced by a generated section at all. **Do not import or configure it.** It only becomes
> relevant if the project later adopts a global scroll layer — and only when something on the page is
> actually scrubbed. Prose below is recorded for that decision, not for the model to act on.

Interpolated scrolling that softens the native scroll step.

**Library** — **Lenis** is the standard (`new Lenis({ lerp: 0.1 })`), driven by a `requestAnimationFrame` loop
and synced to GSAP's ticker if you're scrubbing anything.
**Why** — scrub-driven animations (parallax, horizontal pan) look janky against native scroll's discrete steps.
Smooth scroll exists to serve *those*, not as an effect in itself.
**Suits** — premium/editorial and any site already using scrub animation.
**Pitfalls** — adds latency to a gesture users have muscle memory for. If nothing on the page is scrubbed,
don't add it. Breaks `scroll-behavior`, anchor links, and some accessibility tooling — wire up
`lenis.scrollTo()` for in-page anchors. Must be disabled under `prefers-reduced-motion`.

## magnetic-button
tags: motion, magnetic-button, hover, micro-interaction, cursor, premium, aggressive, experimental, playful, aspirational, needs-primitive

> ⚠ **ASPIRATIONAL — NOT A BUILD INSTRUCTION.** No tested primitive exists for this, and a scratch section
> may import **React only**, so pointer-tracking springs cannot be expressed freehand. **Do not generate
> this from scratch.** Hover/press feel is NOT a per-section choice here: the art-direction step commits
> ONE micro-interaction spec per run, emitted into `globals.css` as the `.mi` / `.mi-lift` / `.mi-press`
> classes — use those. See `guidelines/micro-interactions.md`. Prose below is for a future primitive.

The button (or its label) drifts toward the cursor within a proximity radius.

**Spec** — translate up to 6–10px toward the pointer inside a ~60–80px radius; spring back on leave.
Never move the *hit area* away from where the user aimed.
**Library** — Framer Motion `useMotionValue` + `useSpring` (cleanest) · GSAP `quickTo` for the same in vanilla.
**Suits** — premium, aggressive, experimental. Wrong for trustworthy/fintech — playfulness costs credibility there.
**Pitfalls** — pointer-only; guard with `@media (hover: hover) and (pointer: fine)`. It must still have a
plain, visible focus state for keyboard users. One or two per page, on the primary CTA — not on every link.

## text-mask-reveal
tags: motion, text-reveal, mask, split-text, entrance, premium, editorial, fashion, aggressive, dramatic, aspirational, needs-primitive

> ⚠ **ASPIRATIONAL — NOT A BUILD INSTRUCTION.** No tested primitive exists for this yet (the clip-path /
> curtain-reveal primitive is deliberately deferred), and a scratch section may import **React only**.
> **Do not generate this from scratch** — hand-split text also destroys screen-reader output and
> copy-paste, which is precisely why it belongs in a primitive that guards `aria-label`/`aria-hidden`.
> For a per-word kinetic headline that IS built, use the `kinetic-text-split` primitive instead (it is
> retrieved automatically when the locked motion language is `kinetic` or `aggressive`). Prose below is
> for building the primitive later.

Lines or characters rise out from behind a mask, as if uncovered.

**Spec** — wrap each line in `overflow: hidden`, translate the inner span from `100%` → `0`, stagger lines by
80–120ms, 600–800ms each.
**Library** — GSAP `SplitText` (paid plugin) · the free `splitting.js` · or split by line in the markup.
Framer Motion works if you pre-split.
**Suits** — premium/editorial, fashion, aggressive/motorsport headlines.
**Pitfalls** — split text destroys screen-reader output and copy-paste unless you keep an `aria-label` on the
parent and `aria-hidden` on the pieces. Only ever on the hero headline — on body copy it's unreadable and cruel.

## marquee-ticker
tags: motion, marquee, ticker, infinite-scroll, loop, aggressive, brutalist, playful, logos

A continuously translating strip: logos, words, headlines.

**Spec** — duplicate the track, translate `-50%`, loop linearly. `will-change: transform`. Pause on hover if it
carries readable content.
**Library** — pure CSS `@keyframes` (best) · GSAP for seamless velocity/direction changes tied to scroll.
**Suits** — aggressive/motorsport, brutalist, playful. A logo strip in a trustworthy/fintech mood should be
**static** — motion there says "we're padding this out".
**Pitfalls** — never put essential information in a moving strip. Continuous motion violates reduced-motion —
freeze it entirely, don't just slow it.

## cursor-follow
tags: motion, cursor, custom-cursor, pointer, experimental, brutalist, premium, fashion, aspirational, needs-primitive

> ⚠ **ASPIRATIONAL — NOT A BUILD INSTRUCTION.** No tested primitive exists for this, and a scratch section
> may import **React only**. **Do not generate this from scratch.** Cursor behaviour is already committed
> once per run by the art-direction step (`cursor` in the locked micro-interaction spec) — respect that,
> don't invent a follower. Prose below is for a future primitive.

A custom element trails the pointer, sometimes changing on hover targets.

**Spec** — lerp the follower toward the pointer (`lerp 0.1–0.2`). Never hide the native cursor unless the
replacement is at least as legible.
**Library** — GSAP `quickTo` · Framer Motion `useSpring`.
**Suits** — experimental, fashion, portfolio. Almost never right for a product site.
**Pitfalls** — pointer-only, and pure decoration. It buys atmosphere and costs usability; if the site has a
conversion goal, don't. Guard with `@media (hover: hover)`.

## choosing-a-motion-library
tags: motion, library, anime, animejs, gsap, framer-motion, motion-react, lenis, scroll-timeline, kinetic-typography, split-text, decision, rules

Four named tools. Pick ONE paradigm per page — do not mix a React-declarative library with an
imperative timeline library in the same generated site; they fight over the same elements and the
result is double-triggered, unmaintainable motion.

- **motion/react** (Framer Motion) — *the default for this project, because the target is React.*
  Component-level enter/exit (`whileInView`, `AnimatePresence`), hover/tap springs, layout
  animation, per-component variants. Reach for it for anything scoped to a single component's
  lifecycle. If motion/react can express the effect, use it and stop here.
- **anime.js** — framework-agnostic (plain JS, not React-specific). Reach for it for **two things
  motion/react is awkward at**: (1) **text-splitting / kinetic typography** — per-character and
  per-word staggers, `anime.stagger()` over split spans (`anime.text.split` in v4), letter-by-letter
  reveals; and (2) **complex, multi-track scroll timelines** — a single timeline coordinating many
  elements/keyframes along scroll progress. Drive it from an `IntersectionObserver` or a scroll
  handler; it does not own scroll, so pair it with Lenis if the timeline is scrubbed. Run it in a
  React `useEffect` against a ref, and clean up (`animation.pause()`) on unmount.
- **GSAP** — reach for it only for **`ScrollTrigger` pinning and scrub** (horizontal-pan,
  sticky-pin-narrative). That is the one thing nothing else does as cleanly. Don't pull GSAP in for
  ordinary reveals.
- **Lenis** — smooth/interpolated scroll. Only when something on the page is actually scrubbed
  (parallax, pinned pan, an anime.js scroll timeline). Never as an effect in itself.

**Decision, in order:** component-scoped effect → **motion/react**. Text-splitting or a big
multi-element scroll timeline → **anime.js**. Pinned/scrubbed scroll → **GSAP ScrollTrigger**.
Scrub present → add **Lenis**. Everything else is already handled by the locked `reveal` class. Do NOT write an IntersectionObserver: only React is importable, and a hand-rolled observer strands content invisible if it never runs.

**The no-mixing rule:** a generated page commits to motion/react *or* to the imperative
anime.js/GSAP stack — not both. If the hero needs kinetic split-text (anime.js) and the cards need
enter animation, express the cards with anime.js too rather than importing motion/react alongside.
One paradigm per page keeps the dependency surface and the mental model single.

## Motion restraint rules
tags: motion, restraint, performance, accessibility, reduced-motion, universal, rules

- Animate **only `transform` and `opacity`**. Animating layout properties (width, top, margin) causes jank.
- Total page entrance choreography under **1.2s**. The user should never wait for the design.
- Every effect must answer: *what does this say about the brand?* If the answer is "it looks cool", delete it.
  Decoration-motion reads as noise; brand-motion reads as craft.
- Honour `@media (prefers-reduced-motion: reduce)` — kill transforms, scrub, pinning, marquees and smooth
  scroll; keep opacity fades. This is not optional and it is the most commonly skipped rule.
- Hover/press values are **not a per-section choice**. The art-direction step commits ONE micro-interaction
  spec per run (duration, easing, hover transform, tap scale, cursor) and the writer emits it into
  `globals.css` as the `.mi` / `.mi-lift` / `.mi-press` utility classes. **Apply those classes; never invent
  a competing duration, easing or hover transform.** The committed per-mood values live in
  `guidelines/micro-interactions.md` — restrained for premium/calm, punchier for aggressive/playful.
- Every interactive element needs a visible **hover and focus** state. Motion is not a substitute for focus.
- Reach for the locked classes first. Never an IntersectionObserver, never a library — and pick ONE paradigm per
  page (see `#choosing-a-motion-library`). Framer Motion (motion/react) is the default here since the
  target is React; anime.js when you need split-text/kinetic typography or a big multi-element scroll
  timeline; GSAP only for `ScrollTrigger` pinning/scrub; Lenis only when something is scrubbed. Never
  mix motion/react with anime.js/GSAP in the same generated page.
