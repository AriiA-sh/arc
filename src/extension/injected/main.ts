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
    current = wrapProvider(val, handleRequest)
  }

  try {
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      get() {
        return current
      },
      set(val) {
        setEthereum(val)
      },
    })
  } catch {
    // property already non-configurable: wrap whatever is there now
    const eth = (window as unknown as { ethereum?: unknown }).ethereum
    if (eth) setEthereum(eth)
  }

  return true
}

installProviderInterception()