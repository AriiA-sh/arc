import { ALL_RULES } from './rules'
import type { DecodedAction } from '../decoder/types'
import type { RiskContext, RiskFinding } from './types'

/**
 * Run every deterministic risk rule against a decoded transaction.
 * The engine itself never depends on AI. Failures of a single rule
 * must not fail the whole analysis.
 */
export async function runRiskEngine(decoded: DecodedAction, ctx: RiskContext): Promise<RiskFinding[]> {
  const findings: RiskFinding[] = []

  if (!decoded.ok) {
    findings.push({
      id: 'decode-failed',
      severity: 'info',
      rule: 'Could not decode',
      reason: 'Arc Lens could not fully decode this transaction, so some local risk rules did not run.',
      evidence: decoded.error ?? `kind=${decoded.kind}`,
      limitation: 'Undecodable transactions need an ABI or a simulation to reason about.',
    })
  }

  for (const rule of ALL_RULES) {
    try {
      const hits = await rule.run(decoded, ctx)
      findings.push(...hits)
    } catch (e) {
      findings.push({
        id: `${rule.id}-error`,
        severity: 'info',
        rule: rule.id,
        reason: 'This rule failed to run.',
        evidence: (e as Error).message,
        limitation: 'Rule skipped.',
      })
    }
  }
  return findings
}

export { ALL_RULES }
export * from './types'