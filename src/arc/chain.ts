import type { Chain } from 'viem'

/**
 * Arc network parameters, verified against official docs:
 * https://docs.arc.io/arc/references/rpc-endpoints (and the network-routed
 * mirror https://docs.arc.network/...). Re-verify before any production use
 * (Project Bible Rule 9).
 *
 * Arc Mainnet went PUBLIC on September 16, 2026 (arc.io blog, confirmed
 * 2026-09-21): rpc.mainnet.arc.io is open to all developers and the
 * permissioned-only phase has ended. Testnet remains the shipped default;
 * mainnet is a user choice in settings.
 */
export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'] },
    public: { http: ['https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan Testnet', url: 'https://explorer.testnet.arc.io' },
  },
} as const satisfies Chain

export const arcMainnet = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
    public: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://explorer.arc.io' },
  },
} as const satisfies Chain

export type ArcNetwork = 'testnet' | 'mainnet'

export const ARC_CHAINS: Record<ArcNetwork, Chain> = {
  testnet: arcTestnet,
  mainnet: arcMainnet,
}

export const ARC_CHAIN_ID = arcTestnet.id
export const ARC_MAINNET_CHAIN_ID = arcMainnet.id