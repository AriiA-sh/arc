export interface WalletStatus {
  detected: boolean
  providerName?: string
  isMetaMask?: boolean
  account?: string
  chainId?: string
  /** human-readable network label when recognized */
  networkLabel?: string
  /** true when connected to Arc Testnet */
  onArcTestnet: boolean
  error?: string
}

/**
 * Minimal EIP-1193 provider surface Arc Lens needs.
 * Note: Arc Lens only ever READS from the wallet — address and chain id.
 * It never requests, receives or stores any private key / seed material.
 */
export interface Eip1193Provider {
  isMetaMask?: boolean
  isArcLensProxy?: boolean
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

export function isEip1193Provider(x: unknown): x is Eip1193Provider {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  return typeof p.request === 'function'
}

export function isArcProvider(x: unknown): boolean {
  return isEip1193Provider(x) && (x as unknown as { isArcLensProxy?: boolean }).isArcLensProxy === true
}