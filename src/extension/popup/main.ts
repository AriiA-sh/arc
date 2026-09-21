import type { RiskSummary } from '../channel'

const root = document.getElementById('arc-popup-root')!
const statusEl = document.getElementById('arc-status')!
const activateBtn = document.getElementById('arc-activate') as HTMLButtonElement

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function render() {
  chrome.storage.local.get('lastSummary', (v) => {
    const s = (v?.lastSummary ?? undefined) as RiskSummary | undefined
    if (!s || !s.uid) {
      root.innerHTML = `No transaction analyzed yet.<br><span class="muted">Open an Arc dApp and request a signature — Arc Lens reports right before you sign.</span>`
      return
    }
    root.innerHTML = `<b>${escapeHtml(s.human)}</b><br>
      <span class="muted">${s.kind} · ${s.count === 0 ? 'no warnings' : s.count + ' warning(s)'}</span>
      ${s.aiExplain ? `<div style="margin-top:6px;padding:8px;border:1px solid #2b3242;border-radius:8px">${escapeHtml(s.aiExplain)}</div>` : ''}`
  })
}

function setStatus(text: string, ok?: boolean) {
  statusEl.textContent = text
  statusEl.style.color = ok === false ? '#ff8085' : ok === true ? '#7fd1a0' : '#9aa0a6'
}

function activate() {
  activateBtn.hidden = true
  setStatus('Enabling on this page…')
  chrome.runtime.sendMessage({ kind: 'ACTIVATE_TAB' }, (res) => {
    if (chrome.runtime.lastError) {
      setStatus('Could not reach the extension service worker.', false)
      activateBtn.hidden = false
      return
    }
    if (res?.ok) setStatus('Active on this page ✓', true)
    else {
      setStatus(`Enable on this page first — ${res?.error ?? 'unsupported page'}.`, false)
      activateBtn.hidden = false
    }
  })
}

activateBtn.addEventListener('click', activate)
activate()

document.getElementById('arc-open-settings')?.addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage?.() ?? chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })
})

render()
setInterval(render, 1000)