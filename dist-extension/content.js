(() => {
  // src/extension/channel.ts
  var PAGE_CHANNEL = "ARCLENS_PAGE";

  // src/extension/content/mismatch.ts
  var ADDR_RE = /(?:0x[0-9a-fA-F]{40})/g;
  function newestFirst(body) {
    const all = Array.from(
      body.querySelectorAll("button, a, span, div, h1, h2, h3, h4, p, b, i, strong, em, label, li, td, dd, dt")
    ).filter((el) => el.children.length === 0 || /^[0-9a-zA-Z.\s]{2,40}$/.test(el.textContent ?? ""));
    return all.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
  }
  function detectDisplayedAddress(body) {
    const counts = /* @__PURE__ */ new Map();
    for (const el of newestFirst(body)) {
      const text = el.textContent ?? "";
      for (const m of text.matchAll(ADDR_RE)) {
        const addr = m[0].toLowerCase();
        counts.set(addr, (counts.get(addr) ?? 0) + 1);
      }
    }
    let best;
    let bestCount = 0;
    for (const [addr, c] of counts) {
      if (c > bestCount) {
        best = addr;
        bestCount = c;
      }
    }
    return best;
  }
  function displayedLabel(body, shown) {
    for (const el of newestFirst(body)) {
      const text = el.textContent ?? "";
      if (text.toLowerCase().includes(shown.slice(0, 10))) {
        const clean = text.replace(ADDR_RE, " ").replace(/\s+/g, " ").trim();
        if (clean && clean.length > 0 && clean.length <= 40) return clean;
      }
    }
    return void 0;
  }
  function runMismatchCheck(body, txTo) {
    if (!txTo || txTo === "0x") return { detected: false };
    const shownAddress = detectDisplayedAddress(body);
    if (!shownAddress) return { detected: false };
    const signed = txTo.toLowerCase();
    if (shownAddress === signed) return { detected: false };
    return {
      detected: true,
      shownAddress,
      shownLabel: displayedLabel(body, shownAddress),
      signedAddress: txTo,
      reason: `The page displays ${shownAddress}, but the transaction the wallet is asked to sign targets ${txTo}.`
    };
  }
  function severityOf(summary, mismatch) {
    if (mismatch.detected) return "severe";
    return summary.severity;
  }

  // src/extension/content/overlay.ts
  var OVERLAY_ID = "arc-lens-overlay";
  function createHost() {
    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    const shadow = host.attachShadow({ mode: "open" });
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
        <span class="arc-title">ARC LENS \xB7 BEFORE YOU SIGN</span>
        <button class="arc-dismiss" aria-label="dismiss">\u2715</button>
      </div>
      <div class="arc-body">
        <p class="arc-action"></p>
        <span class="arc-kind"></span>
        <span class="arc-badge"></span>
        <div class="arc-warns"></div>
        <div class="arc-mismatch" hidden></div>
        <details class="arc-details"><summary>Show details</summary><div class="arc-details-body"></div></details>
      </div>
      <div class="arc-foot">Deterministic local analysis \xB7 <code>#uid</code></div>
    </div>
  `;
    return host;
  }
  function showOverlay(payload) {
    const { summary, txTo } = payload;
    const mismatch = runMismatchCheck(document.body ?? document.documentElement, txTo);
    const severity = severityOf(summary, mismatch);
    let host = document.getElementById(OVERLAY_ID);
    if (!host) host = createHost();
    const shadow = host.shadowRoot;
    const badge = shadow.querySelector(".arc-badge");
    badge.textContent = severity === "safe" ? "NO WARNING" : `${severity.toUpperCase()} \u2014 ${summary.count} issue(s)`;
    badge.className = `arc-badge ${severity}`;
    shadow.querySelector(".arc-action").textContent = summary.human;
    shadow.querySelector(".arc-kind").textContent = summary.kind;
    shadow.querySelector(".arc-foot code").textContent = `#${summary.uid.slice(-6)}`;
    const warns = shadow.querySelector(".arc-warns");
    warns.innerHTML = "";
    const findings = summary.findings ?? [];
    for (const f of findings) {
      if (f.severity === "info") continue;
      const el = document.createElement("div");
      el.className = `arc-warn ${f.severity === "warning" ? "warning" : "severe"}`;
      el.innerHTML = `<b>${f.rule}</b><span>${f.reason}</span>`;
      warns.appendChild(el);
    }
    const detailsBody = shadow.querySelector(".arc-details-body");
    detailsBody.querySelectorAll("*").forEach((n) => n.remove());
    const dl = document.createElement("div");
    dl.innerHTML = `<div>Target: <code>${summary.to ?? "\u2014"}</code></div><div>Value: <code>${summary.value ?? "0"}</code></div>` + findings.map(
      (f) => `<div style="margin-top:6px"><b>${f.rule}</b> \u2014 ${f.reason}<br><span style="color:#6f7683">Evidence: ${f.evidence}</span></div>`
    ).join("");
    detailsBody.appendChild(dl);
    if (summary.aiExplain) {
      const ai = document.createElement("div");
      ai.className = "arc-ai";
      ai.innerHTML = `<b>AI explain</b>${escapeHtml(summary.aiExplain)}`;
      detailsBody.appendChild(ai);
    }
    const mismatchBox = shadow.querySelector(".arc-mismatch");
    if (mismatch.detected) {
      mismatchBox.hidden = false;
      mismatchBox.innerHTML = `<b>\u26A0 Displayed vs Signed mismatch</b><div>${mismatch.reason}</div><div style="margin-top:4px">Page shows: <code>${mismatch.shownAddress}</code>` + (mismatch.shownLabel ? ` (${mismatch.shownLabel})` : "") + `<br>Wallet asked to sign: <code>${mismatch.signedAddress ?? ""}</code></div>`;
    }
    host.dataset.arcUid = summary.uid;
    shadow.querySelector(".arc-dismiss").addEventListener("click", () => host.remove());
    document.documentElement.appendChild(host);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function appendAiExplain(uid, text) {
    const host = document.getElementById(OVERLAY_ID);
    const shadow = host?.shadowRoot;
    if (!host || !shadow || host.dataset.arcUid !== uid) return;
    const detailsBody = shadow.querySelector(".arc-details-body");
    if (!detailsBody) return;
    if (detailsBody.querySelector(".arc-ai")) return;
    const ai = document.createElement("div");
    ai.className = "arc-ai";
    ai.innerHTML = `<b>AI explain</b>${escapeHtml(text)}`;
    detailsBody.appendChild(ai);
  }

  // src/extension/plain.ts
  function plain(value) {
    return JSON.parse(
      JSON.stringify(
        value,
        (_key, v) => typeof v === "bigint" ? v.toString() : v
      )
    );
  }

  // src/extension/content/content.ts
  var pendingTx = /* @__PURE__ */ new Map();
  function onPageMessage(event) {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.channel !== PAGE_CHANNEL || data.type !== "TX_CAPTURED") return;
    if (event.source !== window) return;
    const payload = data.payload ?? {};
    if (payload.tx?.to) pendingTx.set(data.uid, { to: payload.tx.to });
    chrome.runtime.sendMessage({ kind: "TX_CAPTURED", uid: data.uid, method: data.method, payload: data.payload }).then((res) => {
      if (res?.msg === "RISK_RESULT") {
        const info = pendingTx.get(data.uid);
        if (res.severity === "safe" || res.severity === "warning" || res.severity === "severe") {
          showOverlay({ summary: res, txTo: info?.to });
        }
        window.postMessage({ channel: PAGE_CHANNEL, type: "RISK_RESULT", ...res }, "*");
        pendingTx.delete(data.uid);
        chrome.storage.local.set({ lastSummary: plain(res) });
      }
    }).catch(() => {
    });
  }
  window.addEventListener("message", onPageMessage);
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.msg === "RISK_RESULT") {
      window.postMessage({ channel: PAGE_CHANNEL, type: "RISK_RESULT", ...msg }, "*");
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.msg === "RISK_AI_EXTRA") {
      window.postMessage(
        { channel: PAGE_CHANNEL, type: "RISK_AI_EXTRA", uid: msg.uid, aiExplain: msg.aiExplain },
        "*"
      );
      appendAiExplain(msg.uid, msg.aiExplain);
      void chrome.storage.local.get("lastSummary").then((v) => {
        const last = v?.lastSummary;
        if (last?.uid === msg.uid) {
          void chrome.storage.local.set({ lastSummary: plain({ ...last, aiExplain: msg.aiExplain }) });
        }
      });
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });
})();
//# sourceMappingURL=content.js.map
