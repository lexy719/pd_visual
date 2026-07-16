# Spacing

## Base scale — 4px and 8px systems
tags: spacing, scale, 4px-grid, 8px-grid, tokens, consistency, universal

Pick one base and derive everything. Arbitrary values (`13px`, `27px`) are what make a layout feel unresolved.

- **8px base** (default): `4, 8, 16, 24, 32, 48, 64, 96, 128, 160`. The 4 is the only sub-base step, for
  optical nudges (icon vs label). Use for marketing sites, most moods.
- **4px base** (dense): `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Use for dashboards, data-dense UI,
  technical/developer products where 8px jumps waste vertical space.

Rules
- Every padding, margin and gap snaps to the scale. No exceptions that aren't documented as one.
- Related items get **one** step; unrelated groups get **two or more**. Proximity is how grouping is encoded —
  it does more work than borders or background colour.
- Space **above** a heading is always larger than the space below it. That's what binds a heading to its content.
  Getting this backwards is the most common spacing error in generated pages.
- Vertical rhythm compounds: if every gap is one step too tight, the page reads cheap and nobody can say why.

## Container and grid
tags: spacing, container, max-width, grid, gutters, universal

- Content container: **1080–1200px**. Beyond ~1280px the eye loses the line and scanning breaks down.
- Gutters: 24px mobile, 32–48px desktop.
- 12-column grid. Most sections resolve to 3 or 4 equal columns, collapsing to 1 below 900px.
- Card grids: `gap: 20–24px`. Tighter reads crowded; wider and the group stops reading as a group.
- Full-bleed elements break the container deliberately — see `layout-patterns#full-bleed-video`.

## Section padding
tags: spacing, section-padding, whitespace, breathing-room, universal

Cramped vertical rhythm is the number one tell of a generated page.

- Desktop: **96–140px** top and bottom. Default to `112px`.
- Mobile: 64–80px.
- The hero always gets more than any other section (140–180px top).
- If a page "looks cheap", the fix is almost always more vertical space — not more decoration.

## Inside components
tags: spacing, card-padding, internal-spacing, density, buttons, universal

- Card padding: 24–32px. Buttons: 11–14px vertical, 20–26px horizontal.
- Heading→body gap inside a block: 8–14px. Block→block: 24–40px.
- Icon→label gap: 8px. Never 4 (cramped), never 12 (dissociated).
- Tap targets ≥44×44px. Achieve it with padding, not margin — margin doesn't grow the target.

## When to break the grid on purpose
tags: spacing, grid-break, asymmetry, intentional, layout, universal, editorial

Consistency is the default because it's invisible. Break it only when the break *is* the message.

Break the grid when:
- **One element must dominate** — a hero image bleeding past the container, a pull-quote hanging into the
  margin. Editorial and premium moods live on this.
- **You're encoding motion or tension** — offset columns, a diagonal, an element half-out of frame.
  Aggressive/motorsport and brutalist moods use it structurally.
- **The content is genuinely irregular** — a bento grid where cell size maps to feature importance.
  Equal cards read as "we had six things"; unequal cells read as "this one matters most".

Keep the grid when:
- The user is **comparing** things (pricing tiers, feature cards, spec tables). Any asymmetry here reads as
  a mistake or a trick.
- The content is **scannable/repetitive** (docs, listings, dashboards, settings).
- The mood is **trustworthy/fintech** — deviation costs credibility and buys nothing.
- You cannot articulate what the break communicates. "It looked boring" is not a reason; boring is often correct.

Rules
- Break **one** thing per page, hard. Two breaks and neither reads as intentional — it reads as no grid at all.
- A break must still land on the spacing scale. Asymmetric is not the same as arbitrary.
- If the break disappears at mobile width, it wasn't structural — it was decoration.

## Density by mood
tags: spacing, density, mood, aggressive, calm, premium, playful, minimal, technical, trustworthy, brutalist

| mood | section padding | internal density | character |
|---|---|---|---|
| premium / editorial | 140–180px | loose (32px card) | air is the product |
| calm / wellness | 128–160px | loose (32px) | unhurried, nothing adjacent |
| minimal / saas | 96–128px | standard (24–28px) | disciplined |
| playful / consumer | 96–120px | standard, big radii | friendly, not precious |
| trustworthy / fintech | 96–120px | standard | quiet, conventional |
| technical / developer | 80–112px | dense (20–24px, 4px base) | information-first |
| aggressive / motorsport | 96–140px, uneven | tight internals | big section jumps, tight blocks |
| brutalist / raw | 0 or 160px | zero (`padding: 0`) | collision or void, nothing between |

## Aggressive / motorsport spacing
tags: aggressive, motorsport, performance, high-energy, spacing, tension, contrast

- Large gaps *between* sections, tight internals. The contrast between void and density creates the tension.
- Full-bleed media breaks the container; text stays inside it. That collision is the effect.
- Hard edges: `border-radius: 0–4px`. Rounded corners bleed the aggression out of the layout.

## Premium / calm spacing
tags: premium, luxury, editorial, calm, wellness, serene, spacing, generous, whitespace

- The most generous of any mood: 140–180px sections, 32px+ card padding, 65ch measure.
- Whitespace is the single largest signal of expense. A gradient can't buy what space buys.
- Let one element hang into the margin (pull-quote, image) — the asymmetry needs the surrounding air to read.

## Technical / developer spacing
tags: technical, dark, developer, tech, devtool, spacing, dense, 4px-grid, dashboard

- Switch to the **4px base**. 8px jumps waste vertical space when the page is mostly information.
- Section padding 80–112px; card padding 20–24px.
- Density is a feature — but the *scale* must still be strict, or dense becomes messy.
- Dashboards: see `layout-patterns#dashboard-sidebar`; the content region gets its own tighter rhythm.

## Brutalist / raw spacing
tags: brutalist, raw, experimental, anti-design, spacing, zero-gutter, collision

- Two states only: `padding: 0` (collision) or enormous void. Nothing in between.
- Zero gutters — elements touch. Borders do the separating.
- The scale still exists; you're just using only its extremes. Arbitrary values are still wrong here.
