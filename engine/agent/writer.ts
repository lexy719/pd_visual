/**
 * Materialize a generated page into the Vite preview app (reused from last session):
 *   src/generated/lib-<id>.tsx     — library components used, verbatim from the knowledge base
 *   src/generated/section-<i>.tsx  — each generated section (a wrapper or a scratch section)
 *   src/App.tsx                    — deterministic composition (agent wires this, not the model)
 *   src/lib, src/hooks             — registry files the used components need
 *
 * Two safety rails against imperfect model output:
 *   - import sanitization: a section may only import allowed modules; anything else is stripped,
 *     so a hallucinated dependency can't break the whole build.
 *   - per-section error boundary: a runtime error in one section shows a fallback, the rest renders.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { ComponentDoc } from '../types.js'
import type { GenerateResult } from './generate.js'
import { SCALE_ASPECT } from './art-direction.js'
import type { ArtDirection, InteractionSpec, LayoutSpec, Palette, TypographySpec } from './art-direction.js'
import type { Plan, SectionResult } from './types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP = join(ROOT, 'preview', 'app')
const SRC = join(APP, 'src')
const GENERATED = join(SRC, 'generated')
const REGISTRY = join(ROOT, 'preview', 'registry')
const QUARANTINE = join(ROOT, 'logs', 'quarantine')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * Dump a quarantined section's source so the failure is diagnosable AFTER the fact.
 *
 * Without this the stub overwrites the only copy of the broken code and the evidence is gone — a
 * quarantine becomes an esbuild message with nothing behind it, which is exactly the dead end that
 * made one of these undiagnosable. Writes what the writer actually tried to parse (post-transform),
 * plus each tier's raw attempt when generation recorded them. Best-effort: never fail a run over it.
 */
