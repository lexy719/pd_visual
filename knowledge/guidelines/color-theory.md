# Color theory

## Aggressive / motorsport / performance
tags: aggressive, motorsport, performance, high-energy, speed, color, complementary, dark, single-accent

Scheme: **complementary** — one saturated hue against near-black. Hard edges, no softening gradients.
The mood dies if you add a second accent or a pastel.

**Apex** (F1 red) — bg `#0A0A0B` · surface `#141416` · text `#F5F5F7` · muted `#8A8A8F` · accent `#E10600`, white text
measured: text 18.2:1 · muted 5.8:1 · white-on-accent 4.97:1 · accent-on-bg 3.98:1

**Scorch** (burnt orange) — bg `#0B0908` · surface `#17120F` · text `#FAF7F5` · muted `#948A84` · accent `#FF4D00`, **near-black text** `#0B0908`
measured: text 18.6:1 · muted 5.9:1 · dark-on-accent 5.97:1 · accent-on-bg 5.97:1

**Circuit** (acid lime) — bg `#08090A` · surface `#121417` · text `#F2F4F6` · muted `#8B939B` · accent `#D7FF00`, **near-black text**
measured: text 18.1:1 · muted 6.4:1 · dark-on-accent 17.3:1 · accent-on-bg 17.3:1

Rules
- Accent is for the primary CTA, the active state, and one hairline rule. Never body text.
- Orange and lime are too light for white text — use near-black on them. Red takes white.
- Push the neutral ramp apart: near-white headings, clearly dimmer body. Mid-greys kill the tension.

## Calm / wellness / health
tags: calm, wellness, serene, health, spa, color, analogous, monochrome-accent, light, low-saturation

Scheme: **monochrome + one desaturated accent**, or a tight **analogous** pair. Saturation under ~45%.
Warmth beats brightness — the palette should feel unlit, not dim.

**Sage** — bg `#FBFAF7` · surface `#FFFFFF` · text `#1F2420` · muted `#6B7268` · accent `#3F6B4F`, white text
measured: text 15.1:1 · muted 4.75:1 (tight — do not lighten) · white-on-accent 6.13:1

**Mist** — bg `#F7F9FA` · surface `#FFFFFF` · text `#1A2226` · muted `#5E6B72` · accent `#2E7D8F`, white text
measured: text 15.3:1 · muted 5.2:1 · white-on-accent 4.72:1 · accent-on-bg 4.47:1

**Clay** — bg `#FAF6F2` · surface `#FFFFFF` · text `#2A211C` · muted `#6E625A` · accent `#8A5636`, white text
measured: text 14.7:1 · muted 5.5:1 · white-on-accent 6.06:1

Rules
- Never pure white background; an off-white (`#FBFAF7`) reads calm, `#FFFFFF` reads clinical.
- One accent, used sparingly. If it appears more than ~5 times on a page the mood is gone.
- Sage's muted at 4.75:1 has almost no headroom — darken before you lighten.

## Premium / luxury / editorial
tags: premium, luxury, editorial, refined, fashion, color, monochrome-accent, low-saturation, restraint

Scheme: **monochrome + one deep accent**. Restraint signals expense. Saturation under ~40%.
Never pure black on pure white — use warm near-black on warm off-white.

**Oxblood** — bg `#FAF7F2` · text `#1C1811` · muted `#6B6153` · accent `#7C2D2D`, white text
measured: text 16.5:1 · muted 5.7:1 · white-on-accent 9.25:1 · accent-on-bg 8.66:1

**Obsidian** (brass on black) — bg `#0F0E0C` · text `#F2EDE4` · muted `#9A9184` · accent `#C6A15B`, **near-black text**
measured: text 16.6:1 · muted 6.2:1 · dark-on-accent 7.95:1 · accent-on-bg 7.95:1

**Forest** — bg `#FBFAF8` · text `#171A12` · muted `#5F6656` · accent `#22402F`, white text
measured: text 16.9:1 · muted 5.7:1 · white-on-accent 11.4:1 · accent-on-bg 10.9:1

Rules
- Bright = cheap. If a client asks for "premium and vibrant", they mean premium; ignore the vibrant.
- The accent is a punctuation mark, not a voice. Deep accents can carry white text comfortably.
- Brass/gold is too light for white text. Use near-black on it, always.

## Playful / consumer / lifestyle
tags: playful, consumer, friendly, lifestyle, bright, color, split-complementary, triadic, light

Scheme: **split-complementary** or **triadic**, but one hue dominates and the second covers <15% of
surface area. Large radii. High lightness contrast between the pair.

**Coral** — bg `#FFFFFF` · text `#1B1A1F` · muted `#5B5A63` · accent `#FF6B5B` with **dark text** `#1B1A1F`
measured: dark-on-accent 6.18:1 · **accent-on-white 2.80:1 — FAILS the 3:1 non-text rule**

**Citrus** — bg `#FFFDF8` · text `#1F1B12` · muted `#645C4C` · accent `#FFC53D` with **dark text**
measured: dark-on-accent 10.9:1 · **accent-on-bg 1.55:1 — never a border or icon**

**Bubble** — bg `#FFFFFF` · text `#1A1520` · muted `#5C5566` · accent `#FF4FA3` with **dark text**
measured: dark-on-accent 5.89:1 · accent-on-white 3.04:1 (just passes non-text)

Rules
- **A bright accent cannot do both jobs.** It works as a *filled surface with dark text*, and fails as a
  thin border or icon on a light background. Measured, not theoretical.
- If the accent must be a border or icon on white, darken it: `#FF6B5B` → `#E8503C` (3.72:1).
- White text on a bright accent almost always fails. Reach for dark text first.

## Minimal / SaaS / product
tags: minimal, saas, clean, product, restrained, color, monochrome-accent, light

