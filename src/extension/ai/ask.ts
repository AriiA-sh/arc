import type { RiskSummary } from '../channel'

export type AiProviderId = 'gemini' | 'openai' | 'anthropic'

export interface AiEnrichRequest {
  provider: AiProviderId
  apiKey: string
  summary: Pick<RiskSummary, 'human' | 'kind' | 'severity' | 'count' | 'highlights' | 'findings' | 'to' | 'value'>
}

export interface AiEnrichResult {
  ok: boolean
  text?: string
  error?: string
}

const SYSTEM_PROMPT = `You are "Arc Lens", a transaction comprehension helper for the Arc blockchain.
A deterministic local rule engine already produced the assessment below. Your job:
1. Explain the transaction and every finding in plain, non-technical language (at most 4 short sentences). No markdown.
2. Explicitly state whether the risk assessment looks right or wrong, and why.
3. Never mention, ask for, or handle private keys or seed phrases.
4. Never invent facts. If evidence is insufficient, say so.`

function buildPrompt(summary: AiEnrichRequest['summary']): string {
  const block = {
    action: summary.human,
    kind: summary.kind,
    severity: summary.severity,
    issues: summary.count,
    highlights: summary.highlights,
    target: summary.to,
    value: summary.value,
    findings: (summary.findings ?? []).map((f) => ({
      rule: (f as { rule?: string }).rule,
      reason: (f as { reason?: string }).reason,
      evidence: (f as { evidence?: string }).evidence,
      limitation: (f as { limitation?: string }).limitation,
    })),
  }
  return JSON.stringify(block, null, 2)
}

interface Endpoint {
  url: string
  headers: Record<string, string>
  body: string
}

function toEndpoint(req: AiEnrichRequest): Endpoint {
  const prompt = `${SYSTEM_PROMPT}\n\nAssessment:\n${buildPrompt(req.summary)}`
  if (req.provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(req.apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  }
  if (req.provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
    }
  }
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
  }
}

function parseText(provider: AiProviderId, json: any): string | null {
  try {
    if (provider === 'gemini') return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null
    if (provider === 'openai') return json?.choices?.[0]?.message?.content ?? null
    return json?.content?.[0]?.text ?? null
  } catch {
    return null
  }
}

const TIMEOUT_MS = 12000

/** BYOK call to the chosen provider. Never throws; never blocks decisions. */
export async function askAi(req: AiEnrichRequest): Promise<AiEnrichResult> {
  const endpoint = toEndpoint(req)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: endpoint.body,
      signal: ctrl.signal,
    })
    if (!res.ok) return { ok: false, error: `AI provider HTTP ${res.status}` }
    const text = parseText(req.provider, await res.json())
    return text ? { ok: true, text: text.trim() } : { ok: false, error: 'AI provider returned no text' }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) }
  } finally {
    clearTimeout(timer)
  }
}

/** Only enrich when the user opted in with a key and there is something to explain. */
export function shouldEnrich(
  settings: { aiProvider?: string; apiKey?: string },
  summary: { severity?: string },
): boolean {
  return (
    (settings.aiProvider === 'gemini' || settings.aiProvider === 'openai' || settings.aiProvider === 'anthropic') &&
    !!settings.apiKey &&
    summary.severity !== 'safe' &&
    summary.severity !== 'unknown'
  )
}