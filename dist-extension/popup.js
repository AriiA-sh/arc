(() => {
  // src/extension/popup/main.ts
  var root = document.getElementById("arc-popup-root");
  var statusEl = document.getElementById("arc-status");
  var activateBtn = document.getElementById("arc-activate");
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function render() {
    chrome.storage.local.get("lastSummary", (v) => {
      const s = v?.lastSummary ?? void 0;
      if (!s || !s.uid) {
        root.innerHTML = `No transaction analyzed yet.<br><span class="muted">Open an Arc dApp and request a signature \u2014 Arc Lens reports right before you sign.</span>`;
        return;
      }
      root.innerHTML = `<b>${escapeHtml(s.human)}</b><br>
      <span class="muted">${s.kind} \xB7 ${s.count === 0 ? "no warnings" : s.count + " warning(s)"}</span>
      ${s.aiExplain ? `<div style="margin-top:6px;padding:8px;border:1px solid #2b3242;border-radius:8px">${escapeHtml(s.aiExplain)}</div>` : ""}`;
    });
  }
  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.style.color = ok === false ? "#ff8085" : ok === true ? "#7fd1a0" : "#9aa0a6";
  }
  function activate() {
    activateBtn.hidden = true;
    setStatus("Enabling on this page\u2026");
    chrome.runtime.sendMessage({ kind: "ACTIVATE_TAB" }, (res) => {
      if (chrome.runtime.lastError) {
        setStatus("Could not reach the extension service worker.", false);
        activateBtn.hidden = false;
        return;
      }
      if (res?.ok) setStatus("Active on this page \u2713", true);
      else {
        setStatus(`Enable on this page first \u2014 ${res?.error ?? "unsupported page"}.`, false);
        activateBtn.hidden = false;
      }
    });
  }
  activateBtn.addEventListener("click", activate);
  activate();
  document.getElementById("arc-open-settings")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage?.() ?? chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  });
  render();
  setInterval(render, 1e3);
})();
//# sourceMappingURL=popup.js.map
