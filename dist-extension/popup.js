(() => {
  // src/extension/popup/main.ts
  var root = document.getElementById("arc-popup-root");
  function render() {
    chrome.storage.local.get("lastSummary", (v) => {
      const s = v?.lastSummary ?? void 0;
      if (!s || !s.uid) {
        root.innerHTML = `No transaction analyzed yet.<br><span class="muted">Open a dApp and request a signature \u2014 Arc Lens reports right before you sign.</span>`;
        return;
      }
      root.innerHTML = `<b>${escapeHtml(s.human)}</b><br>
      <span class="muted">${s.kind} \xB7 ${s.count === 0 ? "no warnings" : s.count + " warning(s)"}</span>
      ${s.aiExplain ? `<div style="margin-top:6px;padding:8px;border:1px solid #2b3242;border-radius:8px">${escapeHtml(s.aiExplain)}</div>` : ""}`;
    });
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  document.getElementById("arc-open-settings")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage?.() ?? chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  });
  render();
  setInterval(render, 1e3);
})();
//# sourceMappingURL=popup.js.map
