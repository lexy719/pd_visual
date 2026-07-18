import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './globals.css'
import App from './App'

/**
 * Generated-image retry (app shell infra, NOT generated code). Dynamic-src images compose their
 * URL at runtime, so the server-side pre-warm cannot cache them — at view time they can burst into
 * Pollinations' one-at-a-time rate limit and 429 (observed live: a broken image with bare alt text).
 * Any failed generated image retries itself with growing backoff; error events don't bubble, so
 * this listens in the capture phase.
 */
/**
 * Scroll-reveal safety net (app shell infra, NOT generated code).
 *
 * Generated sections reveal with IntersectionObserver + `opacity-0 translate-y-*`. An observer only
 * reports the CURRENT intersection state, so a fast or jumped scroll can skip an element entirely —
 * it never intersects, never gets its visible class, and once it is above the viewport it never
 * will. Diagnosed live: one numbered step stayed invisible forever while its neighbours revealed.
 *
 * After the reveals have had their chance, force anything still hidden to show. Targeting is
 * deliberately narrow — opacity-0 AND a translate (the canonical reveal shape), never `hover:`/
 * `group-hover:` elements — so genuine hover overlays and tooltips are left alone.
 */
function revealStragglers(): void {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[class*="opacity-0"]'))) {
    const cls = el.className
    if (typeof cls !== 'string') continue
    if (!/translate-[xy]/.test(cls)) continue // not a scroll-reveal shape
    if (/hover:|group-hover:|peer-/.test(cls)) continue // a hover effect — must stay hidden
    if (getComputedStyle(el).opacity !== '0') continue // already revealed
    el.style.opacity = '1'
    el.style.transform = 'none'
  }
}
for (const delay of [4000, 9000]) setTimeout(revealStragglers, delay)
window.addEventListener('load', () => setTimeout(revealStragglers, 2500))

window.addEventListener(
  'error',
  (e) => {
    const img = e.target as HTMLImageElement
    if (!img || img.tagName !== 'IMG' || !/image\.pollinations\.ai/.test(img.src)) return
    const tries = Number(img.dataset.retry ?? '0')
    if (tries >= 4) return
    img.dataset.retry = String(tries + 1)
    const src = img.src
    setTimeout(() => {
      img.src = ''
      img.src = src // same URL on purpose: hits Pollinations' cache once the earlier request lands
    }, 4000 * (tries + 1))
  },
  true
)

/**
 * Preview shell. Deliberately NOT wrapped in StrictMode — StrictMode double-mounts effects,
 * which would fire the scroll listeners in components like hero-004 twice and muddy the exact
 * behaviour we're here to observe. We want production-shaped single mounting.
 */
function Root(): React.ReactElement {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const id = (import.meta as { env?: Record<string, string> }).env?.VITE_PREVIEW_ID ?? 'preview'

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 8,
          left: 8,
          zIndex: 2147483647,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          font: '12px ui-monospace, monospace'
        }}
      >
        <span style={{ opacity: 0.55, color: dark ? '#fff' : '#000' }}>{id}</span>
        <button
          onClick={() => setDark((d) => !d)}
          style={{
            cursor: 'pointer',
            border: '1px solid #8888',
            borderRadius: 6,
            padding: '3px 8px',
            background: dark ? '#1a1a1a' : '#fff',
            color: dark ? '#fff' : '#000'
          }}
        >
          {dark ? 'light' : 'dark'}
        </button>
      </div>
      <App />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
