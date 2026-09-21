import { ARC_CHAIN_ID, ARC_MAINNET_CHAIN_ID } from '../../arc/chain'
import { isEip1193Provider, isArcProvider, type Eip1193Provider, type WalletStatus } from './types'

export function getWindowProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const eth = w.ethereum
  if (!isEip1193Provider(eth)) return null
  return eth as Eip1193Provider
}

export function providerName(p: Eip1193Provider): string {
  if ((p as unknown as { isBraveWallet?: boolean }).isBraveWallet) return 'Brave Wallet'
  if ((p as unknown as { isMetaMask?: boolean }).isMetaMask) return 'MetaMask'
  if ((p as unknown as { isRabby?: boolean }).isRabby) return 'Rabby'
  if ((p as unknown as { isCoinbaseWallet?: boolean }).isCoinbaseWallet) return 'Coinbase Wallet'
  if (p.isArcLensProxy) return 'Arc Lens'
  return 'Wallet'
}

export async function detectWallet(): Promise<WalletStatus> {
  const p = getWindowProvider()
  if (!p) {
    return { detected: false, onArcTestnet: false }
  }
  const name = providerName(p)
  const status: WalletStatus = {
    detected: true,
    providerName: name,
    isMetaMask: !!p.isMetaMask,
    onArcTestnet: false,
  }
  if (isArcProvider(p)) status.providerName = 'Arc Lens (proxy)'

  try {
    const chain = await p.request({ method: 'eth_chainId' })
    const chainId = typeof chain === 'string' ? chain : String(chain)
    status.chainId = chainId
    const id = parseInt(chainId, 16)
    status.onArcTestnet = id === ARC_CHAIN_ID
    status.onArcMainnet = id === ARC_MAINNET_CHAIN_ID
    status.networkLabel = status.onArcTestnet ? 'Arc Testnet' : status.onArcMainnet ? 'Arc Mainnet' : 'Other network'
  } catch (e) {
    status.error = `chain request failed: ${(e as Error).message}`
  }

  try {
    const accounts = await p.request({ method: 'eth_accounts' })
    if (Array.isArray(accounts) && accounts.length > 0) {
      status.account = String(accounts[0])
    }
  } catch (e) {
    status.error = `${status.error ?? ''} accounts request failed: ${(e as Error).message}`.trim()
  }

  return status
}

/**
 * Ask the wallet to expose the connected account (eth_requestAccounts).
 * Read-only: returns an address, never a key, never a signature.
 */
export async function connectWallet(): Promise<WalletStatus> {
  const p = getWindowProvider()
  if (!p) return { detected: false, onArcTestnet: false }
  await p.request({ method: 'eth_requestAccounts' })
  return detectWallet()
}

export function watchAccounts(handler: (account: string | undefined) => void): () => void {
  const p = getWindowProvider()
  if (!p || !p.on) return () => {}
  const cb = (accounts: unknown) => {
    const list = Array.isArray(accounts) ? accounts : []
    handler(list.length > 0 ? String(list[0]) : undefined)
  }
  p.on('accountsChanged', cb)
  return () => p.removeListener?.('accountsChanged', cb)
}