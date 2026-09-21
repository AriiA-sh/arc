<div align="center">

# 🔭 Arc Lens

**Understand → Warn → Explain.**

The first signing-time safety layer for [Arc](https://arc.io). Before you sign, Arc Lens
decodes the transaction into plain language and warns you if a request is dangerous — or
if the page is showing one thing while the signature says another.

> Status: **working proof-of-concept**, MIT licensed, no servers, no accounts, no private keys.

</div>

---

## Table of contents (English)

- [Why this exists](#why-this-exists)
- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
  - [Try the web app](#try-the-web-app)
  - [Install the extension](#install-the-extension)
- [Chains & networks](#chains--networks)
- [Security & privacy model](#security--privacy-model)
- [Known limitations (honest list)](#known-limitations-honest-list)
- [The critic's checklist](#the-critics-checklist-and-our-answers)
- [Project layout](#project-layout)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Public launch checklist](#public-launch-checklist)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [License](#license)

---

## Why this exists

Phishing is the #1 way money is lost in crypto. The most effective attacks share a shape:

> A site shows you *one* thing, and asks your wallet to sign *another*.

Maybe it displays "Deliver to: 0xDEAD…" and requests "Approve 0x13AC…". Maybe it asks for an
unlimited approval so the attacker can drain you at any later moment. Your wallet's own prompt
is designed for the happy path, not for this adversarial comparison.

Arc Lens sits between the dApp and the signature: it watches what the dApp actually *requests*,
decodes it, compares it against what the *page* shows, and explains the consequences in plain
language — before you press "Confirm".

Built specifically for [Arc](https://arc.io) — the smart-contract platform where **USDC is the
native gas token**. That makes tokens-native phishing a first-class target, and it makes a
stablecoin-native safety layer the right first security tool for the ecosystem.

Arc mainnet went **public on 2026-09-16** (chain ID **5042**). This project is one of the first
security tools for it.

---

## What it does

| Capability | Where |
| --- | --- |
| Decode a tx hash **or** raw calldata into plain language | Web app (step 1) |
| Deterministic risk rules (works with **zero AI** and zero cost) | Web app + extension |
| Compare **displayed vs signed** address (the phishing tell) | Extension (auto) |
| Warn card before you press Confirm, with badge severity + mismatch box | Extension |
| Optional plain-language AI explanation of *why* it matters | Extension, BYOK |
| Works with or **without** any wallet | Web app |
| Read-only wallet detection (network + account, nothing else) | Web app |
| Runs entirely on-device, no server, no accounts | Both |

The warning card shows four things:

1. **Badge** — `SEVERE — 2 issue(s)` / `WARNING — 1 issue` / `NO WARNING`.
2. **Action** — what this transaction actually does (e.g. "Approve USDC").
3. **Mismatch box** — if the *displayed* destination differs from the *signed* destination.
4. **Reasons** — each risk rule that fired, plus a plain-language explanation and a
   documented limitation, so you can override it with informed judgment.

---

## How it works

```
┌─────────────┐   eth_request/eth_sendTransaction    ┌──────────────────────────┐
│    dApp     │ ───────────────────────────────────▶ │  window.ethereum Proxy   │
│  (page)     │ ◀─────────────────────────────────── │  (injected MAIN world)   │
└─────────────┘      provider response               └────────────┬─────────────┘
                                                                  │ TX_CAPTURED
                                                                  ▼
                                              ┌─────────────────────────────────────┐
                                              │            background.ts              │
                                              │ decode → risk rules → plain() summary │
                                              └────────────┬──────────────────────────┘
                                                           │ risk + txTo
                                                           ▼
                                              ┌─────────────────────────────────────┐
                                              │  content.ts (ISOLATED world)          │
                                              │  showOverlay: card · compare with     │
                                              │  the *displayed* destination          │
                                              └─────────────────────────────────────┘
```

- **Injected layer** (`world: MAIN`): a `Proxy` wraps `window.ethereum`. It is installed as a
  **non-configurable, non-writable accessor** so a page cannot silently delete or redefine the
  property to escape observation. It never exposes the raw provider.
- **Bridge**: intercepted `eth_sendTransaction` / EIP-712 requests are forwarded to the
  extension's service worker, which also fetches the transaction *replacement* (commit/calldata)
  for ERC standards.
- **Decoder + rules** (deterministic): function signatures, ABI names, EOA-vs-contract checks,
  unlimited/allowed-amount checks, network checks, and the signature→to-address comparison.
- **AI explain** (optional): if you configure an API key, the summary is rewritten into a short
  human sentence. The rules never depend on AI — disabling AI changes nothing about detection.
- **Overlay** (ISOLATED world): renders the card in the page. It is *advisory*: it never blocks,
  never signs, never forges. The user presses Confirm in their own wallet.

Surfacing only: the extension reads the requests the page makes and responds *through the same
proxy*, so the wallet library keeps working normally.

---

## Quick start

### Try the web app

```bash
npm install
npm run build
npm run hub
```

Open `http://127.0.0.1:45123`.

- **Step 1** — paste a tx hash from the explorer, or raw calldata (+ contract address for
  calldata). Press Analyze.
- **Step 2** — the live simulator: pick a scene ("site shows one address, signature targets
  another", "unlimited approval", "normal") and hit Simulate. This is the exact overlay the
  extension renders, using the real detection path.
- **Step 3** — install guide.

### Install the extension

```bash
npm run build:extension
```

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. **Load unpacked** → select `dist-extension/`.
4. Open an Arc dApp (`*.arc.io`, `*.arc.network`) or `localhost` and request a signature.

On Arc-owned domains and localhost the observer auto-injects. On **any other site**, protection
is on-demand for your privacy: click the toolbar icon once to activate, then the 
"Active on this page ✓" label appears.

### Configure AI explain (optional, BYOK)

From the extension's **Settings** (right-click the icon → Options). Pick a provider
(Gemini / OpenAI / Anthropic), set your own API key. Chrome will ask you **once** for access to
that provider's API host only — that is the *only* optional permission Arc Lens can ever request
(no `<all_urls>`, ever). Store it locally. To use without AI: leave provider at "disabled" —
all rules still work.

---

## Chains & networks

| Network | Chain ID | RPC (official) | Explorer | Status |
| --- | --- | --- | --- | --- |
| Arc Mainnet | `5042` (`0x13b2`) | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` | Public since 2026-09-16 |
| Arc Testnet | `5042002` (`0x4cef52`) | `https://rpc.testnet.arc.io` | `https://explorer.testnet.arc.io` | Permissioned → public |

The extension and web app detect which network a signature/query targets and pick the matching
RPC automatically. A mismatch (wallet on the wrong network for the request) is itself a warning.

Faucet for testnet USDC: `https://arc.io`.

---

## Security & privacy model

**What the extension can and cannot access** (verify it yourself in
`dist-extension/manifest.json`):

- `storage` — your local settings + the last risk summary shown in the popup.
- `activeTab` + `scripting` — used to enable the observer on the *current tab* when you click
  the icon (on-demand activation).
- `host_permissions` — **only** `https://rpc.testnet.arc.io/*` and `https://rpc.mainnet.arc.io/*`.
  Network requests go to Arc's own public RPCs, or to nothing.
- `optional_host_permissions` — the three AI providers, requested **at save time** only when you
  add a key.
- Content scripts auto-inject **only** on `arc.io`, `arc.network`, `localhost`, `127.0.0.1`.

Never anywhere: private keys, seed phrases, remote code, a backend, analytics, or telemetry.

**Why the proxy can't be silently dropped:** `window.ethereum` is installed with
`configurable: false`, so page JavaScript cannot `delete` it or redefine it to unwrap.
Re-injection is idempotent (a flag prevents double listeners). It accepts a late-loading wallet
provider via the accessor setter plus a short best-effort poll.

---

## Known limitations (honest list)

An advisory bypassing the *signing surface itself* — if the dApp talks to the wallet in a way
that skips its own page — would produce a confirmation you'd see in your wallet but not here.
Specifically:

1. **Heuristic rules, not symbolic execution.** A packed contract call with an unknown ABI
   yields "unrecognized contract code — be careful", not a guarantee. Full sponsor-analysis
   (simulating the nested `eth_call` behind a sponsored tx) is future work.
2. **Advisory only.** Arc Lens cannot and does not block a signature. A malicious dApp can still
   request a transaction directly from the wallet library in ways we can't always observe; the
   final gate is always your wallet ("Confirm" button).
3. **NotEmpty integration surface.** The rules are static knowledge. Novel exploit patterns need
   new rules (a rules harness + rule IDs make this incremental).
4. **`latest-block` semantics, fondly.** Analyses read the state at the time of request; later
   state changes (allowance churn) aren't re-triggered within a tab's lifetime.
5. **AI explanations don't drive decisions.** Detection is deterministic; AI only rewords. If AI
   is off or keyless, behavior is unchanged.
6. **Store-ready ≠ unpacked-ready.** No signed store build, no icon set, no packaging for
   Chrome Web Store / Firefox, no cross-browser CI, no audit attestation yet.
7. **Only EVM-EOA flows.** Gateways/account-abstraction signing (e.g. smart-account signing via
   SDK such as MetaMask-layer SDKs) is out of scope for v1.
8. **EOA-vs-contract check is per chain at request time** — genuinely a heuristic; a contract
   may be deployed at the same address later.

We prefer these stated plainly over pretending to be a panacea.

---

## The critic's checklist and our answers

| Critic says | Status / Mitigation |
| --- | --- |
| "It's all `window.ethereum`, a dApp can bypass it" | Partially true (advisory by design), see #2 above. What we *can* close we close: non-configurable proxy, no raw provider leak, double-injection guarded, on-demand activation via popup so it covers pages that never auto-inject. |
| "Phrases in unrelated to actual risk" | All findings carry `reason` + `evidence` + `limitation`. Rules are deterministic and unit-tested. |
| "AI is a black box, can be gamed/altered verdicts" | AI is **optional and only rewords**. Verdicts come from deterministic rules; removing AI is a settings toggle. |
| "It has fewer rules than ScamSniffer/WalletGuard" | True. The rules harness + `rule id` → `reason` schema is designed to grow; adding a rule is ~30 lines + a unit test. |
| "Host permissions are `<all_urls>`" | **No longer true** — see [Security & privacy model](#security--privacy-model). |
| "It stores your keys" | Never. API key lives in `chrome.storage.local`, used only in your browser, never transmitted except to the provider you *chose*. |
| "No one will find it" | Being first-for-an-ecosystem is the launch story; see [Public launch checklist](#public-launch-checklist). |

---

## Project layout

```
arc/
├─ src/
│  ├─ web/                # Vite web app (unified single page: analyze + demo + install)
│  │  ├─ main.ts          # boot → mountUnified
│  │  ├─ simple.ts        # mountUnified: the whole user-facing page
│  │  ├─ analyze.ts       # analysis orchestration for the web app
│  ├─ arc/
│  │  ├─ chain.ts         # chain registry, ARC chain IDs (testnet/mainnet)
│  │  └─ client.ts        # viem clients, setAnalysisChain, currentChain, explorerUrl
│  ├─ core/
│  │  ├─ approve/         # ERC-20 approve decoding (allowance semantics)
│  │  ├─ decode/          # calldata/tx decoding front-door
│  │  ├─ risk/            # deterministic risk rules (id → reason → evidence → limitation)
│  │  ├─ transfer/        # erc20 / native transfer decoding
│  │  └─ wallet/detect.ts # read-only wallet detection (no account requests)
│  ├─ extension/
│  │  ├─ background/      # service worker: framing, rules, TX_CAPTURED, ACTIVATE_TAB
│  │  ├─ content/         # ISOLATED bridge + overlay card
│  │  ├─ injected/        # MAIN-world Ethereum proxy (anti-bypass accessor)
│  │  ├─ popup/           # popup: last summary + “Enable on this page”
│  │  └─ settings/        # network + chainId + AI provider/key (permission at save)
├─ extension/
│  └─ test/harness.html   # local dApp simulator (auto-inject target for E2E)
├─ demo/                  # standalone screenshot scene for launch assets
├─ scripts/
│  ├─ build-extension.mjs # esbuild extension bundle + inline manifest.json
│  ├─ serve.mjs           # single-port dev server (45123): web + demo + harness
│  ├─ stage9/             # check-extension.mjs gate (manifest assertions)
│  └─ stage7/             # browser E2E (@patchright + harness + shipped extension)
└─ package.json           # scripts: build, hub, test, test:stage7-browser, demo:screenshot
```

---

## Development

Requirements: Node.js ≥ 20 (tested on v24), npm.

```bash
npm install
npm run build          # type-check (tsc) + vite web build → dist/
npm run build:extension   # esbuild extension + manifest → dist-extension/
npm run hub            # dev server on http://127.0.0.1:45123
npm test               # unit tests (stage9 incl. manifest assertions)
npm run test:stage7-browser  # headed-Chromium E2E of the shipped extension
npm run demo:screenshot      # rebuild the standalone demo scene (demo/)
```

**Adding a risk rule** (`src/core/risk/`): new `RiskFindingId`, a matcher, a unit test, a
plain-language line in the web mapper. That's the whole contract.

**Editing the overlay** lives in `src/extension/content/overlay.ts`; the popup in
`src/extension/popup/`; settings in `src/extension/settings/`.

After any extension change: `npm run build:extension`, then in `chrome://extensions` hit
**Reload** on Arc Lens.

---

## Testing

- **Unit / static gates** — `npm test`: decoder fixtures, rule matrices, manifest assertions
  (no `<all_urls>`, `scripting`+`activeTab` present, AI hosts optional, auto-inject restricted
  to Arc/localhost).
- **Browser E2E** — `npm run test:stage7-browser`: loads the *shipped* `dist-extension` into a
  real Chromium (`@patchright`), opens the harness dApp on `127.0.0.1`, requests an approval,
  and asserts: injected ✓ proxy ✓ risk summary ✓ overlay mounted with `SEVERE — 2 issue(s)` ✓
  wallet signed ✓ zero console/page errors ✓.
- **Manual smoke** — the same steps via `npm run hub` → step 2 simulator, and a real Arc dApp
  with the extension loaded.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Extension won't load (manifest error) | Ensure you selected the **non-nested** `dist-extension/` folder (the one with `manifest.json` directly inside). Re-run `npm run build:extension` first. |
| White page on `http://127.0.0.1:45123` | A stale server holds the port (orphaned `node scripts/serve.mjs`). Kill it, then `npm run hub` again. Hard-refresh (Ctrl+Shift+R) to clear cached 404 routes. |
| "No wallet found" in the app | The page only *reads*; it never requests accounts. Click **Connect (read-only)**; the button only asks for address visibility, never signing. |
| Wallet shows "— locked" | Site isn't connected to the wallet yet. Same Connect flow; the extension app never signs anything. |
| "Network ✗ not an Arc network" | The wallet is on a chain that isn't Arc testnet (5042002) or Arc mainnet (5042). This exact wording is what told us the wallet was on the wrong network. |
| Observer not active on a random site | By design. Click the toolbar icon once to activate the tab ("Active on this page ✓"). |
| Chrome asks about an API host after saving AI settings | Expected — that's the one optional permission (your chosen provider only). |
| RPC timeouts | The app dials Arc's own public RPCs from your browser; a transient provider hiccup can happen. Retry. |

---

## Public launch checklist

- [ ] Push this repository (public, MIT).
- [ ] Add a 20-second demo GIF (run `npm run demo:screenshot`) to the README header.
- [ ] One launch post: the displayed-vs-signed scene + "first signing-time safety layer for Arc"
      with a tag to `@Arc` / `@Circle`.
- [ ] Post in Arc House / Discord; link the bounded-permission manifest as proof.
- [ ] Validate against **one real Arc mainnet dApp** (not just the harness) and publish the
      video — this is the credibility artifact.
- [ ] Optional: apply to Arc's security bounty track ("Deploy more securely on Arc").

---

## Roadmap

**v0.2 — hardening & sellers**
- Symbolic execution for advertised-vs-actual calldata (nested `eth_call` sponsor analysis).
- Browser-store packaging (CWS + Firefox) with proper icons and `minimum_chrome_version`.
- Known-spender allowlist (your saved addresses) with explicit confirm-on-change.

**v0.3 — ecosystem**
- Rule packs contributed via the rules harness.
- Smart-account / SDK signing surfaces.
- French/German/Spanish + Farsi landing copy.

---

## FAQ

**Does it need money or accounts?** No. No servers, no accounts, no subscriptions; AI is
bring-your-own-key, and rules are AI-free.

**Does it store my seed/key?** Never. It cannot sign. It only reads and explains.

**Do you use MetaMask SDK or official clients on-chain?** We use *public* Arc RPCs directly
(`rpc.testnet.arc.io`, `rpc.mainnet.arc.io`) and detect the installed wallet read-only in the
page. The extension never signs.

**Is detection chain-secure?** Chain IDs and explorers were verified live against Arc's own RPC
endpoints before publishing.

**Can I trust a tool that says "advisory"?** That's exactly why you should. The card states
rules, evidence, and limitations; the final call is always yours — and your wallet's.

---

## License

[MIT](./LICENSE) © 2026 Arc Lens contributors.

<!-- ==================================================== -->
<!-- ================= فارسی (Farsi) ==================== -->
<!-- ==================================================== -->

<div align="center">

# 🔭 آرک لنز

**فهمیدن ← هشدار دادن ← توضیح دادن**

اولین لایهی امنیتیِ لحظهیامضا برای [آرک](https://arc.io). قبل از اینکه امضا کنی،
تراکنش به زبان ساده رمزگشایی میشود؛ اگر خطری باشد — یا تقلبی که صفحه یک چیز نشان میدهد
و درخواستِ امضا چیزِ دیگری است — قبل از تأیید به تو گفته میشود.

</div>

> وضعیت: **پروتوتایپِ کارا**، مجوز MIT، بدون سرور، بدون حساب، بدون کلید خصوصی.

---

## چرا ساخته شد

اولین راهِ از دست رفتن پول در کریپتو فیشینگ است؛ حملههای موفق همگی یک شکل دارند: **سایت یک
چیز را نشان میدهد و از کیفات میخواهد چیزِ دیگری را امضا کند.** مثلاً «تحویل به 0xDEAD…»
را نمایش میدهد ولی «اجازهی برداشت 0x13AC…» را درخواست میکند. یا اجازهی **نامحدود** میگیرد
تا هر وقت خواست حسابت را خالی کند. پنجرهی کیف پول برای مسیرِ عادی طراحی شده، نه برای مقایسهی
این دو. آرک لنز بین dApp و امضا میایستد: درخواستِ واقعی را میخواند، رمزگشایی میکند، با چیزی
که صفحه نشان میدهد مقایسه میکند و نتیجه را قبل از دکمهی Confirm به زبان ساده توضیح میدهد.

چرا مخصوص Arc؟ چون **USDC توکنِ گازِ بومی** است؛ فیشینگِ توکن-محور در آن هدفِ درجهی یک است.
مایننتِ Arc از **۱۶ سپتامبر ۲۰۲۶** عمومی شده (chain ID **5042**) و آرک لنز یکی از اولین ابزارهای
امنیتیِ آن است.

---

## چه کاری میکند

- رمزگشاییِ **hash تراکنش یا کالیسدیتای خام** به زبان ساده.
- قواعد ریسکِ **قطعی** که بدون هیچ AI و بدون هیچ هزینهای کار میکند.
- مقایسهی **نمایش ↔ امضا** (نشانهی اصلی فیشینگ).
- کارتِ هشدار قبل از Confirm با نشانِ شدت + باکس «ناهماهنگی آدرس».
- توضیحِ اختیاریِ AI با کلیدِ خودِ کاربر (BYOK).
- کار با یا **بدون کیف پول**؛ تشخیصِ کیفِ فقط-خواندنی (شبکه + آدرس، نه بیشتر).
- کاملاً **روی دستگاه خودت**؛ بدون بکاند.

## چگونه کار میکند

یک `Proxy` روی `window.ethereum` (در world‌ی MAIN) مینشیند؛ `eth_sendTransaction` و درخواستهای
EIP-712 را رهگیری میکند و به سرویسکار (background) میفرستد؛ آنجا رمزگشایی + قواعد ریسک اجرا و
خلاصه با `plain()` (سازگار با structured clone کروم) به layer‌ی ISOLATED برمیگردد؛ و کارت هشدار
در صفحه رندر میشود. **کارت فقط هشدار میدهد** — هرگز امضا نمیکند، هرگز بلاک نمیکند.

پروکسی بهگونهای نصب میشود که **حذف یا جایگزینی توسط صفحه ممکن نیست** (`configurable: false`)؛
پروایدر خام هرگز به صفحه نشت داده نمیشود؛ و تزریق دوباره شناسهگذاری میشود تا شنوندهی تکراری
نسازد.

## شروع سریع

```bash
npm install
npm run build
npm run hub        # → http://127.0.0.1:45123
```

برای اکستنشن: `npm run build:extension` سپس در `chrome://extensions` → Developer mode →
**Load unpacked** → پوشهی `dist-extension/`.

دامنههای Arc و localhost خودکار فعال میشوند؛ در **هر سایتِ دیگر** برای حفظ حریم خصوصیت باید
یکبار روی آیکن اکستنشن کلیک کنی تا آن برگه فعال شود («Active on this page ✓»).

## شبکهها

| شبکه | Chain ID | RPC رسمی | اکسپلورر |
| --- | --- | --- | --- |
| میننت Arc | `5042` (`0x13b2`) | `rpc.mainnet.arc.io` | `explorer.arc.io` |
| تستنت Arc | `5042002` (`0x4cef52`) | `rpc.testnet.arc.io` | `explorer.testnet.arc.io` |

اگر شبکهی کیف پول با شبکهی درخواست یکسان نباشد، خودش یک هشدار است.

## مدل امنیت و حریم خصوصی

- مجوزهای اکستنشن: `storage` + `activeTab` + `scripting` فقط.
- دسترسیِ میزبان **فقط** RPCهای خود Arc — هیچ `<all_urls>` در کار نیست.
- هاستهای AI **اختیاری**اند و فقط موقع ذخیرهی کلید، با اخطار کروم، یکبار درخواست میشوند.
- هیچجایی: کلید خصوصی، عبارت بازیابی، کد از راه دور، بکاند، آنالیتیکس، تله متری.

## محدودیتهای شناختهشده (فهرست صادقانه)

1. قواعد رفتاریاند نه symbolic execution؛ کدِ ناشناس یعنی «ناشناس — محتاط باش».
2. **فقط هشدار، هرگز بلاک.** dApp میتواند در مسیرهایی مستقیم با کیف پول حرف بزند که همیشه
   قابل مشاهده نیست؛ گیتِ نهایی همیشه خودِ کیف پول (Confirm) است.
3. الگوهای جدید حمله به قاعدهی جدید نیاز دارند (قرتیبند این کار را تدریجی میکند).
4. تحلیل وضعیتِ لحظهی درخواست است؛ تغییراتِ بعدی (جابهجایی allowance) همان لحظه بازسنجی
   نمیشود.
5. AI فقط بازنویسی میکند؛ تشخیص قطعی است و با AI یا بدون آن یکسان.
6. آمادهی استور نیست (آیکون، امضای store، مرورگرهای دیگر، audit) — هنوز.
7. فقط جریانهای EOA؛ امضای smart-account/SDK در v1 نیست.
8. بررسی EOA-درمقابل-قرارداد تا زمان درخواست است؛ ممکن است قرارداد بعداً deploy شود.

## Troubleshooting

| مشکل | راهحل |
| --- | --- |
| اکستنشن بارگذاری نمیشود | پوشهی `dist-extension/` را انتخاب کن (همان که `manifest.json` داخلش است)؛ اول `npm run build:extension`. |
| صفحه سفید روی ۴۵۱۲۳ | سرورِ قدیمیِ باقیمانده روی پورت را بکش، دوباره `npm run hub`، هاردرفرش (Ctrl+Shift+R). |
| «No wallet found» | اپ فقط میخواند؛ دکمهی **Connect (read-only)** را بزن. |
| «— locked» | سایت به کیف پول متصل نیست؛ دکمهی Connect — اپ هیچوقت امضا نمیگیرد. |
| شبکه ✗ | کیف روی شبکهی دیگری غیر از Arc (تستنت 5042002 یا میننت 5042) است. |
| اکستنشن در سایتِ تصادفی فعال نیست | عمدی است؛ یکبار روی آیکن کلیک کن. |

## نقشهی راه

- v0.2: symbolic execution، بستهبندی استور، لیستِ سفیدِ گیرنده.
- v0.3: Rule packها، امضای smart-account، چندزبانهشدن.

## سؤالات پرتکرار

**اگر «فقط هشدار میدهد» چرا قابل اعتماد است؟** دقیقاً به همین دلیل: کارت عیب، دلیل و محدودیت
را شفاف مینویسد؛ تصمیم نهایی همیشه با تو و کیف پولت است. بدون سرور، بدون حساب، بدون کلید.

## مجوز

[MIT](./LICENSE) © 2026 — مشارکتکنندگان Arc Lens.