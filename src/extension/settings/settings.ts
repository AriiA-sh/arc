import { DEFAULT_SETTINGS } from '../channel'

const el = {
  provider: document.getElementById('aiProvider') as HTMLSelectElement,
  apiKey: document.getElementById('apiKey') as HTMLInputElement,
  network: document.getElementById('network') as HTMLSelectElement,
  chainId: document.getElementById('expectedChainId') as HTMLInputElement,
  save: document.getElementById('save') as HTMLButtonElement,
  status: document.getElementById('status') as HTMLSpanElement,
}

void (async () => {
  const v = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS))
  const s = { ...DEFAULT_SETTINGS, ...(v ?? {}) }
  el.provider.value = s.aiProvider
  el.apiKey.value = s.apiKey ?? ''
  el.network.value = s.network ?? 'testnet'
  el.chainId.value = String(s.expectedChainId ?? 5042002)
})()

el.save.addEventListener('click', () => {
  const expectedChainId = Number(el.chainId.value)
  const network = el.network.value === 'mainnet' ? 'mainnet' : 'testnet'
  chrome.storage.local.set(
    {
      aiProvider: el.provider.value,
      apiKey: el.apiKey.value.trim() || undefined,
      network,
      expectedChainId: Number.isFinite(expectedChainId) ? expectedChainId : network === 'mainnet' ? 5042 : 5042002,
    },
    () => {
      el.status.textContent = 'Saved ✓'
      setTimeout(() => (el.status.textContent = ''), 1500)
    },
  )
})