import type { DecodedAction } from '../decoder/types'

export type RiskSeverity = 'info' | 'warning' | 'severe'

export interface RiskFinding {
  /** stable machine id, e.g. 'unlimited-approval' */
  id: string
  severity: RiskSeverity
  /** one-line rule name, e.g. "Unlimited approval" */
  rule: string
  /** why this was triggered */
  reason: string
  /** the concrete on-chain/parameter evidence */
  evidence: string
  /** what this check cannot determine in this context */
  limitation: string
}

export interface RiskContext {
  chainId: number
  /** signer address (when known) */
  from?: string
  /** expected chain for the "unexpected network" rule */
  expectedChainId?: number
  /** check whether an address is a contract (i.e. has code) */
  hasCode?: (address: string) => Promise<boolean>
}

export type RiskRule = {
  id: string
  run(decoded: DecodedAction, ctx: RiskContext): Promise<RiskFinding[]>
}

export const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  info: 'Note',
  warning: 'Warning',
  severe: 'High risk',
}