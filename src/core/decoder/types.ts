export type DecodeKind =
  | 'native_transfer'
  | 'erc20_transfer'
  | 'erc20_approve'
  | 'erc20_transfer_from'
  | 'contract_call'
  | 'unknown'

export interface DecodeParam {
  name: string
  value: string
  raw?: string
}

export interface DecodedAction {
  ok: boolean
  kind: DecodeKind
  /** 4-byte selector (0x + 8 hex), null for native transfer */
  selector: string | null
  /** contract the transaction is sent to */
  to: string
  /** native value in wei (Arc base units). BigInt defeats precision loss. */
  value: bigint
  params: DecodeParam[]
  /** e.g. "Approve USDC", "Send USDC", "Transfer ETH" */
  human: string
  /** longer natural-language description */
  description: string
  /** chain id the transaction targets, when known from the request context */
  chainId?: number
  /** token metadata when the target looks like an ERC-20 */
  token?: { symbol: string; name: string; decimals: number }
  error?: string
}

export type DecodeInput =
  | { kind: 'hash'; hash: string; network: string }
  | { kind: 'calldata'; to: string; value?: string; calldata: string }