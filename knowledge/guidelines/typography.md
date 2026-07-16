# Typography

## Type scale ratios by mood
tags: typography, type-scale, ratio, hierarchy, universal, drama

The ratio between adjacent steps, and the hero-to-body jump, encode the mood before a word is read.
A timid scale is the single most common reason a page "looks generic".

| mood | step ratio | hero-to-body | character |
|---|---|---|---|
| aggressive / motorsport | 1.500–1.618 | 5–7× | violent jumps, nothing in between |
| brutalist / raw | 1.618+ | 6–9× | extreme, deliberately uncomfortable |
| premium / editorial | 1.333–1.414 | 4–5× | confident, wide gaps, lots of air |
| playful / consumer | 1.250–1.333 | 3–4× | bouncy but readable |
| minimal / saas | 1.250 | 3.5–4× | disciplined, predictable |
| technical / developer | 1.200–1.250 | 3–3.5× | dense, information-first |
| trustworthy / fintech | 1.200 | 2.5–3× | quiet, nothing shouts |
| calm / wellness | 1.200 | 2.5–3× | subtle, almost no drama |

Rule: pick the ratio, then generate every size from it. Hand-picked sizes never cohere.
Tighten `letter-spacing` as size grows (`-0.02em` to `-0.04em` at display sizes); loosen it for small caps
(`+0.08em`). Big text needs tighter leading: 1.05–1.2 display, 1.5–1.65 body.

## Pairing rules — display + body
tags: typography, font-pairing, universal, display, body

- **One family, multiple weights is the safest premium choice.** Two families is already a risk you must justify.
- Pair on *contrast of category*, never contrast of personality: serif display + neutral sans body works;
  two sans-serifs of similar character reads as a mistake, not a decision.
- The body font is chosen for stamina at 16px, not for how the specimen looks at 72px.
- Combos that reliably work:
  - Fraunces / Playfair (display serif) + Inter (body) — editorial, premium
  - Inter alone, 400/600/800 — saas, minimal, technical
  - Archivo or Anton (condensed display) + Inter — aggressive, motorsport
  - GT Sectra / Newsreader + Inter — calm, wellness, considered
  - Space Grotesk + IBM Plex Mono — technical, developer
  - Helvetica/Arial at extreme weights, alone — brutalist
- Never more than two families. A third is always a failure of nerve.

## Serif, sans, or mono — choosing by tone
tags: typography, serif, sans, mono, tone, universal

- **Serif** — heritage, editorial, considered, expensive. Signals the content is worth reading slowly.
  Use for premium, editorial, calm, wellness, fashion. High-contrast (Didone) serifs read as fashion;
  low-contrast (old-style) serifs read as trustworthy.
- **Sans** — modern, neutral, efficient. The default for saas, minimal, technical, trustworthy, playful.
  Geometric sans (Poppins, Futura) reads friendly; neutral grotesque (Inter, Helvetica) reads professional;
  condensed sans reads urgent and fast.
- **Mono** — machine, precision, code. Use for labels, data, code, and eyebrow text — never body copy.
  In technical/developer contexts a mono eyebrow instantly signals the audience.
- **Uppercase** — only for labels and eyebrows, ≤20 characters, with `letter-spacing: 0.08em`. Uppercase body
  copy destroys reading speed; uppercase headlines are a motorsport/brutalist device, not a default.

## Line length and rhythm
tags: typography, measure, line-height, readability, universal, body

- Body copy: **60–75 characters** (`max-width: 65ch`). Full-width paragraphs are the fastest way to look broken.
- `line-height`: 1.5–1.65 body, 1.05–1.2 display. As size goes up, leading comes down.
- Never centre more than ~2 lines of body copy.
- Body text is never below 400 weight or below 15px. Emphasis comes from weight and size — not italics,
  never underline (that means link).

## Aggressive / motorsport typography
tags: aggressive, motorsport, performance, high-energy, speed, typography, condensed, uppercase, large-type

