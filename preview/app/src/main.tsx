import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './globals.css'
import App from './App'

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
