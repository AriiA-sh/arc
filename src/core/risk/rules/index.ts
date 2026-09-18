import { isZeroAddress } from '../../utils/address'
import type { RiskContext, RiskFinding, RiskRule } from '../types'
import type { DecodedAction } from '../../decoder/types'

function finding(is: RiskFinding[]): RiskFinding[] {
  return is
}

export const unlimitedApproval: RiskRule = {
  id: 'unlimited-approval',
  async run(decoded: DecodedAction, _ctx: RiskContext): Promise<RiskFinding[]> {
    if (decoded.kind !== 'erc20_approve') return []
    const amount = decoded.params.find((p) => p.name === 'amount')
    if (!amount || amount.value !== 'Unlimited') return []
    const spender = decoded.params.find((p) => p.name === 'spender')?.value ?? 'the spender'
    return finding([
      {
        id: this.id,
        severity: 'warning',
        rule: 'Unlimited approval',
        reason: `This approval may allow ${spender.slice(0, 7)}…${spender.slice(-4)} to spend your ${decoded.token?.symbol ?? 'token'} later.`,
        evidence: `allowance set to uint256 max (2^256-1)`,
        limitation: 'Arc Lens cannot know whether the spender intends to use the full allowance.',
      },
    ])
  },
}

export const approveToEoa: RiskRule = {
  id: 'approve-to-eoa',
  async run(decoded: DecodedAction, ctx: RiskContext): Promise<RiskFinding[]> {
    if (decoded.kind !== 'erc20_approve') return []
    const spender = decoded.params.find((p) => p.name === 'spender')?.value
    if (!spender || !ctx.hasCode) return []
    if (isZeroAddress(spender)) return []
    const has = await ctx.hasCode(spender)
    if (has) return []
    const amountIsUnlimited = decoded.params.some((p) => p.name === 'amount' && p.value === 'Unlimited')
    return finding([
      {
        id: this.id,
        severity: amountIsUnlimited ? 'severe' : 'warning',
        rule: 'Approval to a plain account',
        reason: `You are granting ${spender.slice(0, 7)}…${spender.slice(-4)} permission to move your ${decoded.token?.symbol ?? 'token'} — and that address has no contract code (it is a plain wallet).`,
        evidence: `getCode(${spender}) returned 0x`,
        limitation: 'An EOA spender could be a legitimate recipient in some flows; assess manually.',
      },
    ])
  },
}

export const approveZeroOrBurn: RiskRule = {
  id: 'approve-zero-or-burn',
  async run(decoded: DecodedAction, _ctx: RiskContext): Promise<RiskFinding[]> {
    if (decoded.kind !== 'erc20_approve') return []
    const spender = decoded.params.find((p) => p.name === 'spender')?.value ?? ''
    const amountVal = decoded.params.find((p) => p.name === 'amount')?.value ?? ''
    const burnish = /^0x0+dead$/i.test(spender)
    if (!isZeroAddress(spender) && !burnish) return []
    return finding([
      {
        id: this.id,
        severity: 'warning',
        rule: 'Approval to a null/burn address',
        reason: `The spender is ${isZeroAddress(spender) ? 'the zero address (0x000…000)' : 'a burn/dead address (0x…dEaD)'}, which is not a real third party.`,
        evidence: `spender=${spender}, amount=${amountVal}`,
        limitation: 'Approving 0 to the zero address is a known pattern to neutralize old allowances; use judgement.',
      },
    ])
  },
}

export const approveToSelf: RiskRule = {
  id: 'approve-to-self',
  async run(decoded: DecodedAction, ctx: RiskContext): Promise<RiskFinding[]> {
    if (decoded.kind !== 'erc20_approve' || !ctx.from) return []
    const spender = decoded.params.find((p) => p.name === 'spender')?.value ?? ''
    if (spender.toLowerCase() !== ctx.from.toLowerCase()) return []
    return finding([
      {
        id: this.id,
        severity: 'info',
        rule: 'Approval to yourself',
        reason: 'The spender is the address you are signing from — this is usually pointless and can be a sign of a confused UI or wallet behavior.',
        evidence: `spender == from (${spender})`,
        limitation: 'Some smart-account flows legitimately use self-spend permissions.',
      },
    ])
  },
}

