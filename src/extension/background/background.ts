import { createPublicClient, http } from 'viem'
import { ARC_CHAINS, ARC_CHAIN_ID } from '../../arc/chain'
import { decodeTx } from '../../core/decoder/decoder'
import { makeTokenMetaFetcher } from '../../core/decoder/token-meta'
import { runRiskEngine } from '../../core/risk/engine'
import { DEFAULT_SETTINGS, newUid, type ExtensionSettings, type RiskSummary } from '../channel'
import { askAi, shouldEnrich } from '../ai/ask'
import { plain } from '../plain'

const clients = new Map<string, ReturnType<typeof createPublicClient>>()

function clientFor(settings: ExtensionSettings) {
  const network = settings.network === 'mainnet' ? ARC_CHAINS.mainnet : ARC_CHAINS.testnet
  let client = clients.get(network.rpcUrls.default.http[0])
  if (!client) {
    client = createPublicClient({ transport: http(network.rpcUrls.default.http[0]) })
    clients.set(network.rpcUrls.default.http[0], client)
  }
  return { client, chainId: network.id }
}

function metaFetcherFor(client: ReturnType<typeof createPublicClient>) {
  const fetcher = makeTokenMetaFetcher({
    readContract: (p) => client.readContract({ ...p, args: [] }) as any,
    getCode: (a) => client.getCode({ address: a }) as Promise<string | undefined>,
  })
  return { fetcher, hasCode: async (a: string) => {
    const code = await client.getCode({ address: a as `0x${string}` })
    return !!code && code !== '0x'
  } }
}

function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage?.local?.get(Object.keys(DEFAULT_SETTINGS), (v) => {
      resolve({ ...DEFAULT_SETTINGS, ...(v ?? {}) })
    })
  })
}

function newDecoded(decoded: Awaited<ReturnType<typeof decodeTx>>, requestChainId?: string | number) {
  if (requestChainId !== undefined) {
    const dec = requestChainId as string
    const parsed = typeof dec === 'string' && dec.startsWith('0x') ? parseInt(dec, 16) : Number(dec)
    if (Number.isFinite(parsed)) decoded.chainId = parsed
  }
  return decoded
}

async function analyzeSendTransaction(payload: {
  tx?: { from?: string; to?: string; value?: string; data?: string; chainId?: string | number }
}): Promise<RiskSummary> {
  const settings = await getSettings()
  const tx = payload.tx ?? {}
  const { client, chainId } = clientFor(settings)
  const meta = metaFetcherFor(client)
  const decoded = newDecoded(
    await decodeTx({ to: tx.to, value: tx.value, input: tx.data, from: tx.from }, { fetchTokenMeta: meta.fetcher }),
    tx.chainId,
  )
  const findings = await runRiskEngine(decoded, {
    chainId,
    from: tx.from,
    expectedChainId: settings.expectedChainId,
    hasCode: meta.hasCode,
  })
  const severe = findings.filter((f) => f.severity === 'severe')
  const warnings = findings.filter((f) => f.severity === 'warning')
  const severity = severe.length > 0 ? 'severe' : warnings.length > 0 ? 'warning' : decoded.ok ? 'safe' : 'unknown'

  return {
    uid: '',
    human: decoded.human,
    kind: decoded.kind,
    severity,
    highlights: [...severe, ...warnings].map((f) => f.rule),
    count: severe.length + warnings.length,
    decoded,
    findings,
    to: decoded.to,
    value: decoded.value.toString(),
  }
}

async function analyzeTypedSign(payload: { domain?: unknown; primaryType?: string }): Promise<RiskSummary> {
  const pt = payload.primaryType ?? 'unknown'
  return {
    uid: '',
    human: `Sign typed data (${pt})`,
    kind: 'typed_sign',
    severity: pt === 'Permit' ? 'warning' : 'safe',
    highlights: pt === 'Permit' ? ['Permit signature — may grant token spending'] : [],
    count: pt === 'Permit' ? 1 : 0,
    decoded: { primaryType: pt, domain: payload.domain },
    findings: [],
  }
}

async function analyzeGenericSign(method: string): Promise<RiskSummary> {
  const isEthSign = method === 'eth_sign'
  return {
    uid: '',
    human: method === 'personal_sign' ? 'Sign a message (personal_sign)' : 'Sign raw bytes (eth_sign)',
    kind: 'message_sign',
    severity: isEthSign ? 'warning' : 'safe',
    highlights: isEthSign ? ['eth_sign signs arbitrary data with no human-readable message'] : [],
    count: isEthSign ? 1 : 0,
    decoded: { method },
    findings: [],
  }
}

