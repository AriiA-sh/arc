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
  el.chainId.value = String(s.expectedChainId ?? (s.network === 'mainnet' ? 5042 : 5042002))
})()

el.network.addEventListener('change', () => {
  const defaultChain = el.network.value === 'mainnet' ? 5042 : 5042002
  if (Number(el.chainId.value) !== defaultChain && !el.chainId.dataset.touched) {
    el.chainId.value = String(defaultChain)
  }
})

el.chainId.addEventListener('input', () => {
  el.chainId.dataset.touched = 'true'
})

el.save.addEventListener('click', () => {
  const expectedChainId = Number(el.chainId.value)
  const network = el.network.value === 'mainnet' ? 'mainnet' : 'testnet'
  const apiKey = el.apiKey.value.trim() || undefined
  // Privacy: Chrome asks once, at save time, for access ONLY to the chosen
  // provider's API host. Nothing else is ever requested.
  if (el.provider.value !== 'disabled' && apiKey) {
    const origins =
      el.provider.value === 'gemini'
        ? ['https://generativelanguage.googleapis.com/*']
        : el.provider.value === 'openai'
          ? ['https://api.openai.com/*']
          : ['https://api.anthropic.com/*']
    chrome.permissions?.request?.({ origins }, () => {})
  }
  chrome.storage.local.set(
    {
      aiProvider: el.provider.value,
      apiKey,
      network,
      expectedChainId: Number.isFinite(expectedChainId) ? expectedChainId : network === 'mainnet' ? 5042 : 5042002,
    },
    () => {
      el.status.textContent = 'Saved ✓'
      setTimeout(() => (el.status.textContent = ''), 1500)
    },
  )
})