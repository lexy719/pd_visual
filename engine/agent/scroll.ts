/**
 * The page SCROLL FEEL lock.
 *
 * Motion in this system has two levels, and only one of them was modelled. Component-level motion is
 * the verified primitive library, gated by content fit. Page-level motion was only ever a GATE — the
 * locked MotionLanguage decided which primitives were allowed — and never an actual property of the
 * page. So the single most continuously-felt piece of motion on any site, the scroll itself, was
 * whatever the browser happened to do.
 *
 * Smooth scroll is one of the largest perceived-quality gaps between a template and a crafted site,
 * and it is a page-level decision by nature: one feel, committed once, applied everywhere. That makes
 * it the same shape as the palette, the interaction spec and the rhythm — decided here, emitted as
 * code, never left to per-section compliance.
 *
 * WHY THIS FILE IS SO DEFENSIVE
 *
 * Lenis takes over the wheel event and drives scrolling from a requestAnimationFrame loop. This repo
 * has already lost a session to the fact that our preview runs with `document.hidden === true`, where
 * rAF NEVER FIRES (see CLAUDE.md). Naively installed, that combination is not a degraded animation —
 * it is a page that cannot be scrolled at all, in exactly the environment the visual pass measures
 * in. Every guard below exists for a specific failure, not for tidiness:
 *
 *   - reduced motion      -> never initialise (accessibility, and it is the honest default)
 *   - hidden document     -> never initialise, and destroy if the tab becomes hidden mid-session
 *   - ?nosmooth           -> hard escape hatch for headless capture and measurement
 *   - touch input         -> left native; smoothed touch scrolling feels broken, not smooth
 *
 * The guards fail SAFE in every case: when any of them trips, the page keeps plain native scrolling,
 * which is fully functional. Smooth scroll is an enhancement and is treated as one.
 */
import type { MotionLanguage } from '../types.js'

/** How the page scrolls. A closed vocabulary, bound to the locked motion language. */
export const SCROLL_FEELS = ['native', 'gentle', 'smooth', 'snappy'] as const
export type ScrollFeel = (typeof SCROLL_FEELS)[number]

/**
 * Lenis tuning per feel. `lerp` is the per-frame catch-up fraction: lower is heavier and slower to
 * settle. Kept inside 0.06–0.16 deliberately — below that the page feels detached from the input
 * device, which reads as broken rather than smooth.
 */
export const FEEL_PARAMS: Record<Exclude<ScrollFeel, 'native'>, { lerp: number; wheelMultiplier: number }> = {
  gentle: { lerp: 0.14, wheelMultiplier: 1 },
  smooth: { lerp: 0.08, wheelMultiplier: 1 },
  snappy: { lerp: 0.16, wheelMultiplier: 1.1 }
}

/**
 * Motion language -> scroll feel.
 *
 * 'none' and 'brutalist-cut' map to native ON PURPOSE. Instant, unsmoothed scrolling IS the brutalist
 * position; smoothing it would contradict the very language the run committed to. A lock that
 * overrides its own art direction is not a lock.
 */
export const FEEL_BY_MOTION: Record<MotionLanguage, ScrollFeel> = {
  none: 'native',
  'brutalist-cut': 'native',
  subtle: 'gentle',
  aggressive: 'snappy',
  kinetic: 'snappy',
  'parallax-slow': 'smooth'
}

export const feelForMotion = (m: MotionLanguage): ScrollFeel => FEEL_BY_MOTION[m] ?? 'native'

/**
 * The CSS Lenis requires, emitted only when a smooth feel is active.
 *
 * Note what is deliberately NOT here: `html { overflow: hidden }`. Lenis's docs suggest it, but this
 * page already sets `overflow-x: clip` so full-bleed devices cannot create a sideways scrollbar, and
 * `overflow: hidden` on the root would break that contract AND fight the native fallback the guards
 * rely on. Only `lenis-stopped` — a state Lenis sets on itself — locks scrolling.
 */
export function scrollCss(feel: ScrollFeel): string {
  if (feel === 'native') return ''
  return `
/* GENERATED PER RUN — support for the locked "${feel}" scroll feel. */
html.lenis, html.lenis body { height: auto; }
.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
.lenis.lenis-stopped { overflow: hidden; }
`
}

/**
 * Emit the smooth-scroll module for the preview app.
 *
 * Returns null for 'native' so nothing is written and nothing is imported — a page that committed to
 * native scrolling carries no scroll code at all, rather than shipping a disabled library.
 */
export function smoothScrollModule(feel: ScrollFeel): string | null {
  if (feel === 'native') return null
  const p = FEEL_PARAMS[feel]
  return `/**
 * GENERATED PER RUN — the locked page scroll feel ("${feel}").
 * Written by engine/agent/scroll.ts. Do not edit; regenerate the page instead.
 */
import { useEffect } from 'react'
import Lenis from 'lenis'

export function useSmoothScroll(): void {
  useEffect(() => {
    // Guards, in order of cost. Each one falls back to fully-functional native scrolling.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const escaped = new URLSearchParams(window.location.search).has('nosmooth')
    const coarse = window.matchMedia('(pointer: coarse)').matches
    // A hidden document never fires requestAnimationFrame. Lenis drives scrolling FROM rAF while
    // also intercepting the wheel, so initialising here would make the page unscrollable outright.
    if (reduced || escaped || coarse || document.hidden) return

    const lenis = new Lenis({ lerp: ${p.lerp}, wheelMultiplier: ${p.wheelMultiplier}, autoRaf: false })
    ;(window as any).__lenis = lenis // handle for measurement + debugging

    let frame = 0
    const raf = (t: number) => {
      lenis.raf(t)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)

    // Keep GSAP's ScrollTrigger in step: it reads scroll position, which Lenis now owns.
    const gsapST = (window as any).ScrollTrigger
    if (gsapST?.update) lenis.on('scroll', gsapST.update)

    // If the tab is hidden mid-session the rAF loop stops and scrolling would freeze. Tear down and
    // hand control back to the browser rather than leaving a half-driven page.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        lenis.destroy()
        ;(window as any).__lenis = undefined
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
      lenis.destroy()
      ;(window as any).__lenis = undefined
    }
  }, [])
}
`
}
