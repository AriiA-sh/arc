# Stage 6 — Provider-Wrapping Plan (written before implementation)

Per Project Bible Rule 13, this document is written BEFORE any Stage 6 code.
This boundary (injected/content/background) is the project's highest technical
risk. Chain IDs, provider brands, and browser versions change often; the design
must be defeatable-with-evidence, not stealth.

## 1. Goal

Understand the transaction a dApp is about to ask the wallet to sign, LIVE, in
the page — by proxying the page's injected `window.ethereum` so Arc Lens sees
`eth_sendTransaction` / typed-data / personal-sign requests BEFORE the wallet
does. Arc Lens never replaces the wallet and never touches private keys.

## 2. Components

```
dApp page (MAIN world)
   │  window.ethereum.request({ method: 'eth_sendTransaction', params:[tx] })
   ▼
[ injected proxy ]  (Content Script, MAIN world, document_start)
   │  intercepts targeted methods
   │  postMessage({ channel: 'ARCLENS_PAGE' })  ->   page only
   ▼
[ content script ]  (ISOLATED world, document_start)
   │  chrome.runtime.sendMessage ->  (owns the chrome bridge; also reads page DOM)
   ▼
[ background service worker ]
   │  runs decode + risk (shared src/core/...), stores result, replies severity
   ▼
[ content overlay UI ]  "BEFORE YOU SIGN" panel injected into the page
   │  + popup in toolbar
   ▼
proxy awaits original provider promise -> wallet signs as normal
```

## 3. Injection strategy (win the provider race)

- Register the injected content script FIRST in `manifest.json` with
  `"run_at": "document_start"`, `"world": "MAIN"`.
- Inside, install a `defineProperty` trap on `window.ethereum`:

```ts
let current: any
Object.defineProperty(window, 'ethereum', {
  configurable: true,
  get() { return current },
  set(v) { current = wrapReal(v) },
})
```

- Wrapping is **lazy**: whatever value the wallet injects (before OR after us)
  is wrapped the instant it is assigned. If the page fires a getter before any
  assignment, we return `undefined` as a fresh page would.
- If `window.ethereum` is already present and non-configurable, fall back to
  wrapping the existing value directly and re-wrapping on `set`.

## 4. Proxy semantics (must be transparent)

A `Proxy` over the real provider that:

- Forwards ALL property reads/writes (`chainId`, `selectedAddress`,
  `isMetaMask`, `isConnected`, ...) to the real provider.
- Forwards event methods (`on`, `removeListener`, `addListener`,
  `removeAllListeners`) to the real provider (arrow-tied).
- Intercepts `request({method, params})` ONLY for targeted methods;
  everything else passes straight through with identity kept in tact.
- Returns the real provider's promise for intercepted calls so dApp
  await/`.then` behavior is preserved.
- Marks itself `isArcLensProxy = true` so our own detection code can tell it
  apart (avoid double-wrapping / recursion).

Targeted methods:

| method | what we capture | risk value |
| --- | --- | --- |
| `eth_sendTransaction` | `{to,value,data,from,chainId}` | full decode + rules |
| `eth_signTypedData_v4` | EIP-712 domain + message | primaryType-level decode |
| `personal_sign` | message + account | generic warning only |
| `eth_sign` | raw bytes | dangerous-signing warning |
| `wallet_switchEthereumChain` | target chainId | unexpected-network rule |

## 5. Channel protocol (injected -> content -> background)

DOM message namespace: `ARCLENS_PAGE`. Injected posts `{type}` events; content
script filters by namespace+type and forwards to background via
`chrome.runtime.sendMessage`. Background replies with a matching `tabId`-keyed
result. Deep-clonable payloads ONLY (structured clone). No functions across
the boundary.

Events:

- `TX_REQUEST` — { uid, method, tx }
- `RISK_RESULT` — background -> content (decode + findings)
- `UI_STATE` — content -> injected (e.g., analysis status, so page code never
  depends on it)
- `SETTINGS_UPDATED` — settings page -> background

Dedup: a `uid` (crypto random) per request; background caches last N results by
uid and returns cached to any replica query (content script or popup).

## 6. What is NOT done in Stage 6

- No blocking / delaying of the wallet signature (window is advisory; wallet
  remains the sole signing authority and the user can always proceed).
- No DOM reading of the dApp UI yet (that is Stage 7's Displayed-vs-Signed
  Mismatch rule).
- No AI (Stage 8).
- No private key / seed handling anywhere.

## 7. Success condition (controlled test)

A local harness page calls `window.ethereum.request(eth_sendTransaction)` with
a known contract request; the captured payload is decoded in the background and
the "BEFORE YOU SIGN" overlay reflects the correct action + warning — WITHOUT
Arc Lens taking control of the wallet or blocking it.

## 8. Failure modes we design around

- Provider injected again with a NEW object -> set-trap re-wraps.
- Provider removed (`window.ethereum = undefined`) -> get returns undefined.
- Wallet exposes non-configurable property -> direct wrap of current value.
- Multiple Arc Lens instances (dev duplicate) -> if `window.__arcLens` already
  set, new instance does nothing (idempotent).
- In-app wallets with no `window.ethereum` -> nothing to wrap; tool stays
  usable via paste (Phase A) and detection reports "no injected provider".
- Content script sends after background SW went idle -> background keeps a
  module-level cache keyed by uid; SW wake is handled by chrome messaging.

## 9. Deliverables in this stage

- `src/extension/manifest.ts` (typed manifest values; actual JSON generated at build)
- `src/extension/injected/proxy.ts` — the wrapper (pure, no chrome APIs)
- `src/extension/injected/main.ts` — boot, marks `window.__arcLens`
- `src/extension/content/content.ts` — bridge + DOM relay
- `src/extension/content/overlay.ts` — extracted into Stage 7
- `src/extension/background/background.ts` — captures, decodes, replies
- test harness `extension/test/harness.html` for the controlled capture test