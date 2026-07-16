import type { FeedItem, StudioEvent } from './types'

export function Leaf({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 4C10 4 4 9.5 4 17c0 1.2.2 2.3.5 3 .3-4 3-8.5 9-11-4.5 3.2-6.7 7.2-7 11 1 .3 2 .5 3.2.5C18 20.5 21 12 20 4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="swatch" title={`${label}: ${hex}`}>
      <span className="swatch-chip" style={{ background: hex }} />
      <span className="swatch-label">{label}</span>
    </div>
  )
}

function EventCard({ ev }: { ev: StudioEvent }) {
  switch (ev.type) {
    case 'plan':
      return (
        <div className="step step-plan">
          <div className="step-title">🧭 Planned — {ev.brand}</div>
          <div className="tokens">{ev.mood.map((m) => <span key={m} className="token">{m}</span>)}</div>
          <div className="step-sub">{ev.sections.length} sections{ev.layout?.length ? ` · ${ev.layout[0]}` : ''}</div>
          <div className="step-sub dim">{ev.sections.join(' → ')}</div>
        </div>
      )
    case 'art-direction':
      return (
        <div className="step step-art">
          <div className="step-title">🎨 Art direction locked — <b>&nbsp;{ev.paletteName}</b></div>
          <div className="swatches">
            <Swatch hex={ev.palette.background} label="bg" />
            <Swatch hex={ev.palette.foreground} label="fg" />
            <Swatch hex={ev.palette.primary} label="primary" />
            <Swatch hex={ev.palette.accent} label="accent" />
          </div>
          <div className="tokens"><span className="token token-motion">motion: {ev.motion}</span></div>
          <div className="step-sub dim">{ev.rationale}</div>
        </div>
      )
    case 'section': {
      const back =
        ev.strategy === 'scratch' ? 'generated from scratch'
          : ev.strategy === 'motion-primitive' ? `motion primitive · ${ev.backing}`
            : ev.backing || 'component'
      return (
        <div className="step step-section">
          <div className="step-title"><span className="plus">＋</span> Added {ev.sectionType} section</div>
          <div className="step-sub">
            {back}
            {ev.motion ? <span className="token token-motion" style={{ marginLeft: 8 }}>motion: {ev.motion}</span> : null}
          </div>
        </div>
      )
    }
    case 'notice':
      return <div className={`notice ${ev.level === 'warn' ? 'warn' : ''}`}>{ev.level === 'warn' ? '⚠ ' : '✓ '}{ev.text}</div>
    case 'done':
      return <div className="step step-done">✅ Preview ready — {ev.fileCount} files written</div>
    case 'error':
      return <div className="step step-error">⚠ {ev.message}</div>
    default:
      return null
  }
}

export function Card({ item }: { item: FeedItem }) {
  if (item.kind === 'user') return <div className="msg-user">{item.text}</div>
  if (item.kind === 'assistant') {
    return (
      <div className="msg-assistant">
        <div className="avatar"><Leaf /></div>
        <div className="assistant-text">
          {item.text}
          {item.iterate && (
            <div className="iterate-note">
              <b>Note:</b> in-place editing isn’t built yet — this builds a <b>fresh</b> version from your message
              and replaces the preview, rather than editing the current one.
            </div>
          )}
        </div>
      </div>
    )
  }
  return <EventCard ev={item.ev} />
}
