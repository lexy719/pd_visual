/**
 * Pure color math for the art-direction step — no dependencies. Used to VALIDATE and ADJUST a
 * model-synthesized palette deterministically: WCAG contrast (accessibility.md's 4.5:1), HSL
 * saturation (to reject gray accents), and readable-foreground derivation.
 */

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    const n = parseInt(s, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)]
  }
  return null
}

export function isHex(hex: string): boolean {
  return hexToRgb(hex) !== null
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (x: number): string => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

const srgbToLinear = (c: number): number => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

export function luminance(rgb: RGB): number {
  return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2])
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return 1
  const la = luminance(ra)
  const lb = luminance(rb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function rgbToHsl(rgb: RGB): [number, number, number] {
  const r = rgb[0] / 255
  const g = rgb[1] / 255
  const b = rgb[2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s, l]
}

export function hslToHex(hDeg: number, s: number, l: number): string {
  const h = ((((hDeg % 360) + 360) % 360)) / 360
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return rgbToHex(hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255)
}

/** HSL saturation 0..1 — used to detect a "gray" accent (near 0). */
export function saturation(hex: string): number {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHsl(rgb)[1] : 0
}

/** near-black or near-white — whichever is more legible on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio('#fafafa', bg) >= contrastRatio('#0a0a0a', bg) ? '#fafafa' : '#0a0a0a'
}

/**
 * Nudge `fg`'s lightness (keeping its hue/saturation) until it meets `ratio` against `bg`.
 * This is the "adjust rather than reject" path for a low-contrast but on-brand foreground.
 * Falls back to pure black/white if the hue simply can't reach the ratio.
 */
export function ensureContrast(fg: string, bg: string, ratio = 4.5): string {
  if (contrastRatio(fg, bg) >= ratio) return fg
  const rgb = hexToRgb(fg)
  const bgRgb = hexToRgb(bg)
  if (!rgb || !bgRgb) return readableOn(bg)
  const [h, s] = rgbToHsl(rgb)
  const goDarker = luminance(bgRgb) > 0.5
  let l = rgbToHsl(rgb)[2]
  for (let i = 0; i < 100; i++) {
    l = goDarker ? l - 0.01 : l + 0.01
    if (l <= 0 || l >= 1) break
    const cand = hslToHex(h, s, l)
    if (contrastRatio(cand, bg) >= ratio) return cand
  }
  return readableOn(bg)
}

/** Linear blend of two hex colors, t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return a
  return rgbToHex(ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t)
}
