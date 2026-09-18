import { decodeFunctionData, formatUnits, getAddress, isAddress } from 'viem'
import { erc20Abi, MAX_UINT256 } from './abis'
import type { DecodedAction } from './types'

export interface TxInput {
  to?: string | null
  value?: string | bigint
  input?: string
  data?: string
  from?: string
}

export interface TokenMetadata {
  symbol: string
  name: string
  decimals: number
}

export interface DecodeOptions {
  /** async fetcher for ERC-20 metadata (name/symbol/decimals) of a token contract */
  fetchTokenMeta?: (tokenAddress: string) => Promise<TokenMetadata | null>
}

const SELECTOR_MAP: Record<string, string> = {
  a9059cbb: 'transfer',
  '095ea7b3': 'approve',
  '23b872dd': 'transferFrom',
}

function shortAddr(a?: string | null): string {
  if (!a || !isAddress(a)) return 'an address'
  return `${a.slice(0, 7)}…${a.slice(-4)}`
}

function parseAmount(value: bigint, decimals: number): { human: string; unlimited: boolean } {
  const unlimited = value === MAX_UINT256
  if (unlimited) return { human: 'Unlimited', unlimited: true }
  return { human: Number(Number(formatUnits(value, decimals)).toFixed(4)).toString(), unlimited: false }
}

/** Build the canonical decoded result for an ERC-20-ish function call. */
function makeErc20Action(
  functionName: string,
  to: string,
  args: readonly unknown[],
  token: TokenMetadata | undefined,
  callData: { from?: string },
): DecodedAction {
  const decimals = token?.decimals ?? 18

  if (functionName === 'approve') {
    const [spender, amount] = args as [string, bigint]
    const amt = parseAmount(amount, decimals)
    const toIsSelf = spender.toLowerCase() === (callData.from ?? '').toLowerCase()
    return {
      ok: true,
      kind: 'erc20_approve',
      selector: '0x095ea7b3',
      to,
      value: 0n,
      params: [
        { name: 'spender', value: spender },
        { name: 'amount', value: amt.human, raw: amount.toString() },
        { name: 'token', value: token ? `${token.symbol} (${formatUnits(amount, decimals)})` : 'unknown ERC-20', raw: to },
      ],
      human: `Approve ${token?.symbol ?? 'token'}`,
      description:
        amt.unlimited
          ? `Approve ${shortAddr(spender)} to spend an unlimited amount of ${token?.symbol ?? 'this token'}${toIsSelf ? ' (notice: you are the spender)' : ''}.`
          : `Approve ${shortAddr(spender)} spending of ${amt.human} ${token?.symbol ?? ''}`.trim(),
      token,
    }
  }

  if (functionName === 'transfer') {
    const [to2, amount] = args as [string, bigint]
    return {
      ok: true,
      kind: 'erc20_transfer',
      selector: '0xa9059cbb',
      to,
      value: 0n,
      params: [
        { name: 'to', value: to2 },
        { name: 'value', value: formatUnits(amount, decimals), raw: amount.toString() },
      ],
      human: `Send ${token?.symbol ?? 'token'}`,
      description: `Send ${formatUnits(amount, decimals)} ${token?.symbol ?? ''} to ${shortAddr(to2)}`.trim(),
      token,
    }
  }

  // transferFrom
  const [from, to2, amount] = args as [string, string, bigint]
  return {
    ok: true,
    kind: 'erc20_transfer_from',
    selector: '0x23b872dd',
    to,
    value: 0n,
    params: [
      { name: 'from', value: from },
      { name: 'to', value: to2 },
      { name: 'value', value: formatUnits(amount, decimals), raw: amount.toString() },
    ],
    human: `Pull ${token?.symbol ?? 'token'} (transferFrom)`,
    description: `Move ${formatUnits(amount, decimals)} ${token?.symbol ?? ''} from ${shortAddr(from)} to ${shortAddr(to2)} via the ${shortAddr(to)} contract.`,
    token,
  }
}

function makeNativeTransfer(to: string, value: bigint): DecodedAction {
  return {
    ok: true,
    kind: 'native_transfer',
    selector: null,
    to,
    value,
    params: [{ name: 'value', value: value === 0n ? '0 (no value)' : formatUnits(value, 18), raw: value.toString() }],
    human: value === 0n ? 'Contract call (no value)' : 'Send USDC (native)',
    description:
      value === 0n
        ? `Call ${shortAddr(to)} with no native value.`
        : `Send ${Number(Number(formatUnits(value, 18)).toFixed(4))} USDC to ${shortAddr(to)}.`,
  }
}

/**
 * Convert a raw transaction into a human-readable action.
 * Pure + async only when decodeFunctionData needs metadata fetching.
 */
export async function decodeTx(tx: TxInput, options: DecodeOptions = {}): Promise<DecodedAction> {
  const to = tx.to ? getAddress(tx.to) : ''
  const rawData = tx.input ?? tx.data ?? '0x'
  const value = BigInt(tx.value ?? 0)
  const data = rawData === '0x0' ? '0x' : rawData

  if (!to) {
    const isCreation = value > 0n || (!!data && data !== '0x')
    return {
      ok: false,
      kind: 'unknown',
      selector: null,
      to: '',
      value,
      params: [],
      human: isCreation ? 'Contract creation' : 'Unknown',
      description: isCreation
        ? 'Transaction deploys a contract. Contract-creation calldata cannot be decoded as a call.'
        : 'No target, no data, no value.',
      error: isCreation ? 'contract creation' : 'empty transaction',
    }
  }

  // 1) No data → native (USDC on Arc) transfer or plain contract call.
  if (!data || data === '0x') {
    return makeNativeTransfer(to, value)
  }

  // 2) Unknown selector: cannot decode deterministically.
  let selectorHex: string
  try {
    if (data.length < 10) throw new Error('too short')
    selectorHex = data.slice(0, 10).toLowerCase()
  } catch {
    return { ok: false, kind: 'unknown', selector: null, to, value, params: [], human: 'Undecodable', description: `Data does not contain a valid 4-byte selector.`, error: 'bad calldata' }
  }

  const selectorKey = selectorHex.slice(2).toLowerCase()
  const functionName = SELECTOR_MAP[selectorKey]

  if (!functionName) {
    return {
      ok: false,
      kind: 'contract_call',
      selector: selectorHex,
      to,
      value,
      params: [{ name: 'selector', value: selectorHex }],
      human: 'Unknown contract call',
      description: `Call to ${shortAddr(to)} with plain selector ${selectorHex} (no matching ABI).`,
    }
  }

  // 3) Known ERC-20-like call: decode args, fetch token meta when possible.
  let token: TokenMetadata | undefined
  if (options.fetchTokenMeta && isAddress(to)) {
    try {
      const meta = await options.fetchTokenMeta(to)
      if (meta) token = meta
    } catch {
      token = undefined
    }
  }

  let args: readonly unknown[]
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` })
    args = decoded.args
  } catch (e) {
    return {
      ok: false,
      kind: 'contract_call',
      selector: selectorHex,
      to,
      value,
      params: [{ name: 'selector', value: selectorHex }, { name: 'error', value: 'argument decoding failed' }],
      human: `${functionName} (unreadable)`,
      description: `Selector matches ${functionName} but arguments could not be decoded.`,
      error: (e as Error).message,
    }
  }

  return makeErc20Action(functionName, to, args as unknown[], token, { from: tx.from })
}