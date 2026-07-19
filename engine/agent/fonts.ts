/**
 * THE TYPEFACE CATALOGUE — real faces, self-hosted.
 *
 * WHY THIS REPLACES THE SYSTEM STACKS
 *
 * Typography was locked to four SYSTEM stacks: system-ui, Arial Narrow, Georgia, and a mono. That was
 * a deliberate safety choice — nothing to download, nothing to fail to load, no licensing question —
 * and it worked exactly as intended. It also put a hard ceiling on how good a page could look.
 *
 * Georgia and system-ui cannot produce a cinematic or premium page. Type personality is a large part
 * of what the sites we studied are actually doing: Cantor8 runs one licensed grotesque at two weights
 * and gets its whole authority from it; Stripe ships a custom face. No amount of scale, layout or
 * colour work escapes a default system font — it is the one thing a viewer reads on every line.
 *
 * WHY IT IS STILL SAFE
 *
 * These are self-hosted via fontsource packages, bundled by Vite from node_modules. There is no CDN
 * request, no external dependency at runtime, nothing to 404, and every face is openly licensed.
 * Only the faces a run actually commits to are imported, so a page carries two families, not ten.
 *
 * The catalogue is deliberately CURATED rather than open: ten faces chosen to span real ground —
 * neutral workhorse to editorial serif to loud display — because a model given "any Google font"
 * picks the same three every time, and a page cannot be rescued from a bad pairing downstream.
 */

export interface FaceMeta {
  /** the CSS family name the package registers */
  family: string
  /** the npm module whose side-effect import self-hosts it */
  module: string
  /** true for variable fonts — one file covers the whole weight range */
  variable: boolean
  /** usable as display / as body — several faces are only good at one job */
  display: boolean
  body: boolean
  /** what it actually feels like, in the words the art-direction step reasons in */
  character: string
}

/**
 * Ten faces. Each earns its place by covering ground the others cannot; anything that duplicated an
 * existing character was left out, since a wider catalogue mostly widens the chance of a bad pick.
 */
export const FACES = {
  inter: {
    family: 'Inter Variable',
    module: '@fontsource-variable/inter',
    variable: true, display: true, body: true,
    character: 'the neutral workhorse — invisible, technical, trustworthy; the right answer when the type should not have an opinion'
  },
  'dm-sans': {
    family: 'DM Sans Variable',
    module: '@fontsource-variable/dm-sans',
    variable: true, display: true, body: true,
    character: 'geometric and friendly with low contrast — approachable consumer and wellness work without being childish'
  },
  archivo: {
    family: 'Archivo Variable',
    module: '@fontsource-variable/archivo',
    variable: true, display: true, body: true,
    character: 'a grotesque with real width range — sturdy and slightly editorial; holds up at both poster size and caption size'
  },
  'space-grotesk': {
    family: 'Space Grotesk Variable',
    module: '@fontsource-variable/space-grotesk',
    variable: true, display: true, body: true,
    character: 'technical with character — quirky terminals and a computational feel, without dropping to a mono'
  },
  'bricolage-grotesque': {
    family: 'Bricolage Grotesque Variable',
    module: '@fontsource-variable/bricolage-grotesque',
    variable: true, display: true, body: false,
    character: 'contemporary editorial display — irregular, confident, of-the-moment; strong at large sizes and tiring as body copy'
  },
  syne: {
    family: 'Syne',
    module: '@fontsource/syne',
    variable: false, display: true, body: false,
    character: 'loud and idiosyncratic — arts, agency and culture work; unmistakable, and wrong for anything that must feel institutional'
  },
  fraunces: {
    family: 'Fraunces Variable',
    module: '@fontsource-variable/fraunces',
    variable: true, display: true, body: false,
    character: 'high-contrast old-style serif with warmth — premium, crafted, editorial; the face for something made by hand'
  },
  'instrument-serif': {
    family: 'Instrument Serif',
    module: '@fontsource/instrument-serif',
    variable: false, display: true, body: false,
    character: 'elegant high-contrast display serif — cinematic and restrained; enormous sizes are where it belongs'
  },
  newsreader: {
    family: 'Newsreader Variable',
    module: '@fontsource-variable/newsreader',
    variable: true, display: true, body: true,
    character: 'an editorial reading serif — long-form, literary, calm; the rare serif that is genuinely comfortable as body copy'
  },
  'jetbrains-mono': {
    family: 'JetBrains Mono Variable',
    module: '@fontsource-variable/jetbrains-mono',
    variable: true, display: false, body: true,
    character: 'a real code face — for developer tools, data and anything where monospace is information rather than decoration'
  }
} as const satisfies Record<string, FaceMeta>

export type FaceKey = keyof typeof FACES
export const FACE_KEYS = Object.keys(FACES) as FaceKey[]
export const DISPLAY_FACES = FACE_KEYS.filter((k) => FACES[k].display)
export const BODY_FACES = FACE_KEYS.filter((k) => FACES[k].body)

/** Fallbacks by shape, so a face that somehow fails to load degrades to something of the same width. */
const FALLBACK: Record<string, string> = {
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
}
const SHAPE: Record<FaceKey, keyof typeof FALLBACK> = {
  inter: 'sans', 'dm-sans': 'sans', archivo: 'sans', 'space-grotesk': 'sans',
  'bricolage-grotesque': 'sans', syne: 'sans',
  fraunces: 'serif', 'instrument-serif': 'serif', newsreader: 'serif',
  'jetbrains-mono': 'mono'
}

export const familyStack = (k: FaceKey): string => `'${FACES[k].family}', ${FALLBACK[SHAPE[k]]}`

/** Validate a committed face, with a role-aware fallback (a body face must be readable as body). */
export function clampFace(raw: unknown, role: 'display' | 'body', fallback: FaceKey): FaceKey {
  const k = String(raw ?? '').toLowerCase().trim() as FaceKey
  if (FACE_KEYS.includes(k) && FACES[k][role]) return k
  return fallback
}

/**
 * The module that self-hosts the run's committed faces.
 *
 * Only the two committed faces are imported, so a page downloads two families rather than the whole
 * catalogue. Vite resolves these from node_modules and bundles the woff2 — no network request to a
 * font CDN, and nothing that can fail at runtime.
 */
export function fontsModule(display: FaceKey, body: FaceKey): string {
  const mods = [...new Set([FACES[display].module, FACES[body].module])]
  return `/**
 * GENERATED PER RUN — this page's committed typefaces, self-hosted.
 * display: ${FACES[display].family}   body: ${FACES[body].family}
 * Only the faces this run uses are imported; the catalogue is not shipped.
 */
${mods.map((m) => `import '${m}'`).join('\n')}
`
}

/** The catalogue as the art-direction step sees it — character, not file names. */
export function faceCatalogueForPrompt(): string {
  const line = (k: FaceKey): string => {
    const f = FACES[k]
    const roles = [f.display ? 'display' : '', f.body ? 'body' : ''].filter(Boolean).join('+')
    return `  ${k} (${roles}) — ${f.character}`
  }
  return FACE_KEYS.map(line).join('\n')
}
