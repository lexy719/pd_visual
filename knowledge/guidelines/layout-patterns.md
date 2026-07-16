# Layout patterns

## split-hero
tags: layout, split-hero, hero, two-column, minimal, saas, trustworthy, fintech, technical, product

Two columns above the fold: copy + CTA on one side, a product shot / illustration / video on the other.

**When to use** — the product is *visual* and showing it beats describing it. Also when you need a primary
and secondary CTA to coexist without competing with an image behind the text.
**Suits** — minimal/saas, trustworthy/fintech, technical/developer, playful/consumer.
**Ratio** — 5:7 or 1:1. Never 1:2; the copy column collapses below a readable measure.
**Pitfalls** — the image side becomes a dumping ground. One subject, cropped hard. If the media is a bare
screenshot, frame it (bezel, angle, shadow) or it reads as a bug report. Stacks copy-first on mobile, always.

## centered-hero
tags: layout, centered-hero, hero, symmetrical, minimal, saas, technical, developer, premium

Single centred column: eyebrow, headline, subhead, one or two CTAs, then media below the fold line.

**When to use** — the promise is a *sentence*, not a picture. The default for developer tools and any product
whose value is conceptual. Pairs with a radial glow (`color-theory#dark-technical-developer`).
**Suits** — minimal/saas, technical/developer, premium (with a serif display).
**Pitfalls** — never centre more than two lines of subhead. One primary CTA; a second must be visually
subordinate (ghost). Centred *everything* down the whole page is the classic generated-site failure —
centre the hero, then go left-aligned.

## full-bleed-video
tags: layout, full-bleed-video, hero, video-bg, aggressive, motorsport, premium, fashion, immersive

Video or image fills the viewport edge-to-edge; content sits over it, bottom-anchored.

**When to use** — the brand *is* motion, texture or atmosphere: sport, automotive, fashion, travel, food.
**Suits** — aggressive/motorsport, premium/luxury, playful/lifestyle.
**Required** — a gradient scrim (`linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.25) 60%)`), a `poster`
still, `muted playsinline loop`, and a reduced-motion fallback to the poster.
**Pitfalls** — legibility is not optional; verify contrast against the *lightest frame*, not a lucky still.
Video over ~3MB is a bounce. Content bottom-anchored, not centred — centred text over video reads as a stock ad.

## asymmetric-grid
tags: layout, asymmetric-grid, grid-break, editorial, premium, brutalist, aggressive, experimental

Columns of unequal width, offset baselines, elements hanging into the margin.

**When to use** — one item must dominate, or the asymmetry itself encodes tension/motion.
**Suits** — premium/editorial, aggressive/motorsport, brutalist/raw.
**Pitfalls** — asymmetric ≠ arbitrary; every offset still lands on the spacing scale
(`spacing#when-to-break-the-grid-on-purpose`). Break *one* thing per page. Never use it where the user is
comparing options — asymmetry between pricing tiers reads as manipulation.

## bento-grid
tags: layout, bento-grid, features, grid, cards, minimal, saas, technical, developer, product

Grid of unequal cells; cell size maps to feature importance. One hero cell per grid.

**When to use** — showcasing 4–8 features of unequal weight. Equal cards say "we had six things";
unequal cells say "this one matters most".
**Suits** — minimal/saas, technical/developer, playful/consumer.
**Pitfalls** — exactly one dominant cell, or the hierarchy collapses back to a boring grid. Keep the gap
uniform (20–24px) even though the cells aren't. Collapses to a single column below 900px — verify the
reading order still makes sense.

## magazine-editorial
tags: layout, magazine-editorial, editorial, premium, luxury, fashion, calm, long-form, asymmetric

Multi-column text, pull-quotes hanging into margins, large duotone or full-bleed imagery between passages,
generous leading, a strict baseline grid underneath the apparent freedom.

**When to use** — long-form content that must feel *authored*: brand stories, essays, lookbooks, case studies.
**Suits** — premium/editorial, calm/wellness, fashion.
**Pitfalls** — the freedom is only credible on top of a rigid baseline grid. Body measure stays 60–75ch even
in a wide layout — that's what the margins are for. Requires real photography; it exposes stock instantly.