function dumpQuarantine(label: string, finalCode: string, err: string, s: SectionResult): string | undefined {
  try {
    mkdirSync(QUARANTINE, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const rel = `logs/quarantine/${label}-${stamp}.tsx`
    const attempts = s.parseAttempts ?? []
    const head = [
      '/* QUARANTINE EVIDENCE — this section was replaced with a stub because it did not parse.',
      ` * section : ${s.index}-${s.name} (${s.composition}, strategy:${s.strategy}, tier:${s.tier})`,
      ` * error   : ${err}`,
      ` * tiers   : ${attempts.length ? attempts.map((a) => `${a.tier} FAILED`).join(', ') : `only the final ${s.tier} output failed`}`,
      ' *',
      ' * Below: [1] the exact code the writer parsed (post sanitize/deNextify/react-import/default-export),',
      attempts.length ? ' * then [2..] each model tier’s RAW output with its own parse error.' : ' * (generation recorded no per-tier failures — the transforms are the prime suspect.)',
      ' */',
      ''
    ].join('\n')
    const body = [
      `// ---------- [1] FINAL (what the writer parsed) — ${err}`,
      finalCode,
      ...attempts.flatMap((a, i) => [
        '',
        `// ---------- [${i + 2}] RAW ${a.tier} output — ${a.error}`,
        a.code
      ])
    ].join('\n')
    writeFileSync(join(ROOT, rel), `${head}${body}\n`, 'utf8')
    return rel
  } catch {
    return undefined // evidence capture must never take a run down with it
  }
}

/**
 * Guarantee a default export. A section with none breaks App.tsx's default import at module-load
 * time — which the per-section error boundary can't catch, so it blanks the WHOLE page.
 * If missing, alias a top-level component; if there's nothing to alias, emit a visible stub so
 * the rest of the page still renders.
 */
export function ensureDefaultExport(code: string, label: string): { code: string; repaired: boolean } {
  if (/export\s+default/.test(code)) return { code, repaired: false }
  const named = code.match(/(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/)
  if (named) {
    return { code: `${code}\n\nexport default ${named[1]}\n`, repaired: true }
  }
  return {
    code: `export default function BrokenSection() {
  return <div style={{ padding: 24, color: '#fca5a5', font: '13px ui-monospace, monospace' }}>Section "${label}" produced no usable component.</div>
}
`,
    repaired: true
  }
}

// Load esbuild (Vite's own parser) so the syntax-check matches EXACTLY what will break the build —
// tsc's transpileModule misses grammar errors like a stray top-level `return`. tsc is the fallback.
// Loaded via require so the writer stays sync; fails open (no quarantine) if neither resolves.
const modRequire = createRequire(import.meta.url)
let esbuild: typeof import('esbuild') | null = null
let ts: typeof import('typescript') | null = null
try {
  esbuild = modRequire('esbuild')
} catch {
  esbuild = null
}
try {
  ts = modRequire('typescript')
} catch {
  ts = null
}

/**
 * Return a syntax-error message if `code` won't parse as an ESM TSX module, else null. Prefers
 * esbuild (identical to Vite's parser, so it catches everything Vite would reject — bad strings,
 * stray top-level return, unbalanced JSX). Only SYNTAX is checked; undefined names / types are fine.
 */
export function parseError(code: string): string | null {
  if (esbuild) {
    try {
      esbuild.transformSync(code, { loader: 'tsx', format: 'esm' })
      return null
    } catch (e) {
      const err = e as { errors?: Array<{ text?: string }>; message?: string }
      return err.errors?.[0]?.text ?? err.message ?? 'syntax error'
    }
  }
  if (ts) {
    const out = ts.transpileModule(code, {
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
    })
    const err = (out.diagnostics ?? []).find((d) => d.category === ts!.DiagnosticCategory.Error)
    return err ? ts.flattenDiagnosticMessageText(err.messageText, ' ') : null
  }
  return null
}

/** A valid, self-contained section that renders a visible notice — used to quarantine broken output. */
function quarantineStub(label: string, why: string): string {
  // The error message can contain JSX-hostile chars ({ } < > " ' `). Stripping them to word/basic
  // punctuation keeps the STUB itself parseable — otherwise it'd reproduce the very syntax error.
  const safe = why.replace(/[^\w .,:;()\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150)
  const id = label.replace(/[^A-Za-z0-9]/g, '_')
  return `export default function Quarantined_${id}() {
  return <div style={{ padding: 20, background: '#2a0d0d', color: '#fca5a5', font: '13px ui-monospace, monospace' }}>Section ${label} was quarantined (syntax error): ${safe}</div>
}
`
}

/** Remove import statements whose module isn't in `allowed` (handles multiline + side-effect imports). */
export function sanitizeImports(code: string, allowed: string[]): string {
  const ok = new Set(allowed)
  return code
    .replace(/import\s+[^'";]*?\s+from\s+['"]([^'"]+)['"];?/g, (full, mod) => (ok.has(mod) ? full : ''))
    .replace(/import\s+['"]([^'"]+)['"];?/g, (full, mod) => (ok.has(mod) ? full : ''))
}

/** React named APIs a generated section might reference but forget to import (or have stripped). */
const REACT_NAMED = [
  'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'useId', 'useContext', 'useReducer',
  'useLayoutEffect', 'useImperativeHandle', 'useTransition', 'useDeferredValue', 'useSyncExternalStore',
  'createContext', 'forwardRef', 'memo', 'Fragment'
]

/**
 * Guarantee React + any hooks a section uses are imported. Scratch sections legitimately need hooks
 * (e.g. a scroll-reveal useEffect) but their import gets stripped by sanitizeImports, and the model
 * often omits it anyway — either way `useState is not defined` crashes the section. We re-derive a
 * single canonical react import from what the code actually references. Runs AFTER sanitize so it
 * can't be stripped. Idempotent: strips any existing react import first, then re-adds the correct one.
 */
export function ensureReactImport(code: string): string {
  const usesNamed = REACT_NAMED.filter((h) => new RegExp(`(?<![\\w.$])${h}\\b`).test(code))
  const usesNamespace = /(?<![\w.$])React\./.test(code)
  if (!usesNamed.length && !usesNamespace) return code
  const body = code.replace(/^[ \t]*import[^\n]*?from\s*['"]react['"];?[ \t]*\r?\n?/gm, '')
  const named = usesNamed.length ? `, { ${usesNamed.join(', ')} }` : ''
  return `import React${named} from 'react'\n${body.replace(/^\s*\n/, '')}`
}

const editDistance = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/**
 * Undefined-component guardrail: a capitalized JSX tag that matches no import/declaration crashes at
 * RUNTIME ("X is not defined") — parseError can't see it because it is valid syntax. Observed live:
 * the model imported ParallaxDepth and rendered <ParallexDepth>, killing the page's hero (and its
 * only h1) inside the error boundary. When a tag is within edit-distance 2 of exactly the kind of
 * name it obviously meant (an import/local declaration), rename it; otherwise leave it for the
 * boundary. Returns the repaired code.
 */
/**
 * Decode literal `\uXXXX` (and `\xXX`) escapes to their actual characters across the whole file.
 *
 * The model emits these inside JSX TEXT content ("we’re", "no — because"), where a
 * backslash-u is NOT a JS escape — it is six literal characters that render to the user verbatim.
 * Decoding is SAFE everywhere: inside a real JS string literal, `'’'` and the actual glyph are
 * identical, so nothing breaks; inside JSX text, it fixes the leak. A `\\uXXXX` (already-escaped
 * backslash) is left alone so genuine escape sequences in string content survive.
 */
export function decodeUnicodeEscapes(code: string, log?: (m: string) => void): string {
  let count = 0
  // Protect genuine escaped backslashes first (a literal "\\u2019" in string content is a backslash
  // followed by text, NOT an escape) — then every remaining \uXXXX is a real escape and decodes
  // unconditionally, which also fixes adjacent escapes the preceding-char approach missed.
  const DBS = '  DBS  '
  let out = code.split('\\\\').join(DBS)
  out = out.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (m, u, x) => {
    const cp = parseInt(u ?? x, 16)
    // never decode into a JSX-hostile or control char — those belong as escapes if present
    if (cp < 0x20 || cp === 0x3c /*<*/ || cp === 0x3e /*>*/ || cp === 0x7b /*{*/ || cp === 0x7d /*}*/) return m
    count++
    return String.fromCodePoint(cp)
  })
  out = out.split(DBS).join('\\\\')
  if (count) log?.(`  \x1b[33mfixup\x1b[0m decoded ${count} literal \\uXXXX escape(s) to real characters (JSX text leak)`)
  return out
}

export function repairUndefinedJsxTags(code: string, log?: (m: string) => void): string {
  const defined = new Set<string>()
  for (const m of code.matchAll(/import\s+(?:([A-Z][\w$]*)|\{([^}]*)\}|\*\s+as\s+([A-Z][\w$]*))/g)) {
    if (m[1]) defined.add(m[1])
    if (m[3]) defined.add(m[3])
    if (m[2]) for (const part of m[2].split(',')) {
      const name = part.split(/\s+as\s+/).pop()?.trim()
      if (name) defined.add(name)
    }
  }
  for (const m of code.matchAll(/\b(?:function|const|let|var|class)\s+([A-Z][\w$]*)/g)) defined.add(m[1])

  const tags = new Set<string>()
  for (const m of code.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) tags.add(m[1])
  for (const tag of tags) {
    if (defined.has(tag)) continue
    if (tag.includes('.')) continue
    let best: string | null = null
    let bestD = 3
    for (const name of defined) {
      const dist = editDistance(tag, name)
      if (dist < bestD) { bestD = dist; best = name }
    }
    if (best && bestD <= 2) {
      log?.(`  \x1b[33mfixup\x1b[0m JSX tag <${tag}> matches no import — renamed to <${best}> (edit distance ${bestD})`)
      code = code
        .replace(new RegExp(`<${tag}(?=[\\s/>])`, 'g'), `<${best}`)
        .replace(new RegExp(`</${tag}>`, 'g'), `</${best}>`)
    }
  }
  return code
}

/**
 * De-Next.js guardrail: the target is plain React + Vite, but models drift into Next.js APIs. A
 * stripped `next/image` import leaves `<Image>` to collide with the global DOM Image constructor
 * ("Failed to construct 'Image'"). Drop next/* imports and rewrite the tags to plain HTML.
 */
export function deNextify(code: string): string {
  return code
    .replace(/^[ \t]*import[^\n]*?from\s*['"]next\/[^'"]+['"];?[ \t]*\r?\n?/gm, '')
    .replace(/<Image(\s|\/|>)/g, '<img$1')
    .replace(/<\/Image>/g, '')
    .replace(/<Link(\s|>)/g, '<a$1')
    .replace(/<\/Link>/g, '</a>')
}

/**
 * Node-globals guardrail: sections run in the BROWSER, but models reach for Node globals
 * (`process.env`, `require`, `module`, `__dirname`, `__filename`) → "process is not defined" crashes.
 * If a section actually references one, prepend a safe browser stub so the reference resolves to a
 * harmless value instead of throwing. Same pattern as deNextify — deterministic, applied post-sanitize.
 * Detection targets real usage (property access / call), not the word appearing in copy.
 */
const NODE_GLOBALS: Array<{ name: string; re: RegExp; decl: string }> = [
  { name: 'process', re: /(?<![\w.$])process\s*[.[]/, decl: 'const process = { env: {}, platform: "browser", version: "", browser: true };' },
  { name: 'require', re: /(?<![\w.$])require\s*\(/, decl: 'const require = () => undefined;' },
  { name: 'module', re: /(?<![\w.$])module\s*[.[]/, decl: 'const module = { exports: {} };' },
  { name: '__dirname', re: /(?<![\w.$])__dirname\b/, decl: 'const __dirname = "";' },
  { name: '__filename', re: /(?<![\w.$])__filename\b/, decl: 'const __filename = "";' }
]

export function neutralizeNodeGlobals(code: string): string {
  const decls: string[] = []
  for (const g of NODE_GLOBALS) {
    const declared = new RegExp(`(?:const|let|var|function)\\s+${g.name}\\b`).test(code)
    if (g.re.test(code) && !declared) decls.push(g.decl)
  }
  return decls.length ? `${decls.join('\n')}\n${code}` : code
}

function ensureDeps(deps: string[]): void {
  if (!deps.length) return
  if (!existsSync(join(APP, 'node_modules'))) {
    spawnSync(npm, ['install'], { cwd: APP, stdio: 'inherit', shell: true })
  }
  const missing = deps.filter((d) => !existsSync(join(APP, 'node_modules', ...d.split('/'))))
  if (missing.length) {
    console.log(`  installing deps: ${missing.join(', ')}`)
    spawnSync(npm, ['install', ...missing], { cwd: APP, stdio: 'inherit', shell: true })
  }
}

function writeRegistry(files: string[]): void {
  rmSync(join(SRC, 'lib'), { recursive: true, force: true })
  rmSync(join(SRC, 'hooks'), { recursive: true, force: true })
  for (const rel of files) {
    const from = join(REGISTRY, rel)
    if (!existsSync(from)) throw new Error(`missing registry file preview/registry/${rel}`)
    const to = join(SRC, rel)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
  }
}

/**
 * Regenerate globals.css from the run's committed palette. THIS is the deterministic enforcement
 * point for art-direction: sections consume theme tokens (bg-background, text-primary, …), so
 * rewriting the variables re-skins the whole page with zero per-section model compliance.
 * The same palette is written to both :root and .dark so it applies whichever class is active.
 */
/**
 * The locked heading scale, derived from the committed modular ratio (typography.md: "pick the
 * ratio, then generate every size from it — hand-picked sizes never cohere"). Body base 17px;
 * h1/h2 are responsive clamps so a fixed utility class can't starve the hero.
 */
function headingSizes(r: number): { h1: string; h2: string; h3: string } {
  const body = 17
  const s = (pow: number): number => Math.round(body * Math.pow(r, pow))
  return {
    h1: `clamp(${s(3.4)}px, 6.5vw, ${Math.round(s(4.6) * 1.12)}px)`,
    h2: `clamp(${s(2.4)}px, 4vw, ${s(3.2)}px)`,
    h3: `${s(2)}px`
  }
}

const SCALE_ASPECT_CSS = Object.entries(SCALE_ASPECT)
  .map(([scale, a]) => `.shot-${scale} { aspect-ratio: ${a.css}; object-fit: cover; width: 100%; height: auto; }`)
  .join('\n')

export function themeCss(p: Palette, mi: InteractionSpec, type: TypographySpec, layout: LayoutSpec): string {
  const h = headingSizes(type.scaleRatio)
  const vars = `  --background: ${p.background};
  --foreground: ${p.foreground};
  --card: ${p.card};
  --card-foreground: ${p.cardForeground};
  --popover: ${p.card};
  --popover-foreground: ${p.cardForeground};
  --primary: ${p.primary};
  --primary-foreground: ${p.primaryForeground};
  --secondary: ${p.secondary};
  --secondary-foreground: ${p.foreground};
  --muted: ${p.secondary};
  --muted-foreground: ${p.mutedForeground};
  --accent: ${p.accent};
  --accent-foreground: ${p.accentForeground};
  --destructive: #ef4444;
  --destructive-foreground: #fafafa;
  --border: ${p.border};
  --input: ${p.border};
  --ring: ${p.accent};
  --radius: 0.5rem;
  --mi-dur: ${mi.durationMs}ms;
  --mi-ease: ${mi.easing};
  --mi-tap: ${mi.tapScale};
  --font-display: ${type.displayFamily};
  --font-body: ${type.bodyFamily};
  --container: ${layout.containerPx}px;
  --section-pad: clamp(${layout.sectionPadMin}px, 14vh, ${layout.sectionPadMax}px);`
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * GENERATED PER RUN by the art-direction step (engine/agent/art-direction.ts) — a committed brand
 * palette expressed as full-hex CSS variables. Same values in :root and .dark so the brand shows
 * whichever class is active. Full hex (not HSL channels) so components that read var(--x) inside a
 * gradient stay valid.
 */
:root {
${vars}
}

.dark {
${vars}
}

* {
  border-color: var(--border);
}
/*
 * GENERATED PER RUN — the LOCKED TYPE SYSTEM (art-direction's TypographySpec, applied for real).
 * Heading identity (family/weight/tracking/leading/scale) is decided once per run and enforced with
 * !important so a section's ad-hoc text-/font- utilities cannot re-decide it — the same
 * "model compliance is irrelevant" discipline as the palette. The scale derives from the committed
 * modular ratio; hand-picked per-section sizes never cohere.
 */
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-body);
  font-weight: ${type.bodyWeight};
  line-height: ${type.bodyLineHeight};
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 {
  font-family: var(--font-display) !important;
  font-weight: ${type.displayWeight} !important;
  letter-spacing: ${css(type.displayTracking)} !important;
  line-height: ${type.displayLineHeight} !important;
  margin: 0;
}
h1 { font-size: ${css(h.h1)} !important; }
h2 { font-size: ${css(h.h2)} !important; }
h3 { font-size: ${css(h.h3)}; }

/*
 * GENERATED PER RUN — the LOCKED LAYOUT SYSTEM. One container width, one section-padding rhythm
 * for the whole page (spacing.md numbers per mood). Sections apply these instead of inventing
 * py-*/max-w-* per section — a page whose sections each re-decide spacing reads as seven designers.
 */
.container-page { max-width: var(--container); margin-inline: auto; padding-inline: clamp(20px, 4vw, 48px); }
.section-pad { padding-block: var(--section-pad); }
.section-pad-hero { padding-block: calc(var(--section-pad) * 1.25); }

/*
 * GENERATED PER RUN — the LOCKED GRID. Sections compose INSIDE this 12-column system using the
 * allowed splits; they do not invent their own geometry. (Item grids inside a column — cards,
 * galleries — remain free.) .measure caps body text at a readable line length.
 */
.grid-page { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: clamp(20px, 3vw, 40px); align-items: start; }
.col-main { grid-column: span 7; }
.col-side { grid-column: span 5; }
.col-wide { grid-column: span 8; }
.col-narrow { grid-column: span 4; }
.col-full { grid-column: 1 / -1; }
.measure { max-width: 62ch; }
@media (max-width: 820px) {
  .col-main, .col-side, .col-wide, .col-narrow { grid-column: 1 / -1; }
}

/*
 * GENERATED PER RUN — the LOCKED IMAGE SHAPES (shot plan, part of staging). One aspect per beat
 * scale; object-fit: cover means the committed crop always fills the box — an image can no longer
 * be stretched into an improvised container. Classes are stamped deterministically at write time.
 */
${SCALE_ASPECT_CSS}

/*
 * GENERATED PER RUN by the art-direction step — the committed micro-interaction contract. Sections
 * apply these classes to interactive elements instead of inventing their own durations/easings, so
 * hover/press feel is identical across the whole page. Reduced-motion is baked in.
 */
.mi {
  transition: transform var(--mi-dur) var(--mi-ease), opacity var(--mi-dur) var(--mi-ease), box-shadow var(--mi-dur) var(--mi-ease), color var(--mi-dur) var(--mi-ease), background-color var(--mi-dur) var(--mi-ease), border-color var(--mi-dur) var(--mi-ease);
  cursor: ${css(mi.cursor)};
}
.mi-lift:hover {
  transform: ${css(mi.hoverTransform)};
  box-shadow: ${css(mi.hoverShadow)};
}
.mi-press:active {
  transform: scale(var(--mi-tap));
}
.mi:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .mi, .mi-lift, .mi-press { transition: none; }
  .mi-lift:hover, .mi-press:active { transform: none; }
}
`
}

/** Guard: only literal transform/shadow/cursor tokens (already validated upstream) reach the stylesheet. */
function css(v: string): string {
  return /^[-0-9a-z.,()#%/ ]+$/i.test(v) ? v : 'none'
}

function composeApp(gen: GenerateResult): string {
  const imports = gen.sections
    .map((s) => `import Section${s.index} from '${s.moduleName}'`)
    .join('\n')
  const body = gen.sections
    .map((s) => `      <Boundary name="${s.index}-${s.name}"><Section${s.index} /></Boundary>`)
    .join('\n')
  return `import React from 'react'
${imports}

class Boundary extends React.Component<{ name: string; children: React.ReactNode }, { err?: Error }> {
  state: { err?: Error } = {}
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 20, background: '#2a0d0d', color: '#fca5a5', font: '13px ui-monospace, monospace' }}>
          Section "{this.props.name}" crashed: {String(this.state.err.message)}
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <>
${body}
    </>
  )
}
`
}

export interface WriteResult {
  files: string[]
  deps: string[]
  registry: string[]
}

export function writePage(plan: Plan, gen: GenerateResult, art: ArtDirection): WriteResult {
  // Clear the active component / previous generated page so nothing stale leaks in.
  rmSync(GENERATED, { recursive: true, force: true })
  mkdirSync(GENERATED, { recursive: true })
  rmSync(join(SRC, 'active-component.tsx'), { force: true })

  // Deterministic art-direction: re-skin the whole page by rewriting the theme variables.
  writeFileSync(join(SRC, 'globals.css'), themeCss(art.palette, art.interactions, art.typography, art.layout), 'utf8')

  const files: string[] = []
  const depSet = new Set<string>()
  const regSet = new Set<string>()

  // 1. used motion primitives → verbatim files
  for (const [id, comp] of gen.usedComponents) {
    writeFileSync(join(GENERATED, `lib-${id}.tsx`), `${comp.code}\n`, 'utf8')
    files.push(`generated/lib-${id}.tsx`)
    for (const d of comp.dependencies ?? []) depSet.add(d)
    for (const r of comp.registry_files ?? []) regSet.add(r)
  }

  // 2. section files, with imports sanitized to what each section is allowed to use
  for (const s of gen.sections) {
    let allowed: string[]
    if (s.strategy === 'motion-primitive' && s.motionPrimitiveId) {
      const comp = gen.usedComponents.get(s.motionPrimitiveId) as ComponentDoc
      allowed = [`./lib-${comp.id}`, 'react', 'react-dom', ...(comp.dependencies ?? [])]
    } else {
      // scratch = pure React + Tailwind: only React itself (for hooks); no other packages/files.
      allowed = ['react', 'react-dom']
    }
    // filename tracks the section's moduleName so App.tsx's import resolves (free names → slugged).
    const base = s.moduleName.replace(/^\.\/generated\//, '')
    // sanitize → de-Next.js → neutralize Node globals → guarantee react/hook import → default export.
    const label = `${s.index}-${s.name}`
    let sanitized = deNextify(sanitizeImports(s.code, allowed))
    sanitized = neutralizeNodeGlobals(sanitized)
    sanitized = repairUndefinedJsxTags(sanitized, console.warn)
    sanitized = decodeUnicodeEscapes(sanitized, console.warn)
    sanitized = ensureReactImport(sanitized)
    let { code, repaired } = ensureDefaultExport(sanitized, label)
    if (repaired) console.warn(`  \x1b[33mfixup\x1b[0m [${label}] had no default export — injected one.`)
    // Quarantine a syntactically-broken section so ONE bad section can't fail the whole Vite build
    // (a compile error escapes the per-section ErrorBoundary). It renders a visible notice instead.
    const perr = parseError(code)
    if (perr) {
      const evidence = dumpQuarantine(label, code, perr, s)
      const tiersFailed = (s.parseAttempts ?? []).map((a) => a.tier)
      console.warn(`  \x1b[31mQUARANTINE\x1b[0m [${label}] syntax error → stub: ${perr.slice(0, 90)}`)
      console.warn(
        `  \x1b[31mQUARANTINE\x1b[0m [${label}] ${
          tiersFailed.length ? `tiers failed: ${tiersFailed.join(' + ')}` : 'generation parsed OK — broken by a writer transform'
        }${evidence ? ` | evidence: ${evidence}` : ' | evidence dump FAILED'}`
      )
      // Carry it on the result so the run summary + Studio UI show a stubbed section, not just a warn.
      s.quarantined = { error: perr, tiersFailed, evidence }
      code = quarantineStub(label, perr)
    }
    writeFileSync(join(GENERATED, `${base}.tsx`), `${code}\n`, 'utf8')
    files.push(`generated/${base}.tsx`)
  }

  // 3. composition + registry + deps
  writeFileSync(join(SRC, 'App.tsx'), composeApp(gen), 'utf8')
  files.push('App.tsx', 'globals.css')
  writeRegistry([...regSet])
  ensureDeps([...depSet])

  return { files, deps: [...depSet], registry: [...regSet] }
}

export { APP }