- Display: condensed or wide sans at 800–900 weight. `clamp(3rem, 8vw, 7rem)`, `letter-spacing: -0.04em`, `line-height: 0.95`.
- Hero-to-body 5–7×. The gap *is* the aggression. Nothing lives in the middle of the scale.
- Uppercase eyebrows in mono or condensed, `0.12em` tracking, in the accent colour.
- Numbers matter (lap times, specs) — use tabular figures (`font-variant-numeric: tabular-nums`).
- Ragged-right, never justified. Justification calms the page down.

## Calm / wellness typography
tags: calm, wellness, serene, health, spa, typography, serif, subtle-scale

- Low-contrast serif or humanist sans. Weight 400–600 only; 800 is a shout.
- Step ratio 1.2, hero-to-body 2.5–3×. Nothing should jolt.
- Generous leading (1.65–1.75 body). Longer measure than usual is acceptable here (70–75ch).
- Sentence case everywhere. No uppercase, no tracking games.

## Premium / editorial typography
tags: premium, luxury, editorial, refined, fashion, typography, serif, display

- High-contrast serif display + neutral sans body. This is the one place a two-family pairing is mandatory.
- Step ratio 1.333–1.414, hero-to-body 4–5×. Air around the headline does as much work as the type.
- Set the display at 500–600 weight, not 800 — restraint reads as expensive; heaviness reads as loud.
- Drop caps, small caps, and old-style figures are permitted here and nowhere else.

## Playful / consumer typography
tags: playful, consumer, friendly, lifestyle, bright, typography, geometric, rounded

- Geometric or rounded sans, 500–800. Rounded terminals do the friendliness; you don't need a novelty face.
- Step ratio 1.25–1.333, hero-to-body 3–4×.
- Slightly looser leading (1.6–1.7) and shorter measure (55–65ch) — it reads as approachable.
- One expressive moment maximum (an oversized word, a colour swap mid-sentence). Two is chaos.

## Minimal / SaaS typography
tags: minimal, saas, clean, product, restrained, typography, sans, inter

- One neutral grotesque, weights 400/500/600/800. Inter, Geist, or Helvetica. Nothing else.
- Step ratio 1.25, hero-to-body 3.5–4×. `letter-spacing: -0.03em` on the hero, `-0.02em` on section heads.
- Body 16–18px, `line-height: 1.6`, `max-width: 65ch`.
- Every heading is sentence case. Title Case is a marketing tell.

## Dark / technical / developer typography
tags: technical, dark, developer, tech, devtool, typography, mono, dense

- Neutral sans body + mono for labels, eyebrows, code, and data. The mono is the audience signal.
- Step ratio 1.2–1.25, hero-to-body 3–3.5×. Information density is a feature, not a failure.
- On dark backgrounds, drop body weight to 400 and *raise* the text colour rather than bolding —
  bold text on dark bleeds and reads heavier than intended.
- Code is a first-class design element: framed, syntax-highlighted, real. Fake code destroys credibility.

## Trustworthy / fintech typography
tags: trustworthy, fintech, corporate, institutional, finance, typography, sans, quiet

- One neutral sans. Weight 400/600. Nothing above 700.
- Step ratio 1.2, hero-to-body 2.5–3× — the smallest jump of any mood. Nothing shouts, because shouting
  is what an untrustworthy site does.
- Tabular figures everywhere numbers appear. Misaligned digits read as sloppy accounting.
- Long-form legal/body copy is a design surface here, not an afterthought — set it properly at 65ch.

## Brutalist / raw typography
tags: brutalist, raw, experimental, anti-design, mono, typography, extreme-scale

- Helvetica/Arial at 900, or a mono, at extreme sizes. No display face, no pairing subtlety.
- Step ratio 1.618+, hero-to-body 6–9×. The scale should be uncomfortable.
- Text sits hard against borders — no padding where padding is expected.
- Underlines, visible link states, default focus rings — the browser's own vocabulary, unstyled, on purpose.