## dashboard-sidebar
tags: layout, dashboard-sidebar, dashboard, app-shell, technical, developer, trustworthy, fintech, dense

Persistent left nav (200–280px), optional right rail, dense scrollable content region.

**When to use** — an application, not a page. Repeated navigation between many equal-weight destinations.
**Suits** — technical/developer, trustworthy/fintech.
**Spacing** — switch to the 4px base (`spacing#technical-developer-spacing`). The content region carries its
own tighter rhythm than the shell.
**Pitfalls** — the sidebar is navigation, not a feature list; if it has more than ~7 top-level items it needs
grouping. Collapses to a drawer under 900px — the drawer trigger must be reachable by thumb.

## sticky-scroll-narrative
tags: layout, sticky-scroll-narrative, scroll, pinned, storytelling, technical, premium, aggressive, product

One side pins while the other scrolls; the pinned side changes state as you pass each step.

**When to use** — a sequence with a *fixed subject*: how it works, a product walkthrough, a timeline.
**Suits** — technical/developer, premium, aggressive/motorsport.
**Pairs with** — `motion-patterns#sticky-pin-narrative`.
**Pitfalls** — keep total pinned scroll under ~2 viewport heights or it feels like a trap. Must degrade to a
plain vertical stack on mobile and under `prefers-reduced-motion` — never pin on touch.

## horizontal-scroll-gallery
tags: layout, horizontal-scroll-gallery, gallery, scroll, aggressive, motorsport, playful, fashion, premium

A track of items translating on X, driven by vertical scroll or drag.

**When to use** — the collection *is* the content (a lineup, a portfolio, a season) and the horizontal gesture
reinforces the brand (speed, film, runway).
**Suits** — aggressive/motorsport, premium/fashion, playful/lifestyle.
**Pairs with** — `motion-patterns#horizontal-pan-on-scroll`.
**Pitfalls** — hijacking scroll is hostile if the gesture means nothing. Always expose a real scrollbar or
drag affordance. Never trap keyboard users; each item must be tab-reachable.

## z-pattern-landing
tags: layout, z-pattern-landing, alternating, features, conversion, minimal, saas, trustworthy, playful

Alternating text/media rows down the page (left-right-left), each row one benefit.

**When to use** — 3–5 substantial features that each need an image and a paragraph. The workhorse of
conversion pages, and correctly so.
**Suits** — minimal/saas, trustworthy/fintech, playful/consumer.
**Pitfalls** — more than 5 rows and it becomes a slog; cut features, don't add rows. Alternation must be
visible (don't alternate if the media is abstract shapes). On mobile every row stacks the same way —
text first, always, or the rhythm inverts and reads as an error.

## card-gallery
tags: layout, card-gallery, cards, grid, listing, uniform, minimal, saas, trustworthy, playful, consumer

Uniform grid of equal cards: pricing, team, blog, catalogue.

**When to use** — the user is **comparing** or **scanning** items of equal weight. Keep the grid
(`spacing#when-to-break-the-grid-on-purpose`); any asymmetry here reads as a mistake or a trick.
**Suits** — everything except brutalist. The neutral choice.
**Pitfalls** — equal cards means *equal*: same image ratio, same title length budget, same CTA. One card may
be visually promoted (pricing's "most popular") but only via border/badge — never a size change, which
breaks the baseline. If items are genuinely unequal, use `bento-grid` instead.

## stacked-void
tags: layout, stacked-void, brutalist, raw, experimental, anti-design, zero-gutter

Full-width blocks stacked with zero gutters, hard borders, no radius, text colliding with edges.

**When to use** — the aesthetic is the argument: portfolios, art, manifestos, deliberately anti-commercial work.
**Suits** — brutalist/raw only.
**Pitfalls** — brutalism is a discipline, not an excuse: contrast, focus states and tab order still have to be
right (`accessibility#focus-and-keyboard`). Zero padding is a choice; unusable tap targets are a bug.
