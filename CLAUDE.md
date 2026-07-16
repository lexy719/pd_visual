# web-design-agent — working notes

## Verifying motion primitives in the preview (READ BEFORE ANY LIVE SCROLL CHECK)

**The preview tab runs with `document.hidden === true`.** The browser therefore never fires
`requestAnimationFrame`. This silently breaks every rAF-driven library:

- GSAP's ticker sleeps → ScrollTrigger never runs its **queued initial refresh**, so `start` stays
  `0` and `end` stays `undefined`, and it never updates on scroll.
- Motion's (`framer-motion`) springs and `useScroll` smoothing never advance.

The failure is **silent and looks exactly like a broken component**: elements sit at their initial
values forever, no console error, no thrown exception. This burned a full session chasing a
non-existent bug in `@bsmnt/scrollytelling` — the library and the primitive were both correct.
A plain-GSAP control with zero library involvement failed identically, which is what proved it
environmental. **Never conclude a scroll primitive is broken until you have ruled this out.**

### Protocol — do this by default, don't rely on rAF

1. **Check visibility first.** `document.hidden` / `document.visibilityState`. If hidden, no
   rAF-driven value will ever change, and any "it doesn't animate" reading is meaningless.
2. **Expose ScrollTrigger from the harness** (`App.tsx`), never from the primitive:
   ```ts
   import ScrollTrigger from 'gsap/ScrollTrigger'
   ;(window as any).__ST = ScrollTrigger
   ```
3. **Drive it by hand:** `ScrollTrigger.refresh()` once, then per sample
   `window.scrollTo(0, y)` → `ScrollTrigger.update()` → read `getComputedStyle`.
4. **If the Root uses a numeric `scrub` (a lerp tween), `update()` is not enough** — the catch-up
   tween needs rAF. Apply the scroll target directly to sample the mapping:
   `tl.progress(st.progress)`. With `scrub: true` (immediate) this is unnecessary — `update()`
   applies values directly. Reach `tl` via `ScrollTrigger.getAll()[0].animation`.
5. **State the limitation in the report.** Driving the timeline verifies *geometry*, *scroll→timeline
   mapping*, and *timeline→value choreography*. It does **not** verify the temporal feel of a
   numeric scrub's smoothing lag. Say so rather than implying a full visual check.

### Measurement traps that produce false readings

- **Read the element the tween actually targets.** `Scrollytelling.Animation` animates its **Slot
  wrapper**, not the content you passed as children. Sampling the inner node reports a constant
  `opacity: 1` and looks like a dead tween. Use `el.parentElement`, or confirm the target via
  `tween.targets()[0]`.
- **Never probe timeline state from inside a React effect.** React runs *all* cleanups before *all*
  effects, so a probe mounted before an `Animation` reads the timeline in the gap after cleanup
  reverts and before the re-add — reporting `getChildren().length === 0` on a healthy timeline.
  Park the timeline on `window` and inspect it **lazily**, outside the effect cycle.
- **Style the harness like production.** An unstyled `<h1>` collapses to ~18px and makes any
  height-derived scroll range unrepresentative.
- **Keep the harness copy byte-identical to the shipped doc `code`.** Don't add `data-*` test hooks
  to the component — select by DOM structure instead, or you aren't testing what ships. Verify with
  a whitespace-normalised string compare against the primitive's JSON `code` field.

### Cases worth testing beyond the happy path

- **Above-the-fold placement.** A trigger whose `start`/`end` both compute negative (a hero
  headline) must degrade to fully-visible content, not invisible. `kinetic-text-split` was checked
  for this and is safe (progress pins to 1 at `scrollY 0`).
- **The reduced-motion / coarse-pointer fallback**, which is a plain render path and needs no rAF.

## Knowledge base

`npm run ingest` calls `resetSchema(db)` — a **full wipe and rebuild**. A directory missing from
`GUIDELINE_DIRS` in `engine/ingest/ingest.ts` is not merely skipped, its content is **deleted**.
Add any new `knowledge/` subdirectory there in the same change that creates it.

Ingest only walks `knowledge/`. Process/build notes must never live under `knowledge/` — they would
be embedded and retrieved as *design guidance* for generated sites. They belong here.

Chunking splits guideline markdown on `^## ` and reads a `tags:` line **per chunk**; plan()'s
evidence lanes are tag-gated, so an untagged chunk is invisible to retrieval. One tagged chunk per
pattern.
