/**
 * Page CHROME — the nav and footer, built deterministically from the locked register.
 *
 * Chrome is not a "section", which is exactly why the system never produced any: the Plan emits
 * narrative content sections, so nothing in the pipeline was ever responsible for a navigation bar.
 * Across ~25 generated sites there was not one <nav>. A SaaS page without a nav is not a stylistic
 * choice, it is a missing limb.
 *
 * So the writer composes chrome itself, from the register's known conventions — same discipline as
 * the palette and type system: decided once, applied in code, never left to model compliance. The
 * markup uses only the locked theme tokens and utilities, so chrome inherits the run's brand
 * automatically.
 */

import { REGISTER_CHROME, type ChromeSpec, type Register } from '../types.js'
import type { SectionResult } from './types.js'

/** A nav link derived from a real section — chrome must point at content that exists. */
interface NavLink {
  label: string
  href: string
}

/** Title-case a slugged section name: "how-a-visit-goes" → "How a visit goes". */
function labelFor(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Pick nav links from the actual sections. Skips the opening section (the logo already returns you
 * there) and anything that reads like a closing CTA, then caps at 4 — a nav with every section in it
 * is a table of contents, not navigation.
 */
/**
 * Product registers want SEMANTIC nav labels (Product, Pricing, Docs) — an evaluator scans for those
 * words. Section-slug anchors ("The 3am question") read as a table of contents, which is why the
 * model kept building its own nav alongside ours. Map the real sections onto conventional labels
 * where one fits, and fall back to the section's own name where none does.
 */
const SEMANTIC_LABELS: Array<[RegExp, string]> = [
  [/(pricing|price|cost|plan|tier|free)/i, 'Pricing'],
  [/(doc|guide|reference|api|integrat)/i, 'Docs'],
  [/(feature|capabilit|what|how.*work|product|tool)/i, 'Product'],
  [/(customer|client|who|trust|proof|testimonial|team)/i, 'Customers'],
  [/(story|about|why|manifesto|origin)/i, 'About'],
  [/(work|project|case|portfolio|edition|gallery)/i, 'Work'],
  [/(service|treatment|offer)/i, 'Services'],
  [/(programme|program|lineup|schedule|agenda)/i, 'Programme']
]

export function navLinks(sections: SectionResult[], max = 4, semantic = false): NavLink[] {
  const CTA_LIKE = /(contact|get.?in.?touch|book|reserve|acquire|enquir|inquir|start|sign.?up|buy|order|come.?in)/i
  return sections
    .filter((s) => s.index > 0 && !CTA_LIKE.test(s.name))
    .slice(0, max)
    .map((s) => {
      if (semantic) {
        const hit = SEMANTIC_LABELS.find(([re]) => re.test(s.name))
        if (hit) return { label: hit[1], href: `#${s.index}-${s.name}` }
      }
      return { label: labelFor(s.name), href: `#${s.index}-${s.name}` }
    })
    // a semantic map can collapse two sections onto the same label — keep the first of each
    .filter((l, i, arr) => arr.findIndex((x) => x.label === l.label) === i)
}

/** The CTA verb belongs to the REGISTER, not to whatever the closing section happens to be called. */
const CTA_VERB: Record<Register, string> = {
  'saas-product': 'Start free',
  'developer-tool': 'Read the docs',
  'ecommerce-product': 'Shop now',
  'local-service-business': 'Book a visit',
  'agency-studio': 'Start a project',
  'portfolio-showcase': 'Get in touch',
  'event-launch': 'Get tickets',
  'editorial-story': 'Get in touch'
}

/** The closing section is the natural CTA target; fall back to the final section either way. */
function ctaTarget(register: Register, sections: SectionResult[]): { label: string; href: string } {
  const CTA_LIKE = /(contact|get.?in.?touch|book|reserve|acquire|enquir|inquir|start|sign.?up|buy|order|come.?in)/i
  const label = CTA_VERB[register] ?? 'Get in touch'
  const cta = [...sections].reverse().find((s) => CTA_LIKE.test(s.name)) ?? sections[sections.length - 1]
  return cta ? { label, href: `#${cta.index}-${cta.name}` } : { label, href: '#top' }
}

/**
 * Build the chrome component source for a register. Returns null when the register carries none
 * (editorial-story deliberately runs chrome-less — that is the genre, not an omission).
 */
export function buildChrome(register: Register, brand: string, sections: SectionResult[]): string | null {
  const spec: ChromeSpec = REGISTER_CHROME[register] ?? REGISTER_CHROME['editorial-story']
  if (spec.nav === 'none' && spec.footer === 'none') return null

  const semantic = spec.nav === 'sticky-cta' // product/service registers scan for conventional labels
  const links = navLinks(sections, 4, semantic)
  const cta = ctaTarget(register, sections)
  const year = '{new Date().getFullYear()}'
  const safeBrand = brand.replace(/[<>{}]/g, '').trim() || 'Brand'

  const linkItems = links
    .map((l) => `            <a href="${l.href}" className="mi text-muted-foreground hover:text-foreground">${l.label}</a>`)
    .join('\n')

  // sticky-cta: the working nav for product/service registers — brand, links, one action.
  const stickyNav = `      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-sm">
        <nav className="container-page flex items-center justify-between gap-6 py-4">
          <a href="#top" className="mi font-semibold tracking-tight text-foreground">${safeBrand}</a>
          <div className="hidden md:flex items-center gap-7 text-sm">
${linkItems}
          </div>
          <a href="${cta.href}" className="mi mi-press shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">${cta.label}</a>
        </nav>
      </header>`

  // minimal-masthead: a quiet rule of a header for portfolio/agency/event registers.
  const masthead = `      <header className="border-b border-border">
        <nav className="container-page flex items-center justify-between gap-6 py-5">
          <a href="#top" className="mi font-semibold tracking-tight text-foreground">${safeBrand}</a>
          <div className="hidden sm:flex items-center gap-6 text-sm">
${linkItems}
          </div>
        </nav>
      </header>`

  const sitemapFooter = `      <footer className="border-t border-border mt-24">
        <div className="container-page py-14 grid gap-10 sm:grid-cols-2 md:grid-cols-4 text-sm">
          <div className="sm:col-span-2 md:col-span-1">
            <div className="font-semibold text-foreground">${safeBrand}</div>
          </div>
${links
    .map(
      (l) => `          <a href="${l.href}" className="mi text-muted-foreground hover:text-foreground">${l.label}</a>`
    )
    .join('\n')}
        </div>
        <div className="container-page pb-10 text-xs text-muted-foreground">© ${year} ${safeBrand}</div>
      </footer>`

  const minimalFooter = `      <footer className="border-t border-border mt-24">
        <div className="container-page py-10 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© ${year} ${safeBrand}</span>
          <a href="${cta.href}" className="mi hover:text-foreground">${cta.label}</a>
        </div>
      </footer>`

  const nav = spec.nav === 'sticky-cta' ? stickyNav : spec.nav === 'minimal-masthead' ? masthead : ''
  const footer = spec.footer === 'sitemap' ? sitemapFooter : spec.footer === 'minimal' ? minimalFooter : ''

  return `import React from 'react'

/**
 * GENERATED PER RUN — page chrome for the "${register}" register. Built deterministically by the
 * writer (engine/agent/chrome.ts) from the register's conventions, using only locked theme tokens.
 */
export function SiteNav(): React.ReactElement | null {
  return (
    <>
${nav || '      {null}'}
    </>
  )
}

export function SiteFooter(): React.ReactElement | null {
  return (
    <>
${footer || '      {null}'}
    </>
  )
}
`
}
