function dims(b: Buffer): string {
  if (b[0] === 0x89) return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
  let o = 2
  while (o < b.length - 9) {
    if (b[o] !== 0xff) { o++; continue }
    const m = b[o+1]!
    if (m >= 0xc0 && m <= 0xcf && ![0xc4,0xc8,0xcc].includes(m)) return `${b.readUInt16BE(o+7)}x${b.readUInt16BE(o+5)}`
    o += 2 + b.readUInt16BE(o+2)
  }
  return '?'
}
const variants: Array<[string,string]> = [
  ['flux 2048x878',   'https://image.pollinations.ai/prompt/dark%20server%20room?width=2048&height=878&nologo=true&model=flux&seed=31'],
  ['no model 1680',   'https://image.pollinations.ai/prompt/dark%20server%20room?width=1680&height=720&nologo=true&seed=32'],
  ['turbo 1680',      'https://image.pollinations.ai/prompt/dark%20server%20room?width=1680&height=720&nologo=true&model=turbo&seed=33'],
  ['flux enhance',    'https://image.pollinations.ai/prompt/dark%20server%20room?width=1680&height=720&nologo=true&model=flux&enhance=true&seed=34']
]
for (const [label, url] of variants) {
  try {
    const r = await fetch(url)
    const b = Buffer.from(await r.arrayBuffer())
    const [w,h] = dims(b).split('x').map(Number)
    console.log(`${label.padEnd(18)} -> ${dims(b).padEnd(11)} ${(w*h/1e6).toFixed(2)}MP  ${(b.length/1024).toFixed(0)}KB`)
  } catch (e) { console.log(`${label.padEnd(18)} -> FAILED`) }
}
