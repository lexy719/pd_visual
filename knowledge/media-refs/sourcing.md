# Media sourcing

## Decision: manual first, Vite public/ convention
tags: sourcing, media, assets, manual, phase-1, vite, react

The generation target is **plain React + Vite** (not Next.js). Automated media sourcing is its
own project. Phase 1 is **manual**:

1. Create the project: `/projects/{name}/public/`
2. Drop assets in yourself: `hero.mp4`, `hero-poster.jpg`, `shot-01.jpg`, …
3. The agent references them by **root-absolute path**: `src="/hero.mp4"`.
   Vite serves everything in `public/` from `/`, unprocessed and unhashed. Do **not** write
   `./public/hero.mp4` or `../public/...` — that only works by accident in dev and breaks on build.
4. Assets that should be hashed/bundled (imported by a component) live in `src/assets/` and are
   imported: `import hero from './assets/hero.jpg'`. Reach for this only when the asset is
   component-scoped; page media belongs in `public/`.
5. The agent must NEVER invent a remote image URL. If an asset is missing it emits a placeholder
   block with the exact filename it expects, and says so in its output.

Rationale: a generated page that 404s half its images is worse than one with honest placeholders,
and stock APIs (rate limits, keys, licensing) are a distraction while the retrieval and generation
loop is still being proven.

Note: `next/image` is **not available** — this is plain React. Use `<img>` with explicit
`width`/`height`, and hand-roll `loading="lazy"` / `decoding="async"`.

## Naming conventions
tags: naming, conventions, files, public

Relative to `/projects/{name}/public/`, referenced as `/{filename}`:

- `hero.mp4` / `hero-poster.jpg` — hero background video + its required poster frame
- `shot-01.jpg` … `shot-NN.jpg` — product screenshots, numbered in page order
- `portrait-{name}.jpg` — testimonial/author avatars, square, ≥ 400px
- `logo-{brand}.svg` — client/partner logos for the trust strip
- `og.jpg` — 1200×630 social preview
- `favicon.svg` — served at `/favicon.svg`

## Requirements the agent must respect
tags: requirements, video, poster, performance, react

- Any background video needs a `poster` still — it is the reduced-motion and slow-connection fallback.
- Hero imagery ships at 1600–1920px wide, ≤ 400KB. Everything else ≤ 200KB.
- Every `<img>` gets explicit `width`/`height` (or `aspect-ratio`) to prevent layout shift.
- Decorative images get `alt=""`; meaningful ones get real alt text.
- Prefer `loading="lazy" decoding="async"` on everything below the fold. React gives you nothing
  here for free — unlike `next/image`, there is no automatic sizing, format negotiation or lazy loading.

## Phase 2 (not now)
tags: future, api, pexels, unsplash

If/when this is automated, prefer Pexels or Unsplash **at generation time**, downloading into
`/projects/{name}/public/` so the project stays self-contained and offline-renderable.
Never hotlink. Record the source URL + license in `/projects/{name}/public/CREDITS.md`.
