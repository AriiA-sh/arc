import { createPublicClient, http, type Chain } from 'viem'
import { arcTestnet, arcMainnet } from './chain'

/**
 * Public, read-only clients for Arc. No keys, no auth required.
 * `publicClient` (testnet) is the default and is used by CLI scripts;
 * web analysis can switch with setAnalysisChain().
 */
function makeClient(chain: Chain) {
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })
}

export const publicClient = makeClient(arcTestnet)
export const mainnetClient = makeClient(arcMainnet)

let activeChainId: number = arcTestnet.id

export function setAnalysisChain(chainId: number): void {
  activeChainId = chainId
}

export function currentAnalysisChainId(): number {
  return activeChainId
}

export function activeClient() {
  return activeChainId === arcMainnet.id ? mainnetClient : publicClient
}

export function currentChain() {
  return activeChainId === arcMainnet.id ? arcMainnet : arcTestnet
}

export function explorerUrl(hash: string): string {
  return `${currentChain().blockExplorers.default.url}/tx/${hash}`
}