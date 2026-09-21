(() => {
  // src/extension/channel.ts
  var DEFAULT_SETTINGS = {
    aiProvider: "disabled",
    network: "testnet",
    expectedChainId: 5042002,
    overlayEnabled: true
  };

  // src/extension/settings/settings.ts
  var el = {
    provider: document.getElementById("aiProvider"),
    apiKey: document.getElementById("apiKey"),
    network: document.getElementById("network"),
    chainId: document.getElementById("expectedChainId"),
    save: document.getElementById("save"),
    status: document.getElementById("status")
  };
  void (async () => {
    const v = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    const s = { ...DEFAULT_SETTINGS, ...v ?? {} };
    el.provider.value = s.aiProvider;
    el.apiKey.value = s.apiKey ?? "";
    el.network.value = s.network ?? "testnet";
    el.chainId.value = String(s.expectedChainId ?? (s.network === "mainnet" ? 5042 : 5042002));
  })();
  el.network.addEventListener("change", () => {
    const defaultChain = el.network.value === "mainnet" ? 5042 : 5042002;
    if (Number(el.chainId.value) !== defaultChain && !el.chainId.dataset.touched) {
      el.chainId.value = String(defaultChain);
    }
  });
  el.chainId.addEventListener("input", () => {
    el.chainId.dataset.touched = "true";
  });
  el.save.addEventListener("click", () => {
    const expectedChainId = Number(el.chainId.value);
    const network = el.network.value === "mainnet" ? "mainnet" : "testnet";
    const apiKey = el.apiKey.value.trim() || void 0;
    if (el.provider.value !== "disabled" && apiKey) {
      const origins = el.provider.value === "gemini" ? ["https://generativelanguage.googleapis.com/*"] : el.provider.value === "openai" ? ["https://api.openai.com/*"] : ["https://api.anthropic.com/*"];
      chrome.permissions?.request?.({ origins }, () => {
      });
    }
    chrome.storage.local.set(
      {
        aiProvider: el.provider.value,
        apiKey,
        network,
        expectedChainId: Number.isFinite(expectedChainId) ? expectedChainId : network === "mainnet" ? 5042 : 5042002
      },
      () => {
        el.status.textContent = "Saved \u2713";
        setTimeout(() => el.status.textContent = "", 1500);
      }
    );
  });
})();
//# sourceMappingURL=settings.js.map
