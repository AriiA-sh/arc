import { wrapProvider } from '../../src/extension/injected/proxy'
import { PAGE_CHANNEL, type RiskSummary } from '../../src/extension/channel'
import { decodeTx } from '../../src/core/decoder/decoder'
import { runRiskEngine } from '../../src/core/risk/engine'

/**
 * Full Stage 6 integration test — no browser needed.
 * Simulates the proxy → content → background pipeline.
 */

const CAPTURED: Array<{ method: string; payload: unknown }> = []

function onRequest(method: string, params: unknown[]) {
  CAPTURED.push({ method, payload: params[0] })
}

// 1. Build a mock real wallet
const mockWallet = {
  isMetaMask: true,
  chainId: '0x4cef52',
  request: async ({ method, params }) => {
    if (method === 'eth_chainId') return '0x4cef52'
    if (method === 'eth_accounts') return ['0x2222222222222222222222222222222222222222']
    if (method === 'eth_sendTransaction') return '0xMOCKHASH'
    throw new Error('unhandled: ' + method)
  },
  on: () => {},
  removeListener: () => {},
}

// 2. Wrap with Arc Lens proxy
const proxy = wrapProvider(mockWallet, onRequest)
const isProxy = (proxy as Record<string, unknown>).isArcLensProxy === true

// 3. Test: call request on proxy (mimics dApp calling eth_sendTransaction)
const unlimited = 'ff'.repeat(32)
const data = '0x095ea7b3' + '000000000000000000000000' + '4444444444444444444444444444444444444444' + unlimited

await (proxy as any).request({
  method: 'eth_sendTransaction',
  params: [{ from: '0x2222222222222222222222222222222222222222', to: '0x1111111111111111111111111111111111111111', value: '0x0', data }],
})

// 4. Decode captured request (simulates background worker)
const captured = CAPTURED[0]
const tx = captured.payload as { from?: string; to?: string; value?: string; data?: string }

const decoded = await decodeTx({ to: tx.to, value: tx.value, input: tx.data, from: tx.from })
const hasCode = async (a: string) => {
  if (a.toLowerCase().endsWith('1111')) return true // token contract has code
  return false
}
const findings = await runRiskEngine(decoded, { chainId: 5042002, from: tx.from, expectedChainId: 5042002, hasCode })

// 5. Build risk summary (simulates background output)
const severe = findings.filter((f) => f.severity === 'severe')
const warnings = findings.filter((f) => f.severity === 'warning')
const summary: RiskSummary = {
  uid: 'test-001',
  human: decoded.human,
  kind: decoded.kind,
  severity: severe.length > 0 ? 'severe' : warnings.length > 0 ? 'warning' : 'safe',
  highlights: [...severe, ...warnings].map((f) => f.rule),
  count: severe.length + warnings.length,
  decoded,
  findings,
}

// 6. Simulate content posting result back to page
const listeners = new Set<(ev: { data?: unknown }) => void>()
globalThis.window = {
  addEventListener: (_: string, fn: (ev: { data?: unknown }) => void) => listeners.add(fn),
  postMessage: (data: unknown) => {
    for (const fn of listeners) fn({ data })
  },
} as unknown as Window & typeof globalThis

let postedRiskResult = false
window.addEventListener('message', (ev) => {
  if (ev.data?.channel === PAGE_CHANNEL && ev.data?.type === 'RISK_RESULT') postedRiskResult = true
})
window.postMessage({ channel: PAGE_CHANNEL, type: 'RISK_RESULT', ...summary }, '*')

const result = {
  proxyActive: isProxy,
  captured,
  summary: {
    human: summary.human,
    kind: summary.kind,
    severity: summary.severity,
    highlights: summary.highlights,
    count: summary.count,
  },
  hasFindings: findings.length > 0,
  findingSummary: findings.map((f) => ({ id: f.id, severity: f.severity, rule: f.rule })),
  postedRiskResult,
  PASS:
    isProxy
    && captured.method === 'eth_sendTransaction'
    && summary.human === 'Approve token'
    && summary.kind === 'erc20_approve'
    && summary.severity === 'severe'
    && summary.highlights.includes('Unlimited approval')
    && summary.highlights.includes('Approval to a plain account')
    && summary.count >= 2
    && findings.some((f) => f.id === 'unlimited-approval')
    && findings.some((f) => f.id === 'approve-to-eoa')
    && postedRiskResult,
}

console.log(JSON.stringify(result, null, 2))
process.exit(result.PASS ? 0 : 1)