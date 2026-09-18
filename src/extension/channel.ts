export const PAGE_CHANNEL = 'ARCLENS_PAGE'
export const INJECTED_FLAG = '__arcLensInjected'
export const PROXY_FLAG = 'isArcLensProxy'

/** Messages posted by the injected (MAIN world) script into the page DOM. */
export interface InjectedOutbound {
  channel: typeof PAGE_CHANNEL
  type: 'TX_CAPTURED'
  uid: string
  method: string
  payload: unknown
}

/** Requests from the page (dApp) into the wallet that Arc Lens intercepts. */
export interface CapturedRequest {
  method: string
  params: unknown[]
  tx?: {
    from?: string
    to?: string
    value?: string
    data?: string
    chainId?: string | number
  }
  domain?: unknown
  primaryType?: string
}

export interface RiskSummary {
  uid: string
  human: string
  kind: string
  severity: 'safe' | 'warning' | 'severe' | 'unknown'
  highlights: string[]
  count: number
  decoded?: unknown
  findings?: unknown[]
  hash?: string
  to?: string
  value?: string
  /** Advisory, user-opted-in AI explanation (Stage 8). Never affects decisions. */
  aiExplain?: string
}

export type PageBoundMessage =
  | InjectedOutbound
  | { channel: typeof PAGE_CHANNEL; type: 'PING' }
  | { channel: typeof PAGE_CHANNEL; type: 'RISK_AI_EXTRA'; uid: string; aiExplain: string }

export interface ExtensionSettings {
  aiProvider: 'disabled' | 'gemini' | 'openai' | 'anthropic'
  apiKey?: string
  network?: 'testnet' | 'mainnet'
  expectedChainId?: number
  overlayEnabled?: boolean
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  aiProvider: 'disabled',
  network: 'testnet',
  expectedChainId: 5042002,
  overlayEnabled: true,
}

export interface CapturedTxRequest {
  uid: string
  method: string
  from?: string
  to?: string
  value?: string
  data?: string
  requestChainId?: string | number
  ts: number
  origin: string
}

export function newUid(): string {
  return `arcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}