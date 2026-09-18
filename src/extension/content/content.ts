import { PAGE_CHANNEL, type InjectedOutbound } from '../channel'
import { showOverlay, appendAiExplain } from './overlay'
import { plain } from '../plain'

/**
 * ISOLATED-world bridge. Receives TX_CAPTURED from the MAIN-world injected
 * script via window.postMessage and forwards it to the background service
 * worker over chrome.runtime. Also relays risk results back so a UI layer can
 * react (popup / overlay — see Stage 7).
 */
const pendingTx = new Map<string, { to?: string }>()

function onPageMessage(event: MessageEvent) {
  const data = event.data as InjectedOutbound | undefined
  if (!data || typeof data !== 'object') return
  if (data.channel !== PAGE_CHANNEL || data.type !== 'TX_CAPTURED') return
  if (event.source !== window) return

  const payload = (data.payload ?? {}) as { tx?: { to?: string } }
  if (payload.tx?.to) pendingTx.set(data.uid, { to: payload.tx.to })

  chrome.runtime
    .sendMessage({ kind: 'TX_CAPTURED', uid: data.uid, method: data.method, payload: data.payload })
    .then((res) => {
      if (res?.msg === 'RISK_RESULT') {
        const info = pendingTx.get(data.uid)
        if (res.severity === 'safe' || res.severity === 'warning' || res.severity === 'severe') {
          showOverlay({ summary: res, txTo: info?.to })
        }
        window.postMessage({ channel: PAGE_CHANNEL, type: 'RISK_RESULT', ...res }, '*')
        pendingTx.delete(data.uid)
        chrome.storage.local.set({ lastSummary: plain(res) })
      }
    })
    .catch(() => {
      /* background not responsive (e.g. SW restarting) — capture is advisory */
    })
}

window.addEventListener('message', onPageMessage)

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.msg === 'RISK_RESULT') {
    window.postMessage({ channel: PAGE_CHANNEL, type: 'RISK_RESULT', ...msg }, '*')
    sendResponse({ ok: true })
    return true
  }
  if (msg?.msg === 'RISK_AI_EXTRA') {
    window.postMessage(
      { channel: PAGE_CHANNEL, type: 'RISK_AI_EXTRA', uid: msg.uid, aiExplain: msg.aiExplain },
      '*',
    )
    appendAiExplain(msg.uid, msg.aiExplain)
    void chrome.storage.local.get('lastSummary').then((v) => {
      const last = (v as { lastSummary?: { uid?: string } })?.lastSummary
      if (last?.uid === msg.uid) {
        void chrome.storage.local.set({ lastSummary: plain({ ...last, aiExplain: msg.aiExplain }) })
      }
    })
    sendResponse({ ok: true })
    return true
  }
  return false
})