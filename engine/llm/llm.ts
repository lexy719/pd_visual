/**
 * Multi-tier LLM client for the generation agent.
 *
 * THREE independent tiers, each configured by its own env vars (same DESIGN_LLM_* pattern):
 *   REASONING_LLM_*  → questions · concept · plan() · artDirect()   (quality-sensitive)
 *   BULK_LLM_*       → per-section scratch codegen · self-critique   (volume)
 *   DESIGN_LLM_*     → legacy/fallback tier (kept working, no longer on the hot path)
 *
 * Each tier auto-detects its API dialect from the base URL:
 *   *.anthropic.com  → Anthropic Messages API  (x-api-key, POST /messages, content[] response)
 *   anything else    → OpenAI-compatible        (Bearer, POST /chat/completions, choices[] response)
 *
 * Anthropic is NOT OpenAI-compatible: different endpoint, headers, a required max_tokens, the system
 * prompt as a top-level field, and a content-block response. All of that is handled per-flavor below;
 * the retry/backoff loop is shared. Swapping any tier to a different provider is ONLY env vars.
 */

import '../config/env.js' // loads web-design-agent/.env into process.env before we read it

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type Flavor = 'openai' | 'anthropic'

interface TierCfg {
  base: string
  key: string
  model: string
  flavor: Flavor
  /** short name used in log lines + error messages, e.g. "reasoning" */
  label: string
}

/** Anthropic is detected by host — the one dialect that isn't OpenAI-compatible. */
const detectFlavor = (base: string): Flavor => (/anthropic\.com/i.test(base) ? 'anthropic' : 'openai')

function tierFrom(prefix: string, defBase: string, defKey: string, defModel: string, label: string): TierCfg {
  const base = (process.env[`${prefix}_LLM_BASE_URL`] || defBase).replace(/\/$/, '')
  const key = process.env[`${prefix}_LLM_API_KEY`] || defKey
  const model = process.env[`${prefix}_LLM_MODEL`] || defModel
  return { base, key, model, flavor: detectFlavor(base), label }
}

const DESIGN = tierFrom('DESIGN', 'http://127.0.0.1:11434/v1', 'ollama', 'qwen2.5:7b', 'design')
const REASONING = tierFrom('REASONING', 'https://api.anthropic.com/v1', '', 'claude-sonnet-5', 'reasoning')
const BULK = tierFrom('BULK', 'https://api.anthropic.com/v1', '', 'claude-haiku-4-5-20251001', 'bulk')

/** Legacy export (run summary / display). Plus the new per-tier models. */
export const LLM_MODEL = DESIGN.model
export const REASONING_MODEL = REASONING.model
export const BULK_MODEL = BULK.model

/** Statuses worth retrying: rate limits (429) + transient server/overload errors (incl. Anthropic 529). */
const RETRIABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529])
const MAX_ATTEMPTS = 6
/** Anthropic requires max_tokens; default it generously for reasoning JSON when a caller doesn't set one. */
const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** How long to wait before a retry: honour the server's Retry-After header, else exponential backoff. */
function waitMs(res: Response | null, attempt: number): number {
  const ra = res?.headers.get('retry-after')
  if (ra) {
    const secs = Number(ra)
    if (!Number.isNaN(secs)) return Math.min(secs * 1000 + 500, 65000)
    const at = Date.parse(ra)
    if (!Number.isNaN(at)) return Math.min(Math.max(0, at - Date.now()) + 500, 65000)
  }
  return Math.min(1000 * 2 ** (attempt - 1), 30000) + Math.floor(Math.random() * 400)
}

interface BuiltRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** Per-flavor request construction — this is where OpenAI and Anthropic diverge. */
function buildRequest(tier: TierCfg, messages: ChatMsg[], opts: { temperature?: number; maxTokens?: number }): BuiltRequest {
  if (tier.flavor === 'anthropic') {
    // Anthropic: system is a TOP-LEVEL field, messages carry only user/assistant, max_tokens is REQUIRED,
    // and temperature is OMITTED (Sonnet 5 rejects a non-default temperature with a 400). thinking is
    // disabled so a structured JSON/code reply isn't truncated by adaptive thinking eating the budget.
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const body: Record<string, unknown> = {
      model: tier.model,
      max_tokens: opts.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      thinking: { type: 'disabled' },
      messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
    }
    if (system) body.system = system
    return {
      url: `${tier.base}/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': tier.key, 'anthropic-version': '2023-06-01' },
      body
    }
  }
  // OpenAI-compatible (Groq / Cerebras / Ollama / OpenAI).
  const body: Record<string, unknown> = {
    model: tier.model,
    messages,
    temperature: opts.temperature ?? 0.4,
    stream: false
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens
  return {
    url: `${tier.base}/chat/completions`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tier.key}` },
    body
  }
}

