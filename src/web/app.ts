import { analyzeCalldata, analyzeHash } from './analyze'
import { renderAnalysis, renderError, renderWallet } from './render'
import { detectWallet } from '../core/wallet/detect'

export function mountApp(root: HTMLElement, opts: { extraControls?: string } = {}): void {
  root.innerHTML = `
  <div id="arc-wallet"></div>
  <form id="arc-form" autocomplete="off">
    <label for="arc-input">Transaction hash or raw calldata</label>
    <textarea id="arc-input" rows="3" spellcheck="false"
      placeholder="0x673beaaf…  (paste a tx hash, or raw calldata like 0x095ea7b3…)"></textarea>
    <div class="row">
      <input id="arc-to" type="text" placeholder="To (contract address) — required for calldata" />
      <input id="arc-value" type="text" placeholder="Value (wei, optional)" />
    </div>
    ${opts.extraControls ?? ''}
    <button id="arc-analyze" type="submit">Analyze</button>
  </form>
  <div id="arc-result" aria-live="polite"></div>
  `

  const walletBox = root.querySelector<HTMLDivElement>('#arc-wallet')!
  const form = root.querySelector<HTMLFormElement>('#arc-form')!
  const input = root.querySelector<HTMLTextAreaElement>('#arc-input')!
  const toInput = root.querySelector<HTMLInputElement>('#arc-to')!
  const valueInput = root.querySelector<HTMLInputElement>('#arc-value')!
  const result = root.querySelector<HTMLDivElement>('#arc-result')!
  const btn = root.querySelector<HTMLButtonElement>('#arc-analyze')!

  // Auto-detect wallet on mount
  walletBox.innerHTML = `<div class="loading">Detecting wallet…</div>`
  detectWallet()
    .then((w) => { walletBox.innerHTML = renderWallet(w) })
    .catch(() => { walletBox.innerHTML = renderWallet({ detected: false, onArcTestnet: false }) })

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const raw = input.value.trim()
    if (!raw) return
    btn.disabled = true
    btn.textContent = 'Analyzing…'
    result.innerHTML = `<div class="loading">Analyzing on Arc Testnet…</div>`
    try {
      const looksHash = /^0x[0-9a-fA-F]{64}$/.test(raw)
      const out = looksHash
        ? await analyzeHash(raw)
        : await analyzeCalldata(raw, toInput.value.trim() || undefined, valueInput.value.trim() || '0')
      result.innerHTML = renderAnalysis(out)
    } catch (e) {
      result.innerHTML = renderError((e as Error).message)
    } finally {
      btn.disabled = false
      btn.textContent = 'Analyze'
    }
  })
}