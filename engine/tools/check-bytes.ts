/**
 * Source-byte integrity check.
 *
 * Catches a corruption class that is INVISIBLE in every editor and in `grep`/Read output: a control
 * character sitting where source text was meant to be. It happens when a file is written through a
 * layer that interprets escapes — e.g. a Python heredoc using a non-raw string, where the two
 * characters `\b` in a JS regex become one 0x08 byte. The regex then silently requires a literal
 * backspace and can never match, while the file still *reads* as `/\bfoo\b/` on screen.
 *
 * This cost a long debugging session: `lintDesign` returned [] on input it should have flagged, and
 * all eight `REGISTER_HINTS` keyword fallbacks were dead — both from exactly this. Byte-level
 * assertions are the only thing that sees it, so this runs as a check rather than living in a note.
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Bytes that are never legitimate in this repo's text sources. TAB/LF are allowed and excluded. */
const FORBIDDEN: Record<number, string> = {
  0x00: 'NUL',
  0x07: 'BEL (a \\a that got interpreted)',
  0x08: 'BACKSPACE (a regex \\b that got interpreted)',
  0x0b: 'VTAB (a \\v that got interpreted)',
  0x0c: 'FORMFEED (a \\f that got interpreted)',
  0x1b: 'ESC'
}

// CR is tracked separately: it is not corruption, but mixed line endings break exact-match tooling.
const CR = 0x0d

const PATTERNS = ['engine/**/*.ts', 'studio/**/*.ts', 'studio/**/*.tsx', 'knowledge/**/*.md', '*.md']

type Hit = { file: string; line: number; byte: number; name: string; text: string }

export function scanSources(root = ROOT): { hits: Hit[]; crFiles: string[]; scanned: number } {
  const files = PATTERNS.flatMap((p) => globSync(p, { cwd: root })).sort()
  const hits: Hit[] = []
  const crFiles: string[] = []

  for (const rel of files) {
    const buf = readFileSync(join(root, rel))
    if (buf.includes(CR)) crFiles.push(rel)

    let line = 1
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i]!
      if (b === 0x0a) {
        line++
        continue
      }
      const name = FORBIDDEN[b]
      if (!name) continue
      // Show the offending line with the control char made visible.
      const start = buf.lastIndexOf(0x0a, i) + 1
      let end = buf.indexOf(0x0a, i)
      if (end === -1) end = buf.length
      const text = buf
        .subarray(start, end)
        .toString('utf8')
        .replace(/[\x00\x07\x08\x0b\x0c\x1b]/g, (c) => `<0x${c.charCodeAt(0).toString(16).padStart(2, '0')}>`)
      hits.push({ file: rel, line, byte: b, name, text: text.trim().slice(0, 120) })
    }
  }
  return { hits, crFiles, scanned: files.length }
}

const { hits, crFiles, scanned } = scanSources()

for (const h of hits) {
  console.error(`${h.file}:${h.line}  ${h.name}\n    ${h.text}`)
}
if (crFiles.length) {
  console.error(`\nCRLF line endings (breaks exact-match editing) in ${crFiles.length} file(s):`)
  for (const f of crFiles) console.error(`  ${f}`)
}

if (hits.length || crFiles.length) {
  console.error(`\nFAIL — ${hits.length} control-character site(s), ${crFiles.length} CRLF file(s), ${scanned} scanned.`)
  console.error('Repair: replace the control byte with the two characters it was meant to be (0x08 -> \\b).')
  process.exit(1)
}
console.log(`OK — ${scanned} source files, no control characters, no CRLF.`)
