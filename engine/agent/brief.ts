/** Turn the Studio's human choices into a small, explicit planning contract.
 *
 * The model still receives the original prose brief, but it no longer has to infer every
 * important creative decision from one sentence. This parser deliberately stays local and
 * deterministic: it recognises the labels the Studio writes and preserves any "avoid" language.
 */
export interface CreativeBrief {
  raw: string
  product: string
  visualDirection?: string
  palettePreference?: string
  motionPreference?: string
  avoidances: string[]
}

const labelled = (raw: string, label: string): string | undefined =>
  raw.match(new RegExp(`${label}:\\s*([^\\n.]+)`, 'i'))?.[1]?.trim()

export function parseCreativeBrief(raw: string): CreativeBrief {
  const product = raw.split(/\n\s*\nCreative direction:/i)[0]?.trim() || raw.trim()
  const avoids = [...raw.matchAll(/(?:avoid|don't use|do not use|no)\s+([^.;\n]+)/gi)]
    .map((m) => m[1].trim())
    .filter((x) => x.length > 2)
    .slice(0, 8)
  return {
    raw,
    product,
    visualDirection: labelled(raw, 'Creative direction'),
    palettePreference: labelled(raw, 'Palette preference'),
    motionPreference: labelled(raw, 'Motion preference'),
    avoidances: [...new Set(avoids)]
  }
}
