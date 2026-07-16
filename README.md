# web-design-agent

Local-first web design agent. **Phase 1 only: knowledge base + retrieval.**
No generation agent, no Electron UI, no editing layer — by design. Retrieval quality is
verified first, because retrieval + accumulated taste is the moat, not raw model power.

## Requirements

- Node 20+
- [Ollama](https://ollama.com) running locally with the embedding model:
  ```
  ollama pull nomic-embed-text
  ```

## Setup

```bash
npm install
npm run ingest     # FULL rebuild: embeds /knowledge/** into knowledge/knowledge.db
```

Use the full rebuild only on a fresh clone or after changing chunking/embedding logic.
To add or edit one file, use the incremental path — it does **not** re-embed the corpus.

## Authoring workflow

**Add a component** — writes the JSON, ingests just that file, and proves it's retrievable:

```bash
npm run add:component -- --name "Split hero with screenshot" --category hero \
    --tags "light,saas,split,screenshot" --code ./snippet.html \
    --notes "What it's for, what breaks it" --source-url "https://21st.dev/..."

# or pipe the snippet on stdin
npm run add:component -- --name "Glass card" --category card --tags "glass,dark" < snippet.html
```

`--id` is derived (`hero-003`) unless you pass one. `--force` overwrites. `--no-ingest` just
writes the file. Afterwards it runs a retrieval probe and prints the new component's rank —
if it isn't top-5, the name/tags are wrong and it would never be retrieved.

**Scaffold a critique** — blank `what_works` / `why` / `tags` for you to fill by hand:

```bash
npm run new:critique -- --url https://landonorris.com
npm run new:critique -- --url https://linear.app --site "Linear" --screenshot ~/shots/linear.png
```

A screenshot is copied into `knowledge/media-refs/` so the critique is self-contained.
It deliberately does **not** ingest: an unfilled scaffold has nothing to embed, and the
ingester refuses it (`what_works is empty`) so it can't poison the index. Once filled:

```bash
npm run ingest:file -- knowledge/critiques/lando-norris.json
```

**Incremental ingest (upsert one file)** — works for any knowledge file:

```bash
npm run ingest:file -- knowledge/components/hero-003.json
npm run ingest:file -- knowledge/guidelines/color-theory.md
```

### Single-item ingest does not re-embed the corpus

Verified, not assumed. `ingest:file` deletes only the rows whose `source_path` matches, then
embeds that file's chunks. Cost is O(chunks in the file), not O(corpus). Measured on a
37-chunk store, re-ingesting one component:

```
updated (replaced 1 row): knowledge/components/hero-001.json
  embedded 1 chunk in 406ms — nothing else re-embedded

rows re-written:       1
rows untouched:        36   (same id, same ingested_at)
vectors that changed:  0    (sha1 of the stored embedding blob)
```

`docs.ingested_at` is the audit trail: after a single-file ingest, only that file's rows
carry a new timestamp. This is what keeps authoring fast once there are hundreds of entries.

## Query the knowledge base

```bash
# plain ranked search across everything
npm run query -- "hero section, motorsport, dark, video background"

# restrict to one kind
npm run query -- "pricing table" --kind component --k 5

# what the AGENT LOOP retrieves for one section:
# components matched on structure, guidelines + critiques matched on mood
npm run query -- "hero with video background" --grouped --mood "motorsport, aggressive, dark"

# show the text that was actually embedded
npm run query -- "contrast on video" --full
```

Flags: `--kind component|guideline|critique|media-ref`, `--k N`, `--grouped`, `--mood "tags"`, `--full`.

## The quality gate

```bash
npm run eval
```

14 hand-written queries with the doc we expect to surface. **Do not build the generation
agent until this passes convincingly** (it exits non-zero under 80%). Add cases as you add
real components and critiques — a query set that only matches seed data proves nothing.

Current: **14/14 (100%)**, all at rank 1.

## Tag vocabulary

Every guideline section carries a `tags:` line as the first line of its body. Tags are the retrieval
spine: one mood query must pull matching guidance from **all five** guideline files at once.

**Mood tags (canonical — do not invent variants).** Each has fixed aliases that ride along in the same
`tags:` line so synonym queries still hit:

| mood | aliases to include |
|---|---|
| `aggressive` | motorsport, performance, high-energy, speed |
| `calm` | wellness, serene, health, spa |
| `premium` | luxury, editorial, refined, fashion |
| `playful` | consumer, friendly, lifestyle, bright |
| `minimal` | saas, clean, product, restrained |
| `technical` | dark, developer, tech, devtool |
| `trustworthy` | fintech, corporate, institutional, finance |
| `brutalist` | raw, experimental, anti-design, mono |

**Domain tags** (exactly one per section): `color`, `typography`, `spacing`, `layout`, `motion`.

**Cross-cutting**: `universal` (applies to every mood), `rules`, `accessibility`, `contrast`.
Plus free technique tags (`complementary`, `type-scale`, `grid-break`, `scroll-reveal`, …).

Coverage is verifiable — every canonical mood resolves to ≥1 section in each of the five files
(currently 54 sections, 82 mood-tag hits, 0 gaps). If you add a mood, add a section for it in **all five**
files or a mood query will silently return partial guidance.

## Why mood is a separate query

Measured, not guessed. For `"hero section, motorsport, dark, video background"` the
structural words swamp the mood signal and you retrieve the *SaaS* colour rules and
*parallax* motion pattern. Splitting the query — components on structure, guidelines and
critiques on the mood/tag profile — puts `Aggressive / motorsport` (0.74) and
`Scroll-linked horizontal pan` back at the top. `retrieveForSection(section, { mood })`
does this; the agent's Plan step must produce that mood profile.

## Layout

```
knowledge/
  components/*.json              one component per file (see engine/types.ts: ComponentDoc)
  guidelines/*.md                rulebooks — each `## section` becomes its own retrievable chunk
  layout-patterns/*.md           narrative and compositional archetypes that shape the page story
  storytelling-patterns/*.md    pattern-level guidance for reveal-before-explain, escalation, and similar flows
  hierarchy-patterns/*.md       focal-point and information hierarchy guidance
  visual-rhythm/*.md            rhythm and contrast patterns for section-to-section pacing
  ux-psychology/*.md             trust, persuasion, and cognitive-load guidance
  critiques/*.json              your design judgment, structured (see CritiqueDoc) — highest-value data
  media-refs/*.md               asset sourcing rules (currently: manual, see sourcing.md)
  knowledge.db                  generated; gitignored
engine/
  ingest/build.ts       file → rows (chunking + embed_text). Shared by both ingest paths.
  ingest/ingest.ts      full rebuild
  ingest/incremental.ts single-file upsert (the library)
  ingest/ingest-file.ts single-file upsert (the CLI)
  tools/add-component.ts  quick-add + ingest + retrieval probe
  tools/new-critique.ts   scaffold a critique from a URL
  retrieval/          embed + sqlite-vec store + query layer + CLI + eval
  agent/              (empty — phase 2)
  editing/            (empty — phase 3)
app/                  (empty — Electron UI, later)
projects/             one folder per generated site, each with its own media/
logs/critique-log.jsonl   append-only feedback log (the flywheel)
```

## Notes on the implementation

- **Never embed raw component code.** Syntax tokens swamp the vector and destroy semantic
  matching. We embed `name + category + tags + notes` and return the code in the payload.
- **Pattern guidance is treated as a first-class design layer.** The planner now selects narrative
  and visual patterns before it chooses a section sequence so the page can be shaped around a story,
  not just a stack of section types.
- **Guidelines are chunked per `##` heading** so a single rule is retrievable, not a whole file.
- **nomic-embed-text task prefixes** are used correctly: documents are embedded as
  `search_document:`, queries as `search_query:`. This measurably improves ranking.
- **sqlite-vec** with `distance_metric=cosine`, so `score = 1 - distance` and reads as a
  similarity in 0..1. Single portable file, no server process.
- Vectors bind as `BigInt` rowid + raw float32 `Buffer` — sqlite-vec rejects anything else.

## Adding knowledge

Components (`knowledge/components/hero-003.json`):

```json
{
  "id": "hero-003",
  "name": "Split hero with product screenshot",
  "category": "hero",
  "tags": ["light", "saas", "split", "screenshot"],
  "code": "<section>…</section><style>…</style>",
  "source_url": "https://21st.dev/…",
  "license": "MIT",
  "notes": "What it's for, what breaks it, what to pair it with."
}
```

Critiques (`knowledge/critiques/some-site.json`) — the flywheel. Be specific in `why`:
that's the part the agent can't derive on its own.

```json
{
  "site": "Some site",
  "url": "https://…",
  "what_works": ["Concrete observation"],
  "why": ["The principle behind it — this is the valuable half"],
  "tags": ["mood", "technique"]
}
```

Then `npm run ingest && npm run eval`.

## Next (do not start until eval is convincing on real data)

1. Populate 10–15 real components and 3–5 real critiques of sites you actually admire.
2. Extend `engine/retrieval/eval.ts` with queries against *that* data.
3. Only then: the agent loop (`plan → retrieve → generate → self-critique → refine`).
