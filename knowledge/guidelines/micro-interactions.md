# Micro-interactions

The committed hover / cursor / transition contract. These are the exact numbers the art-direction
step locks ONCE per run, so every section shares the same interaction feel instead of each section
re-inventing durations and easings. Values are real and specific — durations in ms, easings as literal
cubic-beziers, transforms as literal CSS.

## easing curves
tags: micro-interaction, easing, cubic-bezier, transition, universal

The named easing curves. Pick by feel; never leave easing to the browser default (`ease`, which is
mushy) except where a mood calls for it.

**standard-out** — `cubic-bezier(0.22, 1, 0.36, 1)` — decisive, settles fast. The default for hover and
state change. Suits premium, minimal, trustworthy, calm.
**entrance** — `cubic-bezier(0.16, 1, 0.3, 1)` — long, soft landing. For scroll reveals and first paint.
**mechanical** — `cubic-bezier(0.2, 0, 0, 1)` — sharp in, hard stop, no overshoot. Suits aggressive,
technical, motorsport. Reads engineered.
**overshoot** — `cubic-bezier(0.34, 1.56, 0.64, 1)` — springs slightly past then back. Playful/consumer
ONLY. On premium or fintech it reads cheap.
**linear / steps** — `linear` or `steps(1, end)` — no acceleration at all. Brutalist and raw only; makes
motion feel like a hard cut rather than an animation.
**Pitfalls** — one page should use one or two easings, not five. The hover easing and the reveal easing
can differ (standard-out vs entrance); everything else should reuse them.

## duration scale
tags: micro-interaction, duration, timing, transition, universal

How long feedback takes. Feedback must feel instant; reveals may take their time.

**Spec** — hover / press feedback **120–180ms**; control state change (toggle, focus ring) **180–220ms**;
content reveal on scroll **400–600ms**; large hero / pinned transitions up to **800ms**. Never exceed
**800ms** for anything the user triggers directly — past that it feels laggy, not smooth.
**Pitfalls** — a 400ms hover is sluggish; a 60ms reveal is a flicker. Match the number to the job.

## transition discipline
tags: micro-interaction, transition, performance, accessibility, reduced-motion, universal

The rules every mood obeys, regardless of the committed values.

- Animate **transform and opacity only**. Animating `width`, `height`, `top`, `box-shadow` spread, or
  `background-position` on hover thrashes layout and jank.
- Hover/press affordances belong on **interactive elements only** (links, buttons, cards that navigate).
  Never put a hover-lift on a static paragraph or a plain image with no action.
- **Always** gate motion behind `@media (prefers-reduced-motion: reduce)` — under it, transitions become
  `none` and hover transforms collapse to `none`. Non-negotiable.
- One transition property list, reused: `transition: transform <dur> <ease>, opacity <dur> <ease>`.
- `:focus-visible` gets a real ring (2px accent, 2px offset) — keyboard users need the same affordance
  hover gives mouse users.

## premium / calm micro-interactions
tags: micro-interaction, premium, luxury, calm, editorial, wellness, hover, cursor

Restraint. Motion should be felt, not seen.

**Committed values** — duration **260ms** · easing **standard-out** `cubic-bezier(0.22, 1, 0.36, 1)` ·
hover transform **`translateY(-2px)`** (no scale, or at most `scale(1.008)`) · hover shadow a soft low
lift (`0 8px 24px rgba(0,0,0,0.08)`) · tap scale **0.99** · cursor **default** (pointer only on true links).
**Pitfalls** — no bounce, no scale-up, no glow. A luxury brand that boings on hover stops reading luxury.

## aggressive / motorsport micro-interactions
tags: micro-interaction, aggressive, motorsport, energetic, bold, hover, cursor

Fast and physical. The interface should feel taut.

