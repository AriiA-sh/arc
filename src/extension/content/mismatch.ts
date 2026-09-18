import type { RiskSummary } from '../channel'

/**
 * "Displayed-vs-Signed Mismatch" — Stage 7 rule (Project Bible Decision 15).
 * Compares addresses/text the dApp page actually shows against the address the
 * wallet is being asked to sign <to>. A strong mismatch is the most severe
 * signal Arc Lens has, even with no other reputation data.
 */
export interface MismatchReport {
  detected: boolean
  shownAddress?: string
  shownLabel?: string
  signedAddress?: string
  reason?: string
}

const ADDR_RE = /(?:0x[0-9a-fA-F]{40})/g

function newestFirst(body: HTMLElement): Element[] {
  const all = Array.from(
    body.querySelectorAll('button, a, span, div, h1, h2, h3, h4, p, b, i, strong, em, label, li, td, dd, dt'),
  )
    .filter((el) => el.children.length === 0 || /^[0-9a-zA-Z.\s]{2,40}$/.test(el.textContent ?? ''))
  // likely-relevant UI nodes: text-bearing leaf elements near the top visually
  return all.sort((a, b) => {
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    return ra.top - rb.top || ra.left - rb.left
  })
}

/**
 * Find the most prominent address the page displays. Heuristic on purpose:
 * content scripts cannot read a dApp's internal state, only its DOM.
 */
export function detectDisplayedAddress(body: HTMLElement): string | undefined {
  const counts = new Map<string, number>()
  for (const el of newestFirst(body)) {
    const text = el.textContent ?? ''
    for (const m of text.matchAll(ADDR_RE)) {
      const addr = m[0].toLowerCase()
      counts.set(addr, (counts.get(addr) ?? 0) + 1)
    }
  }
  let best: string | undefined
  let bestCount = 0
  for (const [addr, c] of counts) {
    if (c > bestCount) {
      best = addr
      bestCount = c
    }
  }
  return best
}

/** Read the likely display name/label next to the shown address. */
export function displayedLabel(body: HTMLElement, shown: string): string | undefined {
  for (const el of newestFirst(body)) {
    const text = el.textContent ?? ''
    if (text.toLowerCase().includes(shown.slice(0, 10))) {
      const clean = text.replace(ADDR_RE, ' ').replace(/\s+/g, ' ').trim()
      if (clean && clean.length > 0 && clean.length <= 40) return clean
    }
  }
  return undefined
}

export function runMismatchCheck(body: HTMLElement, txTo?: string): MismatchReport {
  if (!txTo || txTo === '0x') return { detected: false }
  const shownAddress = detectDisplayedAddress(body)
  if (!shownAddress) return { detected: false }
  const signed = txTo.toLowerCase()
  if (shownAddress === signed) return { detected: false }
  return {
    detected: true,
    shownAddress,
    shownLabel: displayedLabel(body, shownAddress),
    signedAddress: txTo,
    reason: `The page displays ${shownAddress}, but the transaction the wallet is asked to sign targets ${txTo}.`,
  }
}

export function severityOf(summary: RiskSummary, mismatch: MismatchReport): RiskSummary['severity'] {
  if (mismatch.detected) return 'severe'
  return summary.severity
}