async function analyze(method: string, payload: {
  tx?: { from?: string; to?: string; value?: string; data?: string; chainId?: string | number }
  domain?: unknown
  primaryType?: string
}): Promise<RiskSummary> {
  const settings = await getSettings()
  const uid = newUid()
  if (method === 'eth_sendTransaction') {
    const s = await analyzeSendTransaction(payload)
    return { ...s, uid }
  }
  if (method === 'eth_signTypedData_v4' || method === 'eth_signTypedData') {
    const s = await analyzeTypedSign(payload)
    return { ...s, uid }
  }
  if (method === 'personal_sign' || method === 'eth_sign') {
    const s = await analyzeGenericSign(method)
    return { ...s, uid }
  }
  if (method === 'wallet_switchEthereumChain') {
    const s: RiskSummary = {
      uid,
      human: 'Switch network',
      kind: 'switch_chain',
      severity: (payload as { targetChain?: number }).targetChain === settings.expectedChainId ? 'safe' : 'warning',
      highlights: [],
      count: 0,
      findings: [],
    }
    // payload.params carries the target chain
    return s
  }
  void ARC_CHAIN_ID
  return { uid, human: method, kind: 'unhandled', severity: 'unknown', highlights: [], count: 0 }
}

/**
 * Advisory (Stage 8): after the deterministic result is already on its way to
 * the user, optionally ask the user's chosen provider (BYOK) for a plain
 * explanation and push it as a second message. Pure enrichment — never part of
 * a blocking path, never changes severity, failures are silent.
 */
function maybeEnrich(summary: RiskSummary, sender: chrome.runtime.MessageSender): void {
  const tabId = sender.tab?.id
  if (tabId === undefined) return
  void getSettings().then((settings) => {
    if (!shouldEnrich(settings, summary)) return
    return askAi({ provider: settings.aiProvider as 'gemini', apiKey: settings.apiKey ?? '', summary }).then((r) => {
      if (!r.ok || !r.text) return
      void chrome.tabs?.sendMessage(tabId, { msg: 'RISK_AI_EXTRA', uid: summary.uid, aiExplain: r.text }).catch(() => {})
      void chrome.storage?.local?.set({ lastAiExplain: plain({ uid: summary.uid, aiExplain: r.text }) })
    })
  }).catch(() => {})
}

/**
 * Privacy-first (host_permissions are minimal): on sites that are NOT
 * Arc-owned / localhost, protection is on-demand — the user clicks the action
 * icon and this injects the observer into the active tab (activeTab + scripting).
 */
async function activateCurrentTab(): Promise<{ ok: boolean; error?: string }> {
  const [tab] = await chrome.tabs?.query?.({ active: true, currentWindow: true })
  if (!tab?.id) return { ok: false, error: 'no active tab' }
  const url = tab.url ?? ''
  if (!/^https?:/i.test(url)) return { ok: false, error: 'unsupported page (chrome://…)' }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['injected.js'], world: 'MAIN' })
    // content.js is guarded against double-registration, safe to re-inject.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'], world: 'ISOLATED' })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind === 'ACTIVATE_TAB') {
    activateCurrentTab().then(sendResponse)
    return true
  }
  if (msg?.kind === 'TX_CAPTURED') {
    // Responses cross a real structured-clone boundary (service worker →
    // content script). decodeTx / viem can produce values that Chrome's
    // serializer rejects (BigInts, exotic prototypes), so normalise.
    analyze(msg.method, (msg.payload ?? {}) as { tx?: object; domain?: unknown; primaryType?: string })
      .then((summary) => {
        sendResponse(plain({ msg: 'RISK_RESULT', ...summary }))
        maybeEnrich(summary, _sender)
      })
      .catch((e) =>
        sendResponse({
          msg: 'RISK_RESULT',
          uid: msg.uid,
          human: 'Analysis failed',
          kind: 'error',
          severity: 'unknown',
          highlights: [String((e as Error)?.message ?? e)],
          count: 0,
          error: String((e as Error)?.message ?? e),
        }),
      )
    return true // async responds
  }
  return false
})