export const zeroValueNative: RiskRule = {
  id: 'zero-value-native',
  async run(decoded: DecodedAction, _ctx: RiskContext): Promise<RiskFinding[]> {
    if (decoded.kind !== 'native_transfer') return []
    if (decoded.value !== 0n) return []
    return finding([
      {
        id: this.id,
        severity: 'info',
        rule: 'No-value contract call',
        reason: 'This transaction sends 0 USDC with no calldata — it is a plain call to the target contract, not a payment.',
        evidence: `value = 0, data = 0x`,
        limitation: 'The effect depends entirely on the receiving contract.',
      },
    ])
  },
}

export const contractCallNoAbi: RiskRule = {
  id: 'contract-call-no-abi',
  async run(decoded: DecodedAction, _ctx: RiskContext): Promise<RiskFinding[]> {
    if (decoded.kind !== 'contract_call') return []
    return finding([
      {
        id: this.id,
        severity: 'info',
        rule: 'Unverifiable call',
        reason: 'The selector is not in Arc Lens\u2019s known set, so the effects of this call cannot be explained locally.',
        evidence: `decoded kind: contract_call (selector ${decoded.selector ?? 'none'})`,
        limitation: 'Without an ABI this transaction is opaque; consider simulating it before signing.',
      },
    ])
  },
}

export const transferFromSigner: RiskRule = {
  id: 'transfer-from-signer',
  async run(decoded: DecodedAction, ctx: RiskContext): Promise<RiskFinding[]> {
    if (decoded.kind !== 'erc20_transfer_from') return []
    const from = decoded.params.find((p) => p.name === 'from')?.value ?? ''
    const to = decoded.params.find((p) => p.name === 'to')?.value ?? ''
    const isSelf = ctx.from && from.toLowerCase() === ctx.from.toLowerCase()
    if (!isSelf) return []
    return finding([
      {
        id: this.id,
        severity: 'info',
        rule: 'Token pull from your account',
        reason: `This transaction pulls ${decoded.token?.symbol ?? 'tokens'} out of your own account (from=${from.slice(0, 7)}…${from.slice(-4)}) and sends them to ${to.slice(0, 7)}…${to.slice(-4)}. You are acting as the operator of your own allowance.`,
        evidence: `transferFrom(from=${from}, to=${to})`,
        limitation: 'Agent and auto-spend flows routinely sign pull-from-self operations; verify the recipient.',
      },
    ])
  },
}

export const unexpectedNetwork: RiskRule = {
  id: 'unexpected-network',
  async run(decoded: DecodedAction, ctx: RiskContext): Promise<RiskFinding[]> {
    if (ctx.expectedChainId === undefined) return []
    if (decoded.chainId === undefined) return []
    if (decoded.chainId === ctx.expectedChainId) return []
    return finding([
      {
        id: this.id,
        severity: 'warning',
        rule: 'Unexpected network',
        reason: `The transaction is targeted at chain ${decoded.chainId}, not the expected Arc Testnet (${ctx.expectedChainId}).`,
        evidence: `request chainId: ${decoded.chainId}  (expected: ${ctx.expectedChainId})`,
        limitation: 'Some dApps sign for multiple chains intentionally; confirm before proceeding.',
      },
    ])
  },
}

export const ALL_RULES: RiskRule[] = [
  unlimitedApproval,
  approveToEoa,
  approveZeroOrBurn,
  approveToSelf,
  zeroValueNative,
  contractCallNoAbi,
  transferFromSigner,
  unexpectedNetwork,
]