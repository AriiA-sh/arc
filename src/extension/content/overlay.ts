import type { RiskSummary } from '../channel'
import { runMismatchCheck, severityOf, type MismatchReport } from './mismatch'

const OVERLAY_ID = 'arc-lens-overlay'

export interface OverlayPayload {
  summary: RiskSummary
  txTo?: string
}

function createHost(): HTMLElement {
  const host = document.createElement('div')
  host.id = OVERLAY_ID
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .arc-card {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
        width: 340px; max-width: calc(100vw - 32px);
        background: #0b0e13; color: #e8eaed; border: 1px solid #2b3242;
        border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.55);
        font: 13px/1.5 system-ui, -apple-system, sans-serif;
        overflow: hidden;
      }
      .arc-head { display:flex; align-items:center; justify-content:space-between;
        padding: 10px 14px; border-bottom: 1px solid #232936; }
      .arc-title { letter-spacing: .18em; font-weight:700; font-size:12px; color:#9fc3ff; }
      .arc-dismiss { background:none; border:0; color:#9aa0a6; cursor:pointer; font-size:16px; line-height:1; }
      .arc-body { padding: 12px 14px; }
      .arc-action { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
      .arc-kind { color: #9aa0a6; font-size: 11px; }
      .arc-badge { display:inline-block; margin: 8px 0 0; padding: 3px 10px; border-radius: 999px;
        font-size: 11px; font-weight: 700; letter-spacing:.04em; }
      .arc-badge.safe { background:rgba(127,209,160,.15); color:#7fd1a0; }
      .arc-badge.warning { background:rgba(242,163,60,.16); color:#f2a33c; }
      .arc-badge.severe { background:rgba(229,72,77,.18); color:#ff8085; }
      .arc-warn { margin:8px 0 0; padding:8px 10px; border:1px solid; border-radius:8px; font-size:12px; }
      .arc-warn.warning { border-color:rgba(242,163,60,.4); background:rgba(242,163,60,.08); }
      .arc-warn.severe { border-color:rgba(229,72,77,.55); background:rgba(229,72,77,.10); }
      .arc-warn b { display:block; margin-bottom:2px; }
      .arc-details { margin-top:8px; font-size:11px; color:#9aa0a6; }
      .arc-details summary { cursor:pointer; }
      .arc-ai { margin-top:8px; padding:8px 10px; border:1px solid rgba(159,195,255,.35);
        background:rgba(159,195,255,.07); border-radius:8px; font-size:12px; color:#c6d8f5; }
      .arc-ai b { display:block; margin-bottom:2px; color:#9fc3ff; }
      .arc-mismatch { border:1px solid #e5484d; background:rgba(229,72,77,.12); color:#ffb3b3;
        padding:10px; border-radius:8px; margin-top:10px; font-size:12px; }
      .arc-foot { padding: 8px 14px 10px; color:#6f7683; font-size:10.5px;
        border-top: 1px solid #232936; }
      .arc-foot code { color:#b6bfcc; }
    </style>
    <div class="arc-card">
      <div class="arc-head">
        <span class="arc-title">ARC LENS · BEFORE YOU SIGN</span>
        <button class="arc-dismiss" aria-label="dismiss">✕</button>
      </div>
      <div class="arc-body">
        <p class="arc-action"></p>
        <span class="arc-kind"></span>
        <span class="arc-badge"></span>
        <div class="arc-warns"></div>
        <div class="arc-mismatch" hidden></div>
        <details class="arc-details"><summary>Show details</summary><div class="arc-details-body"></div></details>
      </div>
      <div class="arc-foot">Deterministic local analysis · <code>#uid</code></div>
    </div>
  `
  return host
}

export function showOverlay(payload: OverlayPayload): void {
  const { summary, txTo } = payload
  const mismatch: MismatchReport = runMismatchCheck(document.body ?? document.documentElement, txTo)
  const severity = severityOf(summary, mismatch)

  let host = document.getElementById(OVERLAY_ID) as HTMLElement | null
  if (!host) host = createHost()
  // reset content while reusing the node
  const shadow = host.shadowRoot!
  const badge = shadow.querySelector('.arc-badge')!
  badge.textContent = severity === 'safe' ? 'NO WARNING' : `${severity.toUpperCase()} — ${summary.count} issue(s)`
  badge.className = `arc-badge ${severity}`
  shadow.querySelector('.arc-action')!.textContent = summary.human
  shadow.querySelector('.arc-kind')!.textContent = summary.kind
  shadow.querySelector('.arc-foot code')!.textContent = `#${summary.uid.slice(-6)}`

  const warns = shadow.querySelector('.arc-warns')!
  warns.innerHTML = ''
  const findings = (summary.findings ?? []) as Array<{ severity: string; rule: string; reason: string; evidence: string; limitation: string }>
  for (const f of findings) {
    if (f.severity === 'info') continue
    const el = document.createElement('div')
    el.className = `arc-warn ${f.severity === 'warning' ? 'warning' : 'severe'}`
    el.innerHTML = `<b>${f.rule}</b><span>${f.reason}</span>`
    warns.appendChild(el)
  }

  const detailsBody = shadow.querySelector('.arc-details-body')!
  detailsBody.querySelectorAll('*').forEach((n) => n.remove())
  const dl = document.createElement('div')
  dl.innerHTML =
    `<div>Target: <code>${summary.to ?? '—'}</code></div>` +
    `<div>Value: <code>${summary.value ?? '0'}</code></div>` +
    findings
      .map(
        (f) =>
          `<div style="margin-top:6px"><b>${f.rule}</b> — ${f.reason}<br><span style="color:#6f7683">Evidence: ${f.evidence}</span></div>`,
      )
      .join('')
  detailsBody.appendChild(dl)

  if (summary.aiExplain) {
    const ai = document.createElement('div')
    ai.className = 'arc-ai'
    ai.innerHTML = `<b>AI explain</b>${escapeHtml(summary.aiExplain)}`
    detailsBody.appendChild(ai)
  }

  const mismatchBox = shadow.querySelector('.arc-mismatch') as HTMLDivElement
  if (mismatch.detected) {
    mismatchBox.hidden = false
    mismatchBox.innerHTML =
      `<b>⚠ Displayed vs Signed mismatch</b>` +
      `<div>${mismatch.reason}</div>` +
      `<div style="margin-top:4px">Page shows: <code>${mismatch.shownAddress}</code>` +
      (mismatch.shownLabel ? ` (${mismatch.shownLabel})` : '') +
      `<br>Wallet asked to sign: <code>${mismatch.signedAddress ?? ''}</code></div>`
  }

  host.dataset.arcUid = summary.uid
  shadow.querySelector('.arc-dismiss')!.addEventListener('click', () => host.remove())
  document.documentElement.appendChild(host)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Stage 8: late AI enrichment arrives after the baseline overlay is visible. */
export function appendAiExplain(uid: string, text: string): void {
  const host = document.getElementById(OVERLAY_ID) as HTMLElement | null
  const shadow = host?.shadowRoot
  if (!host || !shadow || host.dataset.arcUid !== uid) return
  const detailsBody = shadow.querySelector('.arc-details-body')
  if (!detailsBody) return
  if (detailsBody.querySelector('.arc-ai')) return
  const ai = document.createElement('div')
  ai.className = 'arc-ai'
  ai.innerHTML = `<b>AI explain</b>${escapeHtml(text)}`
  detailsBody.appendChild(ai)
}