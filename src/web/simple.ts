import { analyzeCalldata, analyzeHash } from './analyze'
import { currentChain, setAnalysisChain } from '../arc/client'
import { connectWallet, detectWallet, getWindowProvider } from '../core/wallet/detect'
import { showOverlay } from '../extension/content/overlay'
import { newUid } from '../extension/channel'
import type { Analysis } from './analyze'
import type { RiskFinding } from '../core/risk/types'
import type { RiskSummary } from '../extension/channel'

const F = {
  severe: 'Dangerous',
  warning: 'Be careful',
  info: 'Note',
  safe: 'Looks normal',
}

const PLAIN_FINDING: Record<string, string> = {
  'unlimited-approval': 'This transaction grants an UNLIMITED allowance. The recipient can move any amount of your tokens whenever they want, until you revoke it.',
  'approve-to-eoa': 'The target address is a plain wallet, not a contract. Granting a plain wallet permission to pull your funds is unusual.',
  'approve-zero-or-burn': 'The allowance is zero or targets a "burned" address — usually useless or a red flag.',
  'approve-to-self': 'You are approving your own wallet — usually pointless.',
  'zero-value-native': 'The transfer sends zero USDC/coins — double-check your intent.',
  'contract-call-no-abi': 'Unrecognized contract code. We cannot say exactly what it does — be extra careful.',
  'transfer-from-signer': 'This transaction pulls funds FROM your wallet — a contract spends on your behalf.',
  'unexpected-network': 'The network your wallet is on does not match the network this transaction targets.',
}

const escc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmtAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

function actionLabel(human: string): string {
  if (human.startsWith('Approve ')) return `Allow withdrawal of "${human.slice(8)}"`
  if (human.startsWith('Send ')) return `Send "${human.slice(5)}" from your wallet`
  if (human.startsWith('Pull ')) return `Approved pull of "${human.slice(5)}" (transferFrom) by a contract`
  if (human === 'Send USDC (native)') return 'Send USDC to an address'
  if (human === 'Contract creation') return 'Create a new contract'
  if (human.includes('Contract call')) return 'Call a contract'
  if (human === 'Undecodable') return 'This code cannot be decoded'
  return human
}

function plainSentence(f: RiskFinding): string {
  return PLAIN_FINDING[f.id] ?? `${escc(f.rule)} — ${escc(f.reason)}`
}

function severityOf(findings: RiskFinding[]): 'severe' | 'warning' | 'safe' {
  if (findings.some((f) => f.severity === 'severe')) return 'severe'
  if (findings.some((f) => f.severity === 'warning')) return 'warning'
  return 'safe'
}

function verdictLine(sev: 'severe' | 'warning' | 'safe'): string {
  if (sev === 'severe')
    return 'This transaction looks dangerous. If you are not 100% sure, do not sign.'
  if (sev === 'warning') return 'This transaction has points worth noticing. Look at it once more, carefully.'
  return 'No obvious risk found. Still — you are always the final check.'
}

function renderPlainResult(a: Analysis): string {
  const sev = severityOf(a.findings)
  const warnings = a.findings.filter((f) => f.severity === 'warning' || f.severity === 'severe')
  const notes = a.findings.filter((f) => f.severity === 'info')
  const explorer = a.hash ? `<a class="al-link" href="${currentChain().blockExplorers.default.url}/tx/${escc(a.hash)}" target="_blank" rel="noreferrer">Open in explorer ↗</a>` : ''
  return `
  <div class="al-res al-${sev}">
    <div class="al-res-verdict">${verdictLine(sev)}</div>
    <div class="al-res-act">${actionLabel(a.decoded.human)}</div>
    ${a.decoded.to ? `<div class="al-res-to">To address: <code>${escc(a.decoded.to)}</code></div>` : ''}
    ${explorer}
    ${warnings.length ? `<ul class="al-plain">${warnings.map((f) => `<li><b class="al-b-${f.severity}">${F[f.severity]}</b> ${plainSentence(f)}</li>`).join('')}</ul>` : ''}
    ${notes.length ? `<ul class="al-notes">${notes.map((f) => `<li>${plainSentence(f)}</li>`).join('')}</ul>` : ''}
  </div>`
}