**Committed values** — duration **140ms** · easing **mechanical** `cubic-bezier(0.2, 0, 0, 1)` · hover
transform **`translateY(-3px) scale(1.03)`** · hover brightness `1.08` · tap scale **0.97** · cursor
**pointer** on all actionable. Optional: a 2px accent underline that wipes in on hover.
**Pitfalls** — keep it under 160ms; a slow aggressive brand is a contradiction.

## playful / consumer micro-interactions
tags: micro-interaction, playful, consumer, lifestyle, fun, hover, cursor

Energy and personality. The one place overshoot belongs.

**Committed values** — duration **240ms** · easing **overshoot** `cubic-bezier(0.34, 1.56, 0.64, 1)` ·
hover transform **`scale(1.05)`** (optionally `rotate(-1deg)` on cards) · tap scale **0.95** · cursor
**pointer**. Color/accent shifts on hover are welcome.
**Pitfalls** — overshoot is charming once per element, exhausting if everything springs. Reserve the
bounce for primary actions and cards, not every link.

## minimal / saas micro-interactions
tags: micro-interaction, minimal, saas, product, clean, hover, cursor

Quiet, quick, functional. Opacity and a hair of movement.

**Committed values** — duration **160ms** · easing **standard-out** `cubic-bezier(0.22, 1, 0.36, 1)` ·
hover transform **`translateY(-1px)`** (no scale) · hover: opacity 0.9 → 1 or a subtle bg tint · tap
scale **0.99** · cursor **pointer** on interactive.
**Pitfalls** — no shadows blooming, no scaling. Minimal means the motion is nearly subliminal.

## technical / developer micro-interactions
tags: micro-interaction, technical, developer, dark, precise, hover, cursor

Crisp and engineered. No soft physics.

**Committed values** — duration **120ms** · easing **mechanical** `cubic-bezier(0.2, 0, 0, 1)` · hover:
color/underline shift or a 1px accent border — **no transform scale**, no lift · focus ring emphasized
(2px accent, monospace-adjacent precision) · tap: brief bg flash · cursor **pointer**, `text` on code.
**Pitfalls** — scaling and bouncing undercut the "this is precise tooling" read. Keep motion mechanical.

## brutalist / raw micro-interactions
tags: micro-interaction, brutalist, raw, experimental, hard, hover, cursor

Hard cuts, no easing. Motion that refuses to be smooth.

**Committed values** — duration **0–80ms** · easing **linear** (or `steps(1, end)`) · hover: **hard
color/border invert** (swap fg/bg, or flip a 2–3px border) — **no transform, no scale, no shadow** · tap:
instant inversion · cursor **default**.
**Pitfalls** — any soft easing or lift betrays the aesthetic. If it feels animated, it's wrong.

## trustworthy / fintech micro-interactions
tags: micro-interaction, trustworthy, fintech, corporate, stable, hover, cursor

Measured and reassuring. Nothing sudden.

**Committed values** — duration **200ms** · easing **standard-out** `cubic-bezier(0.22, 1, 0.36, 1)` ·
hover transform **`translateY(-1px)`** with a faint border/shadow firming · `:focus-visible` rings
emphasized (accessibility is trust) · tap scale **0.99** · cursor **pointer**.
**Pitfalls** — no bounce, no fast punch. Money UIs earn trust by feeling steady, never jumpy.

## cursor & affordance
tags: micro-interaction, cursor, affordance, focus, accessibility, universal

- `cursor: pointer` **only** on genuinely actionable elements — putting it on non-interactive text trains
  users to mistrust the affordance.
- Custom cursors (dot-follower, blend-mode ring) only when the brand is explicitly expressive
  (playful, experimental, editorial-fashion). Never on fintech, saas, or technical.
- Every interactive element needs a visible `:focus-visible` state, not just `:hover` — keyboard and
  mouse users get parity. Default: `outline: 2px solid var(--accent); outline-offset: 2px`.
- Disabled controls: `cursor: not-allowed`, opacity ~0.5, and NO hover transform.
