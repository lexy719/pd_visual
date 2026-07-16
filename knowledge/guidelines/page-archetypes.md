# Page archetypes

Whole-page skeletons: which sections a landing page should have, in what order, for a given
kind of product. Distinct from `layout-patterns.md` (which styles a single section) — these
prescribe the **section sequence**. The planner retrieves the best-matching archetype for the
brief and builds the section list from it, so different briefs produce different structures.
Section types are drawn from the fixed vocabulary: nav, hero, logos, features, showcase,
testimonial, pricing, cta, footer.

## developer-tool-doc-forward
tags: layout, archetype, page-structure, technical, minimal, developer, saas, trustworthy

For CLIs, APIs, SDKs, infra, and dev tools — an audience that trusts capability and code, not
marketing. Proof-of-work over persuasion.

**Section sequence** — nav → hero → logos → features → showcase → cta → footer.
**Shape each section** — hero leads with a terse value line and a real code snippet or terminal,
not a stock photo; logos are a quiet "trusted by" strip; features is a bento-grid of capabilities;
showcase is a concrete integration/code walkthrough; cta is "start building" with an install
command. **Omit pricing and testimonials** — this audience reads docs, not quotes; a pricing
section mid-funnel reads as sales pressure. Keep it dense, monospace-friendly, minimal chrome.
**Why** — developers evaluate by trying; the page's job is to get them to the code fastest.

## editorial-brand-story
tags: layout, archetype, page-structure, editorial, premium, calm, fashion, luxury, brand

For brands where the *feeling* is the product — fashion, hospitality, spirits, design studios,
culture. A narrative you scroll through, not a feature comparison.

**Section sequence** — nav → hero → showcase → testimonial → showcase → cta → footer.
**Shape each section** — nav is bare (wordmark + 2-3 links); hero is a full-bleed image or one
oversized typographic statement; the two showcase blocks are alternating magazine-editorial
beats (image + long-form prose) that tell the story in acts; testimonial is a single press pull-
quote, not a grid of five; cta is understated ("Discover", "Book"). **Omit features, pricing,
and logos** — a spec grid or price table breaks the spell and cheapens a brand page.
**Why** — the buying decision here is emotional; structure should read like an editorial, pacing
image and text, never like a SaaS sheet.

## app-landing
tags: layout, archetype, page-structure, playful, trustworthy, product, consumer, mobile, saas

For consumer apps and products sold on the experience — mobile apps, prosumer tools, anything
with a screen worth showing. Show the thing working, then walk through how.

**Section sequence** — nav → hero → features → showcase → testimonial → pricing → cta → footer.
**Shape each section** — hero centers a device/app mockup beside the value prop; features is a
tight 3-up of core benefits (icon + line); showcase is a "how it works" step sequence (1-2-3, or
a sticky-scroll narrative); testimonial is a 2-3 card social-proof row with real faces; pricing
is simple (free + one paid). **Include pricing** — consumers decide on the page. **Skip a logos
strip** unless there's genuine press. **Why** — the product sells itself visually; lead with the
screenshot, prove ease-of-use with steps, then remove friction to sign up.

## product-led-saas
tags: layout, archetype, page-structure, trustworthy, technical, premium, saas, b2b, conversion

For B2B SaaS and platforms where the buyer needs to justify a decision — a conversion funnel
built on value prop, social proof, and a clear price.

**Section sequence** — nav → hero → logos → features → testimonial → pricing → cta → footer.
**Shape each section** — hero pairs a sharp value proposition with a product-UI screenshot; logos
is a prominent "trusted by" row (this audience weights it heavily); features is a bento-grid of
differentiators tied to outcomes; testimonial is a credible customer result with a metric;
pricing is tiered (3 plans, one highlighted); cta is "start free trial". **Pricing is required
and prominent** — a B2B buyer will not convert without it. **Why** — the page must move a rational
buyer from value → proof → price → action, in that order.
