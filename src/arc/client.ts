import { createPublicClient, http } from 'viem'
import { arcTestnet } from './chain'

/**
 * Public, read-only client for Arc Testnet.
 * Uses the official free RPC endpoint. No keys, no auth required.
 */
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
})

export function explorerUrl(hash: string): string {
  return `${arcTestnet.blockExplorers.default.url}/tx/${hash}`
}