export function mountUnified(root: HTMLElement): void {
  root.innerHTML = `
  <style>
    #al { max-width: 760px; margin: 0 auto; padding: 0 1rem 3rem; }
    .al-hero { text-align: center; padding: 2.2rem 0 1.2rem; }
    .al-logo { font-size: 1.9rem; font-weight: 800; letter-spacing: .22em; }
    .al-logo span { color: var(--severe); }
    .al-tag { color: var(--info); font-size: .9rem; letter-spacing: .05em; margin: .3rem 0; }
    .al-oneshot { color: var(--muted); font-size: .95rem; line-height: 1.8; margin: .6rem auto 0; max-width: 560px; }
    .al-card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 1.1rem 1.2rem; margin-top: 1.1rem; }
    .al-step { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #04121f; font-weight: 800; font-size: .8rem; margin-right: .45rem; vertical-align: middle; }
    .al-card h2 { display: inline; font-size: 1.05rem; margin: 0; }
    .al-hint { color: var(--muted); font-size: .82rem; margin: .35rem 0 .7rem; line-height: 1.6; }
    .al-wallet { display: flex; align-items: center; gap: .7rem; flex-wrap: wrap; font-size: .85rem; }
    .al-wallet .ok { color: var(--info); }
    .al-wallet .bad { color: var(--severe); }
    textarea, .al-inputs input { width: 100%; background: #0d1016; border: 1px solid var(--line); border-radius: 10px; color: var(--fg); padding: .65rem .75rem; font: inherit; }
    .al-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; margin: .6rem 0; }
    @media (max-width: 560px) { .al-inputs { grid-template-columns: 1fr; } }
    .al-btn { background: var(--accent); color: #04121f; border: 0; border-radius: 10px; font-weight: 700; padding: .6rem 1.3rem; cursor: pointer; font-size: .9rem; }
    .al-btn:disabled { opacity: .5; cursor: progress; }
    .al-res { margin-top: .8rem; padding: .85rem 1rem; border-radius: 12px; border: 1px solid; font-size: .88rem; line-height: 1.7; }
    .al-severe { border-color: rgba(229,72,77,.55); background: rgba(229,72,77,.08); }
    .al-warning { border-color: rgba(242,163,60,.4); background: rgba(242,163,60,.07); }
    .al-safe { border-color: rgba(63,185,80,.4); background: rgba(63,185,80,.06); }
    .al-res-verdict { font-weight: 700; font-size: 1rem; margin-bottom: .3rem; }
    .al-res-act { font-size: .95rem; }
    .al-plain { margin: .5rem 0 0; padding-right: 0; list-style: none; }
    .al-plain li { border-top: 1px solid rgba(255,255,255,.06); padding: .45rem 0; }
    .al-b-severe { color: var(--severe); }
    .al-b-warning { color: var(--warn); }
    .al-notes { margin: .4rem 0 0; color: var(--muted); font-size: .8rem; }
    .al-link { color: var(--accent); }
    .al-dapp { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .al-dapp-head { background: #12161f; padding: .55rem .8rem; font-size: .8rem; color: #c9d3e0; display: flex; justify-content: space-between; }
    .al-dapp-body { padding: .8rem; display: grid; gap: .6rem; }
    .al-dapp-body select { background: #0d1016; border: 1px solid var(--line); color: var(--fg); padding: .45rem .5rem; border-radius: 8px; }
    .al-rows { display: flex; gap: .6rem; flex-wrap: wrap; }
    .al-install ol { margin: .4rem 0 0; padding-right: 1.2rem; line-height: 1.9; font-size: .86rem; }
    .al-foot { color: var(--muted); font-size: .75rem; text-align: center; margin-top: 2rem; line-height: 1.7; }
    .al-note { font-size: .78rem; color: var(--muted); }
  </style>

  <div id="al">
    <header class="al-hero">
      <div class="al-logo">ARC <span>LENS</span></div>
      <p class="al-tag">UNDERSTAND → WARN → EXPLAIN</p>
      <p class="al-oneshot">
        Before you sign, understand what you are signing. The transaction is decoded into plain
        language on your own machine, and if there is a risk — or a trick where the page
        displays one thing but the signature says another — you are told before you commit.
      </p>
    </header>

    <section class="al-card">
      <div class="al-wallet" id="al-wallet">Checking wallet…</div>
    </section>

    <section class="al-card">
      <span class="al-step">1</span><h2>Paste a transaction to analyze</h2>
      <p class="al-hint">Paste a tx hash from the explorer (0x + 64 characters) or raw calldata — Arc Lens figures out which one it is. Works without a wallet too.</p>
      <textarea id="al-input" rows="2" spellcheck="false" placeholder="0x673beaaf…"></textarea>
      <div class="al-inputs">
        <input id="al-to" type="text" placeholder="Contract address (only for calldata)" />
        <input id="al-value" type="text" placeholder="Value — optional" />
      </div>
      <button class="al-btn" id="al-analyze">Analyze</button>
      <div id="al-result"></div>
    </section>

    <section class="al-card">
      <span class="al-step">2</span><h2>Demo: what you would see before signing</h2>
      <p class="al-hint">The exact same thing the extension does on real Arc sites, right here. Pick a scene and hit Simulate.</p>
      <div class="al-dapp">
        <div class="al-dapp-head"><span>SwapDex (demo site)</span><span class="al-note">Simulator</span></div>
        <div class="al-dapp-body">
          <select id="al-scene">
            <option value="risky">The site displays one address but the signature targets another</option>
            <option value="unlimited">Unlimited approval (the biggest common risk)</option>
            <option value="ok">A normal transaction</option>
          </select>
          <div class="al-rows">
            <button class="al-btn" id="al-demo">Simulate</button>
            <button class="al-btn" id="al-dismiss" style="background:var(--panel);color:var(--muted);border:1px solid var(--line)">Close card</button>
          </div>
        </div>
      </div>
    </section>

    <section class="al-card">
      <span class="al-step">3</span><h2>Install the extension (optional)</h2>
      <p class="al-hint">This same demo runs automatically on real Arc sites, before every signature.</p>
      <ol>
        <li>Open <code>chrome://extensions</code> in Chrome and turn on "Developer mode" (top-right).</li>
        <li>Click "Load unpacked" and select the <code>dist-extension</code> folder.</li>
        <li>Open an Arc site and request a signature — the warning appears before you sign.</li>
      </ol>
      <p class="al-note"><a class="al-link" href="https://explorer.testnet.arc.io" target="_blank">Testnet explorer</a> · <a class="al-link" href="https://explorer.arc.io" target="_blank">Mainnet explorer</a> · <a class="al-link" href="https://arc.io" target="_blank">Testnet faucet (USDC)</a></p>
    </section>

    <p class="al-foot">All analysis runs against Arc's real network, on your own machine. Private keys and seed phrases are never requested.<br>
    <span class="al-note">Developer tools: <a class="al-link" href="/harness.html" target="_blank">dApp simulator</a> · <a class="al-link" href="/demo/" target="_blank">Screenshot scene</a></span></p>
  </div>
  `

  const walletEl = root.querySelector<HTMLDivElement>('#al-wallet')!
  const input = root.querySelector<HTMLTextAreaElement>('#al-input')!
  const toInput = root.querySelector<HTMLInputElement>('#al-to')!
  const valueInput = root.querySelector<HTMLInputElement>('#al-value')!
  const result = root.querySelector<HTMLDivElement>('#al-result')!
  const analyzeBtn = root.querySelector<HTMLButtonElement>('#al-analyze')!
  const scene = root.querySelector<HTMLSelectElement>('#al-scene')!
  const demoBtn = root.querySelector<HTMLButtonElement>('#al-demo')!
  const dismissBtn = root.querySelector<HTMLButtonElement>('#al-dismiss')!

  const renderWalletBox = (w: Awaited<ReturnType<typeof detectWallet>>) => {
    setAnalysisChain(w.onArcMainnet ? 5042 : 5042002)
    const onArc = w.onArcTestnet || w.onArcMainnet
    if (!w.detected) {
      walletEl.innerHTML = `<span>No wallet found — that's fine, you can still analyze.</span>`
      return
    }
    const net = `<span class="${onArc ? 'ok' : 'bad'}">${w.networkLabel ?? 'other network'}${onArc ? ' ✓' : ' ✗'}</span>`
    const addr = w.account ? `<code>${fmtAddr(w.account)}</code>` : `<span>— locked</span>`
    walletEl.innerHTML =
      `${w.detected ? `<span>Wallet: <b>${w.providerName}</b></span>` : ''}` +
      `<span>Network: ${net}</span>` +
      `<span>Address: ${addr}</span>` +
      (w.detected && !w.account
        ? `<button class="al-btn" id="al-connect" style="font-size:.75rem;padding:.35rem .7rem">Connect (read-only)</button>`
        : '')
    const connectBtn = root.querySelector<HTMLButtonElement>('#al-connect')
    connectBtn?.addEventListener('click', async () => {
      connectBtn.disabled = true
      connectBtn.textContent = '…waiting for wallet'
      try {
        renderWalletBox(await connectWallet())
      } catch {
        renderWalletBox(await detectWallet())
      }
    })
  }

  const refreshWallet = () => detectWallet().then(renderWalletBox).catch(() => renderWalletBox({ detected: false, onArcTestnet: false }))
  refreshWallet()
  getWindowProvider()?.on?.('accountsChanged', refreshWallet)
  getWindowProvider()?.on?.('chainChanged', refreshWallet)

  analyzeBtn.addEventListener('click', async () => {
    const raw = input.value.trim()
    if (!raw) return
    analyzeBtn.disabled = true
    analyzeBtn.textContent = '…analyzing'
    result.innerHTML = `<div class="al-note">Reading from Arc's real network…</div>`
    try {
      const out = /^0x[0-9a-fA-F]{64}$/.test(raw)
        ? await analyzeHash(raw)
        : /^0x[0-9a-fA-F]+$/.test(raw)
          ? await analyzeCalldata(raw, toInput.value.trim() || undefined, valueInput.value.trim() || '0')
          : (() => { throw new Error('Enter a tx hash (0x + 64 characters) or 0x… calldata') })()
      result.innerHTML = renderPlainResult(out)
    } catch (e) {
      result.innerHTML = `<div class="al-res al-severe"><b>Failed:</b> ${escc((e as Error).message)}</div>`
    } finally {
      analyzeBtn.disabled = false
      analyzeBtn.textContent = 'Analyze'
    }
  })

  const MODE_DISPLAYED = '0xdead00000000deadbeefdeadbeefdeadbeefdeadbeef'
  const MODE_SIGNED = '0x13acacacacacacacacacacacacacacacacacacac'

  const SCENES: Record<string, { human: string; txTo: string; findings: Array<{ severity: string; rule: string; reason: string; evidence: string; limitation: string }> }> = {
    risky: {
      human: 'Approve USDC',
      txTo: MODE_SIGNED,
      findings: [
        { severity: 'severe', rule: 'Unlimited approval', reason: 'The spender can move any amount of your USDC forever.', evidence: 'amount = max uint256', limitation: 'Not yet checked for existing allowances.' },
        { severity: 'warning', rule: 'Destination is an EOA', reason: 'A plain wallet (not a contract) is being approved to pull funds.', evidence: `to = ${MODE_SIGNED}`, limitation: 'EOA check was done on Arc testnet.' },
      ],
    },
    unlimited: {
      human: 'Approve USDC',
      txTo: '0x178c1d0e89f2ec48e94ef9ee990bd0a9eefc9b2b',
      findings: [
        { severity: 'severe', rule: 'Unlimited approval', reason: 'The spender can move any amount of your USDC forever.', evidence: 'amount = max uint256', limitation: 'Not yet checked for existing allowances.' },
      ],
    },
    ok: {
      human: 'Send USDC',
      txTo: '0x1111111111111111111111111111111111111111',
      findings: [],
    },
  }

  const dappHead = root.querySelector<HTMLDivElement>('.al-dapp-head')!

  demoBtn.addEventListener('click', () => {
    result.innerHTML = ''
    const s = SCENES[scene.value]
    const title = document.createElement('span')
    title.textContent = 'SwapDex (demo site)'
    const dest = document.createElement('span')
    dest.classList.add('al-note')
    if (scene.value === 'risky') dest.textContent = `Deliver to: ${MODE_DISPLAYED}` // page shows THIS…
    else dest.textContent = `Deliver to: ${s.txTo}`
    // show the destination twice — the same heuristic the real extension uses
    const dest2 = dest.cloneNode(true) as HTMLElement
    dappHead.replaceChildren(title, dest, dest2)

    const summary: RiskSummary = {
      uid: newUid(),
      human: s.human,
      kind: 'erc20_approve',
      severity: s.findings.length ? 'severe' : 'safe',
      highlights: s.findings.map((f) => f.rule),
      count: s.findings.filter((f) => f.severity !== 'info').length,
      findings: s.findings,
      to: s.txTo,
    }
    showOverlay({ summary, txTo: s.txTo })
  })

  dismissBtn.addEventListener('click', () => {
    document.getElementById('arc-lens-overlay')?.remove()
    const head = root.querySelector<HTMLDivElement>('.al-dapp-head')
    if (head) head.innerHTML = `<span>SwapDex (demo site)</span><span class="al-note">Simulator</span>`
  })
}