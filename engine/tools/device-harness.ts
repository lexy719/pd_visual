/**
 * Emit a static page exercising every device, using the REAL DEVICE_CSS (imported, never copied —
 * a hand-copied harness verifies the copy, not what ships). Written to logs/device-harness.html so
 * it can be opened directly and measured in a browser.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEVICE_CSS } from '../agent/devices.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Stand-ins for the per-run theme variables the writer normally emits.
const THEME = `
:root {
  --foreground: #14181f; --muted-foreground: #6b7480; --card: #ffffff; --border: #e2e6ea;
  --accent: #2f6df6; --radius: 12px; --font-display: Georgia, serif; --container: 1152px;
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: var(--foreground); background: #fbfcfd; }
.container-page { max-width: var(--container); margin-inline: auto; padding-inline: 24px; }
.section-pad { padding-block: 96px; }
h2 { font-family: var(--font-display); font-size: 34px; margin: 0 0 32px; }
h3 { margin: 0 0 8px; font-size: 18px; }
p { margin: 0; color: var(--muted-foreground); }
.btn { display: inline-block; background: var(--accent); color: #fff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; }
`

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>device harness</title><style>${THEME}${DEVICE_CSS}</style></head><body>

<section class="section-pad" id="s-side-rail"><div class="container-page">
  <h2>dev-side-rail</h2>
  <div class="dev-side-rail">
    <div id="rail"><strong>Contents</strong><p>01 Intake<br>02 Diagnosis<br>03 Treatment<br>04 Aftercare</p></div>
    <div id="rail-body">
      ${Array.from({ length: 8 }, (_, i) => `<div style="margin-bottom:40px"><h3>Step ${i + 1}</h3><p>A paragraph of body copy long enough that the rail has something to hold position against while the reader scrolls through the content beside it.</p></div>`).join('')}
    </div>
  </div>
</div></section>

<section class="section-pad" id="s-compare"><div class="container-page">
  <h2>dev-compare</h2>
  <div class="dev-compare"><table>
    <thead><tr><th>Capability</th><th>Standard</th><th>Extended</th></tr></thead>
    <tbody>
      <tr><td>Same-day appointments</td><td class="dev-compare-yes">Included</td><td class="dev-compare-yes">Included</td></tr>
      <tr><td>Out-of-hours cover</td><td class="dev-compare-no">Not included</td><td class="dev-compare-yes">Included</td></tr>
      <tr><td>Dental scale and polish</td><td class="dev-compare-no">Not included</td><td class="dev-compare-yes">Annual</td></tr>
    </tbody>
  </table></div>
</div></section>

<section class="section-pad" id="s-faq"><div class="container-page">
  <h2>dev-faq</h2>
  <div class="dev-faq">
    <details id="faq-1"><summary>Do you treat exotic pets?</summary><p>Yes — rabbits, ferrets and most birds. Reptiles are referred to a specialist practice two miles away.</p></details>
    <details><summary>How do I get my records transferred?</summary><p>Give us your previous practice name and we request the file the same day.</p></details>
    <details><summary>Is there parking?</summary><p>Six spaces at the rear, including one accessible bay.</p></details>
  </div>
</div></section>

<section class="section-pad" id="s-price"><div class="container-page">
  <h2>dev-price-table</h2>
  <div class="dev-price-table">
    <div id="tier-1"><h3>Basic</h3><span class="dev-price-n">£12</span><span class="dev-price-p">per month</span><p>Routine care for one healthy adult animal.</p><div><a class="btn" href="#">Choose Basic</a></div></div>
    <div id="tier-2" class="dev-price-featured"><h3>Complete</h3><span class="dev-price-n">£24</span><span class="dev-price-p">per month</span><p>Everything in Basic, plus dental and out-of-hours cover, and a longer list of included treatments so this card is deliberately taller than its neighbours.</p><div><a class="btn" href="#">Choose Complete</a></div></div>
    <div id="tier-3"><h3>Senior</h3><span class="dev-price-n">£29</span><span class="dev-price-p">per month</span><p>For animals over eight.</p><div><a class="btn" href="#">Choose Senior</a></div></div>
  </div>
</div></section>

</body></html>`

mkdirSync(join(ROOT, 'logs'), { recursive: true })
const out = join(ROOT, 'logs', 'device-harness.html')
writeFileSync(out, html, 'utf8')
console.log(out)
