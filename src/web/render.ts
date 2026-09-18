import type { Analysis } from './analyze'
import type { WalletStatus } from '../core/wallet/types'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function addrEl(addr: string): string {
  return `<code class="addr" title="${esc(addr)}">${esc(addr)}</code>`
}

export function renderError(msg: string): string {
  return `<div class="error"><strong>Analysis failed</strong><p>${esc(msg)}</p></div>`
}

export function renderWallet(w: WalletStatus): string {
  if (!w.detected) {
    return `<div class="wallet wallet-none">No injected wallet detected. Paste a hash or calldata to analyze — no wallet is ever required.</div>`
  }
  const chainOk = w.onArcTestnet ? ' ✓' : ''
  const chainBad = !w.onArcTestnet ? ' ✗' : ''
  return `
  <div class="wallet">
    <div class="wallet-row"><span class="wallet-k">Wallet</span><span>${esc(w.providerName ?? 'detected')}</span></div>
    <div class="wallet-row"><span class="wallet-k">Address</span><code class="addr">${esc(w.account ?? '— (locked)')}</code></div>
    <div class="wallet-row"><span class="wallet-k">Network</span><span>${esc(w.networkLabel ?? 'unknown')}${chainOk ? '<b class="ok">✓</b>' : chainBad ? '<b class="bad">✗ not Arc Testnet</b>' : ''}</span></div>
    ${w.error ? `<div class="wallet-row"><span class="wallet-k"></span><span class="muted">${esc(w.error)}</span></div>` : ''}
    <div class="wallet-note">Read-only detection. Arc Lens never requests private keys or seed phrases.</div>
  </div>`
}

export function renderAnalysis(a: Analysis): string {
  const d = a.decoded
  const warnings = a.findings.filter((f) => f.severity === 'warning' || f.severity === 'severe')
  const notes = a.findings.filter((f) => f.severity === 'info')

  const warnBlock =
    warnings.length > 0
      ? warnings
          .map(
            (f) => `
        <details class="finding finding-${f.severity}" open>
          <summary><span class="badge">${f.severity.toUpperCase()}</span> ${esc(f.rule)}</summary>
          <div class="finding-body">
            <p class="reason">${esc(f.reason)}</p>
            <p class="meta"><b>Evidence:</b> ${esc(f.evidence)}</p>
            <p class="meta"><b>Limitation:</b> ${esc(f.limitation)}</p>
          </div>
        </details>`,
          )
          .join('\n')
      : `<div class="none"></div>`

  const noteBlock =
    notes.length > 0
      ? notes
          .map((f) => `<li><b>${esc(f.rule)}</b> — ${esc(f.reason)}</li>`)
          .join('\n')
      : ''

  const params =
    d.params.length > 0
      ? `<dl class="params">${d.params
          .map((p) => `<dt>${esc(p.name)}</dt><dd>${esc(p.value)}</dd>`)
          .join('\n')}</dl>`
      : ''

  return `
  <section class="report">
    <header class="report-head">
      <div class="report-title">
        <h2 id="action-title">${esc(d.human)}</h2>
        <p class="input-label">${esc(a.inputLabel)}${a.hash ? ` · <a href="https://explorer.testnet.arc.io/tx/${esc(a.hash)}" target="_blank" rel="noreferrer">explorer ↗</a>` : ''}</p>
      </div>
      ${warnings.length > 0 ? `<span class="status-dot warning" title="${warnings.length} warning(s)"></span>` : ''}
    </header>
    <div class="target">Target contract: ${d.to ? addrEl(d.to) : esc('(none — contract creation)')}</div>
    ${params}
    <hr>
    <h3>Risk checks ${warnings.length > 0 ? `<span class="badge badge-warn">${warnings.length} warning${warnings.length > 1 ? 's' : ''}</span>` : '<span class="badge badge-ok">no warnings</span>'}</h3>
    ${warnBlock}
    ${noteBlock ? `<ul class="notes">${noteBlock}</ul>` : ''}
    <footer class="report-foot">Deterministic local analysis. No AI was used. The wallet always remains the only signing authority.</footer>
  </section>`
}