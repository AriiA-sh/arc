import { JSDOM } from 'jsdom'
import { runMismatchCheck, detectDisplayedAddress, displayedLabel } from '../../src/extension/content/mismatch'
import { showOverlay } from '../../src/extension/content/overlay'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
const { window } = dom
for (const key of ['document', 'window', 'HTMLElement', 'Element', 'Node', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true })
}
globalThis.MutationObserver = window.MutationObserver
globalThis.customElements = window.customElements

function makeDoc(markup: string): { body: HTMLElement; cleanup: () => void } {
  const body = document.createElement('body')
  body.innerHTML = markup
  document.querySelector('html')!.replaceChildren(body)
  return { body, cleanup: () => {} }
}

const SHOWN_ADDR = '0x' + 'DdDd'.repeat(10)
const SIGNED_ADDR = '0x' + '9'.repeat(40)

const REAL_PAGE = `
  <h1>ArcSwap</h1>
  <div class="swap">
    <span>Swap on</span>
    <span class="pool-addr">Pool Owner: ${SHOWN_ADDR}</span>
    <button>Approve</button>
  </div>
  <footer>v1.2</footer>
`

const results: Record<string, boolean> = {}

// Case 1: page shows address that matches requested `to` → no mismatch
{
  const holder = makeDoc(REAL_PAGE)
  results['matching-address-no-mismatch'] = !runMismatchCheck(document.body, SHOWN_ADDR).detected
}
// Case 2: page shows address A, wallet signs to B → mismatch severe
{
  const holder = makeDoc(REAL_PAGE)
  const m = runMismatchCheck(document.body, SIGNED_ADDR)
  results['different-address-detected'] = m.detected
  results['signed-address-captured'] = m.signedAddress === SIGNED_ADDR
  results['shown-address-captured'] = (m.shownAddress ?? '').toLowerCase() === SHOWN_ADDR.toLowerCase()
}
// Case 3: DOM detection of the displayed address works
{
  const holder = makeDoc(REAL_PAGE)
  const shown = detectDisplayedAddress(document.body)
  results['shown-detected'] = (shown ?? '').toLowerCase() === SHOWN_ADDR.toLowerCase()
  results['label-found'] = (displayedLabel(document.body, shown ?? '') ?? '').includes('Pool Owner')
}
// Case 4: no displayed address at all (opaque page) → no mismatch flagged
{
  const holder = makeDoc('<h1>App</h1><div class="row">Sign in to continue</div>')
  results['no-address-no-mismatch'] = runMismatchCheck(document.body, SIGNED_ADDR).detected === false
}

// Case 5: overlay renders with mismatch — verify DOM structure in shadow root
{
  const holder = makeDoc(REAL_PAGE)
  const sampleFindings = [
    { id: 'unlimited-approval', severity: 'warning', rule: 'Unlimited approval', reason: 'This approval may allow the spender to use your USDC later.', evidence: 'max uint', limitation: 'x' },
  ]
  showOverlay({
    summary: {
      uid: 'abc-123',
      human: 'Approve USDC',
      kind: 'erc20_approve',
      severity: 'warning',
      highlights: ['Unlimited approval'],
      count: 1,
      findings: sampleFindings,
      to: SIGNED_ADDR,
      value: '0',
    },
    txTo: SIGNED_ADDR,
  })
  const host = document.getElementById('arc-lens-overlay')
  results['overlay-mounted'] = !!host && host.shadowRoot !== null
  if (host?.shadowRoot) {
    results['overlay-badge-severe'] = host.shadowRoot.querySelector('.arc-badge')?.textContent?.includes('SEVERE') ?? false
    results['overlay-mismatch-shown'] = !(host.shadowRoot.querySelector('.arc-mismatch') as HTMLDivElement)?.hidden
    results['overlay-action'] = host.shadowRoot.querySelector('.arc-action')?.textContent === 'Approve USDC'
    results['overlay-warning-render'] = host.shadowRoot.querySelector('.arc-warn')?.textContent?.includes('Unlimited approval') ?? false
  }
}

console.log(JSON.stringify(results, null, 2))
const pass = Object.values(results).every(Boolean)
process.exit(pass ? 0 : 1)