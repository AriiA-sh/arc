import { formatUnits } from 'viem'
import { erc20Abi } from './abis'
import type { TokenMetadata } from './decoder'

export interface TokenReader {
  readContract(params: {
    address: `0x${string}`
    abi: typeof erc20Abi
    functionName: 'name' | 'symbol' | 'decimals'
  }): Promise<string | number | bigint>
  getCode?: (address: `0x${string}`) => Promise<string | undefined>
}

export function makeTokenMetaFetcher(reader: TokenReader): (addr: string) => Promise<TokenMetadata | null> {
  return async (addr) => {
    // An EOA has no code: never treat it as a token contract.
    if (reader.getCode) {
      const code = await reader.getCode(addr as `0x${string}`)
      if (!code || code === '0x') return null
    }
    // A failsafe call can revert even on legit tokens; treat each field independently.
    const call = async (fn: 'name' | 'symbol' | 'decimals') => {
      try {
        return await reader.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: fn })
      } catch {
        return undefined
      }
    }
    const [name, symbol, decimals] = await Promise.all([call('name'), call('symbol'), call('decimals')])
    if (name === undefined && symbol === undefined) return null
    return {
      name: String(name ?? ''),
      symbol: String(symbol ?? 'token'),
      decimals: typeof decimals === 'number' ? decimals : Number(decimals ?? 18),
    }
  }
}

export function formatTokenValue(value: bigint, decimalsOrMeta: number | TokenMetadata | undefined): string {
  const decimals = typeof decimalsOrMeta === 'number' ? decimalsOrMeta : decimalsOrMeta?.decimals ?? 18
  const symbol = typeof decimalsOrMeta === 'number' ? '' : decimalsOrMeta?.symbol ?? ''
  return `${Number(Number(formatUnits(value, decimals)).toFixed(6))} ${symbol}`.trim()
}