# Arc Lens — Architecture (final)

Advisory transaction intelligence for the Arc blockchain (testnet), as a Chrome
MV3 extension. "Understand → Warn → Explain" runs at the exact moment a dApp
asks the wallet to sign, then lets the user decide. Arc Lens never holds keys,
never replaces the wallet, and never blocks a signature — it informs.

## Data path

```
dApp page (MAIN world)
  window.ethereum.request({ method, params })
        │  [window.ethereum trap + Proxy, installed document_start]
        ▼
injected (MAIN world content script)
  intercepts eth_sendTransaction / eth_signTypedData_v4 / personal_sign /
  eth_sign / wallet_switchEthereumChain
  postMessage({ channel:'ARCLENS_PAGE', type:'TX_CAPTURED', uid, method, payload })
        ▼  (page-only; ISOLATED script listens)
content.ts (ISOLATED world)
  chrome.runtime.sendMessage({ kind:'TX_CAPTURED', ... })   → background
        ▼
background SW (module worker)
  decodeTx(input, { fetchTokenMeta, getCode })          viem, testnet RPC
  runRiskEngine(decoded, { hasCode, expectedChainId })  local deterministic rules
  RISK_RESULT → content (plain(), BigInt-safe)          + fire-and-forget AI enrich
        ▼
content.ts → showOverlay()  [BEFORE YOU SIGN card, shadow DOM]
           → postMessage RISK_RESULT (page)
           → chrome.storage lastSummary (popup reads)
```

The intercepted call resolves back to the REAL provider promise, so the wallet
signs normally — Arc Lens observes, never blocks.

## Modules

| path | world | role |
| --- | --- | --- |
| `src/extension/injected/main.ts` + `proxy.ts` | MAIN | `window.ethereum` trap + transparent Proxy, `isArcLensProxy` flag |
| `src/extension/content/content.ts` | ISOLATED | event bridge, overlay trigger, storage write |
| `src/extension/content/overlay.ts` | ISOLATED | BEFORE YOU SIGN card (open shadow root), findings + mismatch + AI note |
| `src/extension/content/mismatch.ts` | ISOLATED | Displayed-vs-Signed: newest-first DOM scan for recipient/address |
| `src/extension/background/background.ts` | SW | decode + risk + respond; optional AI enrichment push |
| `src/extension/ai/ask.ts` | SW | BYOK adapters (Gemini/OpenAI/Anthropic), 12s cap, never throws |
| `src/extension/channel.ts` | shared | protocol types, `ExtensionSettings`, `DEFAULT_SETTINGS` |
| `src/extension/plain.ts` | shared | BigInt-safe normaliser for structured-clone boundaries |
| `src/extension/popup/main.ts` / `settings/settings.ts` | UI | last result view; provider/key/chainId overrides (BYOK) |
| `src/core/decoder/*`, `src/core/risk/*`, `src/arc/*` | shared | pure off-chain decode + deterministic rules engine |

## Boundaries & invariants

- Only `plain()`-safe objects cross `chrome.runtime` (BigInts from viem would
  otherwise reject sending).
- API key is read from storage only in the background, sent only to the chosen
  provider, never logged, never passed through content scripts.
- AI is optional enrichment (`shouldEnrich` gate: provider set + key + severity
  warning/severe). Deterministic rules always run and own severity.
- `run_at: document_start` + explicit `"world"` keys: MAIN injected wins the
  ethereum race; ISOLATED owns chrome + DOM.
- Patchright's `page.evaluate` runs in a separate realm — page-main-world
  probes MUST be done via injected `<script>` writing DOM attributes.

## Accepted trade-offs

- Wallet signal delay: none for the wallet (advisory window). Overlay appears
  as soon as analysis returns; deterministic + fast.
- EOA-to-EOA / unknown flows documented in findings' `limitation` field rather
  than guessed severities.
- No icons in the bundle yet (valid MV3 without them; puzzle icon used). Add
  icons as pixel art before any store upload.

## Testing (all green)

| suite | command | covers |
| --- | --- | --- |
| decoder | `npm run test:stage2` | 8 decode fixtures |
| rules | `npm run test:stage3` | 10 risk rules (+ live testnet getCode) |
| end-to-end core | `npm run test:stage6` | full local pipeline |
| overlay/mismatch | `npm run test:stage7` | jsdom overlay + newest-first |
| AI adapters | `npm run test:stage8` | provider request shape/auth/parse, failure paths |
| browser E2E | `npm run test:stage7-browser` | headed Chromium + `--load-extension`, real dApp click → overlay |
| bundle check | `npm run check:extension` | dist completeness + manifest validity |