# Accessibility

tags: accessibility, universal, rules, wcag, contrast, aggressive, calm, premium, playful, minimal, technical, trustworthy, brutalist

These are checkable rules — the agent's self-critique pass should verify them mechanically.
They apply to every mood without exception: an aesthetic is never a reason to fail them.

## Contrast ratios
tags: contrast, wcag, ratio, legibility, text

- Body text vs background: **≥ 4.5:1**. Large text (≥24px or ≥19px bold): **≥ 3:1**.
- Text on an accent-colored button must be measured, not assumed — mid-tone accents (orange, teal, lime) usually fail with white text.
- Non-text UI (borders, icons, focus rings): ≥ 3:1 against adjacent color.
- Muted/secondary text is the most common failure. `#8a8a8f` on `#0a0a0b` passes; `#6b6b70` does not.

## Text over images and video
tags: video-bg, overlay, legibility, gradient, hero

Never place text directly on an unmodified photo or video.
- Apply a gradient scrim: `linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,.25))`, or a flat `rgba(0,0,0,.5)` overlay.
- Verify contrast against the *lightest* frame of the video, not a lucky still.
- Alternative: blur the media behind the text block (`backdrop-filter: blur(12px)`).

## Focus and keyboard
tags: focus, keyboard, tab-order, interactive

- Every interactive element has a visible focus ring: `outline: 2px solid var(--accent); outline-offset: 2px`.
- Never `outline: none` without a replacement.
- Tab order follows visual order. Skip-to-content link on long pages.

## Semantics and alternatives
tags: semantics, alt-text, aria, headings

- One `<h1>` per page. Heading levels never skip.
- Buttons that act are `<button>`; things that navigate are `<a>`.
- Every meaningful image has `alt`; decorative images get `alt=""`.
- Interactive icons need an accessible name (`aria-label`).

## Motion and media
tags: reduced-motion, autoplay, video

- Respect `prefers-reduced-motion: reduce`.
- Background video: `muted`, `playsinline`, `loop`, and never the only carrier of information.
- Provide a pause control for any looping video longer than 5 seconds.