Scheme: **monochrome + one confident accent**. Colour communicates state (primary, success, error) and
nothing else. Zero decorative colour.

**Paper** — bg `#FFFFFF` · alt `#F6F7F9` · text `#0E1116` · muted `#5A6472` · accent `#2563EB`, white text
measured: text 18.9:1 · muted 6.0:1 · white-on-accent 5.17:1 · accent-on-bg 5.17:1

**Ink** — bg `#FFFFFF` · text `#0B0D10` · muted `#59616B` · accent `#0F62FE`, white text
measured: text 19.5:1 · muted 6.3:1 · white-on-accent 5.00:1

Rules
- The neutral ramp needs ≥5 steps (bg, surface, border, muted-text, text). Two greys is why a page looks amateur.
- Borders are a neutral step, never the accent.
- If you can't name what a colour *means*, delete it.

## Dark / technical / developer
tags: technical, dark, developer, tech, devtool, color, monochrome-accent, gradient-glow

Scheme: **near-black + one vivid cool accent**, plus at most one radial glow behind the hero at ≤30% opacity.
Borders are translucent white (`rgba(255,255,255,0.08)`), not solid grey — they adapt to what sits behind them.

**Void** (violet) — bg `#08090F` · surface `#12141F` · text `#ECEEF6` · muted `#9AA1B6` · accent `#6D4AFF`, white text
measured: text 17.2:1 · muted 7.7:1 · white-on-accent 5.15:1 · accent-on-bg 3.86:1
*Note: the popular `#7C5CFF` gives only 4.35:1 with white text — it fails AA for normal-size text. `#6D4AFF` is the nearest passing violet.*

**Terminal** (cyan) — bg `#0B0F0D` · surface `#121A16` · text `#E6F1EA` · muted `#8FA398` · accent `#22D3EE`, **near-black text**
measured: text 16.7:1 · muted 7.2:1 · dark-on-accent 10.7:1 · accent-on-bg 10.7:1

**Cobalt** (blue) — bg `#0A0C12` · surface `#141824` · text `#E8EBF2` · muted `#949CB0` · accent `#2F6FE4`, white text
measured: text 16.4:1 · muted 7.1:1 · white-on-accent 4.65:1 · accent-on-bg 4.20:1
*Note: `#3B82F6` (the Tailwind default) is only 3.68:1 with white text — it fails.*

Rules
- Cyan/teal accents are too light for white text. Use near-black on them.
- There is a real tension: darkening a violet/blue to pass white-text contrast pushes it *closer* to the
  near-black background, weakening `accent-on-bg`. `#6D4AFF` (5.15 / 3.86) is the balance point. Going
  darker than `#5B3DF5` drops accent-on-bg below 3:1 and the accent stops reading as an accent.
- One glow, hero only, ≤30% opacity. More and you lose headline contrast.

## Trustworthy / fintech / corporate
tags: trustworthy, fintech, corporate, institutional, finance, color, monochrome-accent, light, clean

Scheme: **monochrome + one deep blue or teal**. Boring is the point. Generous whitespace does the work
that colour would do elsewhere.

**Ledger** — bg `#FFFFFF` · alt `#F6F7F9` · text `#0E1116` · muted `#5A6472` · accent `#1D4ED8`, white text
measured: text 18.9:1 · muted 6.0:1 · white-on-accent 6.70:1 · accent-on-bg 6.70:1

**Vault** — bg `#F8FAFC` · text `#0F172A` · muted `#475569` · accent `#0E7490`, white text
measured: text 17.1:1 · muted 7.2:1 · white-on-accent 5.36:1 · accent-on-bg 5.12:1

Rules
- No gradients, no glows, no decorative shapes. Every visual element must be doing a job.
- Deep blues carry white text with margin — this is why finance defaults to them. It's not just convention.
- Semantic colours (success/error) are the only additions permitted.

## Brutalist / raw / experimental
tags: brutalist, raw, experimental, anti-design, mono, color, high-contrast

Scheme: **maximum-contrast monochrome + one alarm colour**. Pure black on off-white. Visible structure:
hard 1–2px borders, no radius, no shadow.

**Concrete** — bg `#E8E8E3` · text `#000000` · muted `#3A3A36` · accent `#FF3B00` with **near-black text**
measured: text 17.1:1 · muted 9.3:1 · dark-on-accent 4.84:1 · **accent-on-bg 2.91:1 — fails non-text 3:1**

Rules
- The alarm colour is a filled block with black text, never a hairline. If you need it as a border,
  darken to `#E03000` (3.72:1 on concrete) — but note dark text on *that* drops to 3.78:1, i.e. large text only.
- Off-white beats pure white: `#E8E8E3` gives the paper/concrete read.
- Contrast is the entire aesthetic. Never introduce a mid-grey.

## Contrast rules that always hold
tags: color, contrast, wcag, accessibility, universal, rules

- Body text vs background: **≥ 4.5:1**. Large text (≥24px, or ≥19px bold): **≥ 3:1**.
- Non-text UI (borders, icons, focus rings, chart strokes): **≥ 3:1** against what's adjacent.
- Muted/secondary text is the most common failure. Test it; it is never obviously wrong by eye.
- **Text on an accent button must be measured.** Mid-tone accents (orange, lime, cyan, yellow, coral) almost
  always fail with white text and pass with near-black. Reach for dark text before darkening the brand colour.
- **High-chroma accents cannot serve as both a filled surface and a thin border on a light background.**
  The filled use passes with dark text; the hairline use fails 3:1. Ship two tints, or don't use it as a border.
- One accent hue per page. A second colour may exist only as a semantic state.
- The neutral ramp needs ≥5 steps. Two greys is the single most reliable tell of an amateur palette.
