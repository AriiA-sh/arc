import { askAi, shouldEnrich } from '../../src/extension/ai/ask'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ← ' + extra}`)
  if (!cond) failures++
}

const summary = {
  human: 'Approve token',
  kind: 'erc20_approve',
  severity: 'severe' as const,
  count: 2,
  highlights: ['Unlimited approval', 'Approval to a plain account'],
  to: '0x4444444444444444444444444444444444444444',
  value: '0',
  findings: [
    { rule: 'Unlimited approval', severity: 'warning', reason: 'r', evidence: 'e', limitation: 'l' },
    { rule: 'Approval to a plain account', severity: 'severe', reason: 'r', evidence: 'e', limitation: 'l' },
  ],
  uid: '',
}

type CapturedCall = { url: string; method?: string; headers?: Record<string, string>; body?: string }
const calls: CapturedCall[] = []

async function withMockFetch(
  responder: (url: string, init: any) => Promise<any>,
  fn: () => Promise<void>,
): Promise<void> {
  const real = globalThis.fetch
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body })
    const payload = await responder(url, init)
    return { ok: true, status: 200, json: async () => payload } as any
  }) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = real
  }
}

// --- gemini ---
await withMockFetch(
  () => ({ candidates: [{ content: { parts: [{ text: 'Gemini plain text.' }] } }] }),
  async () => {
    const r = await askAi({ provider: 'gemini', apiKey: 'k123', summary })
    check('gemini: parses text', r.ok && r.text === 'Gemini plain text.', JSON.stringify(r))
    const call = calls[calls.length - 1]
    check('gemini: key in URL not header', call.url.includes('key=k123') && !('Authorization' in call.headers!), call.url)
    const prompt = JSON.parse(call.body).contents[0].parts[0].text
    check('gemini: prompt has no api key inside', !prompt.includes('k123') && prompt.includes('Approve token'))
  },
)

// --- openai ---
await withMockFetch(
  () => ({ choices: [{ message: { content: 'OpenAI plain text.' } }] }),
  async () => {
    const r = await askAi({ provider: 'openai', apiKey: 'sk-secret', summary })
    check('openai: parses text', r.ok && r.text === 'OpenAI plain text.', JSON.stringify(r))
    const call = calls[calls.length - 1]
    check(
      'openai: bearer auth header, key not in URL/body',
      call.url.startsWith('https://api.openai.com') &&
        call.headers?.['Authorization'] === 'Bearer sk-secret' &&
        !call.url.includes('sk-secret') &&
        !JSON.stringify(call.body).includes('sk-secret'),
    )
  },
)

// --- anthropic ---
await withMockFetch(
  () => ({ content: [{ text: 'Claude plain text.' }] }),
  async () => {
    const r = await askAi({ provider: 'anthropic', apiKey: 'sk-ant-x', summary })
    check('anthropic: parses text', r.ok && r.text === 'Claude plain text.', JSON.stringify(r))
    const call = calls[calls.length - 1]
    check(
      'anthropic: x-api-key header + version',
      call.headers?.['x-api-key'] === 'sk-ant-x' &&
        call.headers?.['anthropic-version'] === '2023-06-01' &&
        !JSON.stringify(call.body).includes('sk-ant-x'),
      JSON.stringify(call.headers),
    )
  },
)

// --- error paths ---
await withMockFetch(
  () => ({ candidates: [] }),
  async () => {
    const r = await askAi({ provider: 'gemini', apiKey: 'k', summary })
    check('gemini: empty response → ok:false', !r.ok && !!r.error, JSON.stringify(r))
  },
)
await withMockFetch(
  async (url: string) => {
    if (url.includes('api.openai.com')) throw new Error('network down')
    return {}
  },
  async () => {
    const r = await askAi({ provider: 'openai', apiKey: 'k', summary })
    check('openai: network failure → not throw, ok:false', !r.ok && r.error === 'network down', JSON.stringify(r))
  },
)
// enrich gate
check('shouldEnrich: disabled → false', !shouldEnrich({ aiProvider: 'disabled', apiKey: 'k' }, { severity: 'severe' }))
check('shouldEnrich: no key → false', !shouldEnrich({ aiProvider: 'gemini' }, { severity: 'severe' }))
check('shouldEnrich: unknown provider → false', !shouldEnrich({ aiProvider: 'huggingface', apiKey: 'k' }, { severity: 'severe' }))
check('shouldEnrich: safe result → false', !shouldEnrich({ aiProvider: 'gemini', apiKey: 'k' }, { severity: 'safe' }))
check(
  'shouldEnrich: enabled+key+risk → true',
  shouldEnrich({ aiProvider: 'openai', apiKey: 'k' }, { severity: 'warning' }),
)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)