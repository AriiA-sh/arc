import { isAddress } from 'viem'
import { publicClient } from '../arc/client'
import { decodeTx, type TxInput } from '../core/decoder/decoder'
import { makeTokenMetaFetcher } from '../core/decoder/token-meta'
import { runRiskEngine } from '../core/risk/engine'
import type { DecodedAction } from '../core/decoder/types'
import type { RiskFinding } from '../core/risk/types'

export interface Analysis {
  inputLabel: string
  hash?: string
  decoded: DecodedAction
  findings: RiskFinding[]
}

const tokenMetaFetcher = makeTokenMetaFetcher({
  readContract: (p) => publicClient.readContract({ ...p, args: [] }) as any,
  getCode: (a) => publicClient.getCode({ address: a }),
})

const hasCode = async (addr: string) => {
  if (!isAddress(addr)) return false
  const code = await publicClient.getCode({ address: addr as `0x${string}` })
  return !!code && code !== '0x'
}

function looksLikeHash(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s)
}

function looksLikeCalldata(s: string): boolean {
  const t = s.trim()
  return /^0x[0-9a-fA-F]+$/.test(t)
}

/** Analyze a tx hash fetched from Arc Testnet. */
export async function analyzeHash(hash: string): Promise<Analysis> {
  const tx = await publicClient.getTransaction({ hash: hash as `0x${string}` })
  const decoded = await decodeTx({ to: tx.to, value: tx.value, input: tx.input, from: tx.from }, { fetchTokenMeta: tokenMetaFetcher })
  const findings = await runRiskEngine(decoded, { chainId: 5042002, from: tx.from, hasCode })
  return { inputLabel: 'From transaction hash', hash, decoded, findings }
}

/** Analyze raw calldata with an optional target + value. */
export async function analyzeCalldata(rawCalldata: string, to?: string, valueRaw?: string): Promise<Analysis> {
  const tx: TxInput = { to: to || undefined, value: valueRaw || '0', input: rawCalldata }
  const decoded = await decodeTx(tx, { fetchTokenMeta: tokenMetaFetcher })
  const findings = await runRiskEngine(decoded, { chainId: 5042002, hasCode })
  return { inputLabel: 'From pasted calldata', decoded, findings }
}

export function resolveInput(raw: string): { mode: 'hash' } | { mode: 'calldata'; data: string; to?: string; value?: string } {
  const s = raw.trim()
  if (looksLikeHash(s)) return { mode: 'hash' }
  if (looksLikeCalldata(s)) return { mode: 'calldata', data: s }
  throw new Error('Not a valid tx hash or calldata. Paste a 0x… hash (66 hex chars) or raw calldata (starts with 0x).')
}

export { looksLikeHash }