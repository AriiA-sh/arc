import { INJECTED_FLAG, PAGE_CHANNEL, newUid, type CapturedRequest } from '../channel'
import { wrapProvider } from './proxy'

const TARGETED_METHODS = new Set([
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'eth_signTypedData',
  'personal_sign',
  'eth_sign',
  'wallet_switchEthereumChain',
])

function toTxCapture(method: string, params: unknown[]): { method: string; tx?: CapturedRequest['tx']; domain?: unknown; primaryType?: string } {
  const [first] = params
  const out: { method: string; tx?: CapturedRequest['tx']; domain?: unknown; primaryType?: string } = { method }

  if (method === 'eth_sendTransaction' && first && typeof first === 'object') {
    const t = first as Record<string, unknown>
    out.tx = {
      from: typeof t.from === 'string' ? t.from : undefined,
      to: typeof t.to === 'string' ? t.to : undefined,
      value: t.value !== undefined ? String(t.value) : undefined,
      data: typeof t.data === 'string' ? t.data : undefined,
      chainId: typeof t.chainId === 'string' || typeof t.chainId === 'number' ? t.chainId : undefined,
    }
  } else if (method === 'eth_signTypedData_v4' || method === 'eth_signTypedData') {
    // params: [address, typedDataJson]  (v4)  |  [typedDataJson, address] (legacy)
    const json = typeof first === 'string' ? first : typeof params[1] === 'string' ? params[1] : undefined
    if (json) {
      try {
        const data = JSON.parse(json)
        out.domain = data?.domain
        out.primaryType = data?.primaryType
      } catch {
        out.domain = undefined
      }
    }
  }

  return out
}

function emit(ev: { type: 'TX_CAPTURED'; uid: string; method: string; payload: unknown }) {
  window.postMessage({ channel: PAGE_CHANNEL, ...ev }, '*')
}

function handleRequest(method: string, params: unknown[]) {
  if (!TARGETED_METHODS.has(method)) return
  const cap = toTxCapture(method, params)
  const uid = newUid()
  emit({
    type: 'TX_CAPTURED',
    uid,
    method,
    payload: {
      ...cap,
      chainId: (window as unknown as { ethereum?: { chainId?: unknown } }).ethereum?.chainId,
    },
  })
}

export function installProviderInterception(): boolean {
  if ((window as unknown as Record<string, unknown>)[INJECTED_FLAG]) return false
  ;(window as unknown as Record<string, unknown>)[INJECTED_FLAG] = true

  let current: unknown = undefined

  function setEthereum(val: unknown) {
    if (!val || typeof val !== 'object') return
    current = wrapProvider(val, handleRequest)
  }

  // Grab whatever provider already exists before we take over the property.
  let preExisting: unknown
  try {
    preExisting = (window as unknown as { ethereum?: unknown }).ethereum
  } catch {
    preExisting = undefined
  }

  try {
    Object.defineProperty(window, 'ethereum', {
      // non-configurable + non-writable getter: a page cannot delete or
      // redefine the property to drop out of observation (Stage-b hardening).
      configurable: false,
      get() {
        return current
      },
      set(val) {
        // keep accepting the real provider if the wallet injects late
        setEthereum(val)
      },
    })
  } catch {
    // property already non-configurable on this page: wrap whatever is there
    const eth = (window as unknown as { ethereum?: unknown }).ethereum
    if (eth) setEthereum(eth)
  }

  if (preExisting) {
    setEthereum(preExisting)
  } else {
    // The wallet may inject a beat after our document_start script ran.
    // Poll briefly (best effort; the accessor setter also catches late loads).
    let tries = 0
    const timer = setInterval(() => {
      const eth = (window as unknown as { ethereum?: unknown }).ethereum
      if (eth && eth !== current) setEthereum(eth)
      if (current || ++tries > 50) clearInterval(timer)
    }, 100)
  }

  return true
}

installProviderInterception()