/** Per-flavor response extraction. Returns the assistant text, or null when the reply carried none. */
function parseResponse(tier: TierCfg, json: unknown): string | null {
  if (tier.flavor === 'anthropic') {
    const blocks = ((json as { content?: Array<{ type?: string; text?: string }> }).content) ?? []
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    return text || null
  }
  return (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? null
}

/** Drive one tier: build → fetch → retry on 429/5xx (honouring Retry-After) → extract. Flavor-agnostic loop. */
async function callTier(tier: TierCfg, messages: ChatMsg[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const { url, headers, body } = buildRequest(tier, messages, opts)
  let lastErr = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    } catch (e) {
      lastErr = (e as Error).message
      if (attempt < MAX_ATTEMPTS) {
        const w = waitMs(null, attempt)
        console.warn(`  \x1b[2m⏳ [${tier.label}] LLM unreachable (${lastErr}) — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${Math.ceil(w / 1000)}s…\x1b[0m`)
        await sleep(w)
        continue
      }
      throw new Error(`Can't reach the ${tier.label} LLM at ${tier.base} after ${MAX_ATTEMPTS} tries.\n  ${lastErr}`)
    }

    if (res.ok) {
      const out = parseResponse(tier, await res.json())
      if (out == null) throw new Error(`${tier.label} LLM returned no content`)
      return out
    }

    const text = (await res.text()).slice(0, 300)
    if (RETRIABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
      const w = waitMs(res, attempt)
      const why = res.status === 429 ? 'rate limit' : 'transient server error'
      console.warn(`  \x1b[2m⏳ [${tier.label}] LLM ${res.status} (${why}) — waiting ${Math.ceil(w / 1000)}s, retry ${attempt}/${MAX_ATTEMPTS - 1}…\x1b[0m`)
      await sleep(w)
      continue
    }
    throw new Error(`${tier.label} LLM ${res.status}: ${text}`)
  }
  throw new Error(`${tier.label} LLM failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastErr || 'unknown'}`)
}

const asMessages = (system: string, user: string): ChatMsg[] => [
  { role: 'system', content: system },
  { role: 'user', content: user }
]

/** Legacy DESIGN-tier chat (kept for backward compatibility; not on the reasoning/bulk hot path). */
export const chat = (messages: ChatMsg[], opts?: { temperature?: number; maxTokens?: number }): Promise<string> =>
  callTier(DESIGN, messages, opts)

/** Legacy DESIGN-tier completion — unchanged signature, so nothing already calling it breaks. */
export const complete = (system: string, user: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> =>
  callTier(DESIGN, asMessages(system, user), opts)

/** REASONING tier — questions, concept, plan, art-direction. */
export const completeReasoning = (system: string, user: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> =>
  callTier(REASONING, asMessages(system, user), opts)

/** BULK tier — per-section codegen + self-critique. Escalates to REASONING on repair (see generate.ts). */
export const completeBulk = (system: string, user: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> =>
  callTier(BULK, asMessages(system, user), opts)

/** Pull the first balanced JSON object/array out of a model reply (tolerates prose + fences). */
export function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.search(/[[{]/)
  if (start === -1) throw new Error(`No JSON found in model reply:\n${text.slice(0, 200)}`)
  const open = cleaned[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)) as T
    }
  }
  throw new Error(`Unbalanced JSON in model reply:\n${text.slice(0, 200)}`)
}

/** Strip markdown code fences and any leading prose, returning just the code body. */
export function extractCode(text: string): string {
  let t = text.trim()
  const fence = t.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/)
  if (fence) t = fence[1]
  t = t
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .join('\n')
  return t.trim()
}
