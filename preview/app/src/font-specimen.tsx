import { SPECIMENS } from './font-probe'

export default function FontSpecimen() {
  return (
    <div style={{ padding: 32, background: '#0d0e10', color: '#f2f3f5', minHeight: '100vh' }}>
      {SPECIMENS.map((s: any) => (
        <div key={s.key} style={{ borderBottom: '1px solid #26282c', padding: '22px 0' }}>
          <div style={{ font: '600 10px ui-monospace, monospace', letterSpacing: '.1em', textTransform: 'uppercase', color: '#7f8792', marginBottom: 8 }}>
            {s.key} · {s.display ? 'display' : ''}{s.display && s.body ? '+' : ''}{s.body ? 'body' : ''} — {s.character.slice(0, 78)}
          </div>
          <div style={{ fontFamily: s.stack, fontSize: 46, lineHeight: 1.05, letterSpacing: '-0.02em', fontWeight: 500 }}>
            One lot at a time
          </div>
          <div style={{ fontFamily: s.stack, fontSize: 15, lineHeight: 1.55, color: '#aab1ba', maxWidth: 620, marginTop: 8 }}>
            Above the town of Pitalito in Huila, the road narrows to switchbacks — the altitude does the work a roaster cannot.
          </div>
        </div>
      ))}
    </div>
  )
}
