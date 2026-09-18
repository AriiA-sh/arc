/**
 * Stage 7 end-to-end browser verification.
 *
 * Loads the built extension (dist-extension) into a real (headed) Chromium
 * and walks the full pipeline against the harness page:
 *   dApp click → injected proxy → TX_CAPTURED → content → background
 *   → decode/risk (live testnet RPC) → RISK_RESULT → overlay (+ mismatch).
 *
 * Resolution: patchright will be located from the dscodegpt VSCode ext that
 * bundles a Chromium build; if unavailable the script exits with SKIP.
 * Usage: node scripts/stage7/browser-e2e.mjs ['?display=1']
 */
import { createRequire } from 'node:module'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, extname } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const path = req.url === '/' ? 'harness.html' : decodeURIComponent(req.url.split('?')[0])
  const file = join('D:/script/arc/extension/test', path)
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(45123, r))

function resolveChromium() {
  const bases = ['C:\\Users\\user\\.vscode\\extensions', process.env.LOCALAPPDATA + '\\extensions']
  for (const base of bases) {
    if (!existsSync(base)) continue
    const dirs = readdirSync(base).filter((d) => d.startsWith('danielsanmedium.dscodegpt-'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    const newest = dirs[dirs.length - 1]
    if (newest) {
      const root = join(base, newest, 'standalone') + '/'
      try {
        const mod = createRequire(root)('patchright')
        const chromium = mod?.chromium ?? mod?.default?.chromium
        if (chromium) return { chromium }
      } catch {}
    }
  }
  return null
}

const resolved = resolveChromium()
if (!resolved) {
  console.log('SKIP: patchright/Chromium not found on this machine')
  server.close()
  process.exit(0)
}
const { chromium } = resolved
const EXT = 'D:/script/arc/dist-extension'
const userData = mkdtempSync(join(tmpdir(), 'arc-lens-e2e-'))

const ctx = await chromium.launchPersistentContext(userData, {
  headless: false,
  channel: 'chromium',
  args: ['--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
for (let i = 0; i < 40 && ctx.serviceWorkers().length === 0; i++) await new Promise((r) => setTimeout(r, 250))
if (ctx.serviceWorkers().length === 0) {
  console.log('FAIL: extension service worker never registered')
  process.exit(1)
}

const page = await ctx.newPage()
const out = { injected: null, proxy: null, riskSummary: null, walletSigned: null, overlay: null, walletStatus: null, errors: [] }
page.on('console', (m) => { if (m.type() === 'error') out.errors.push(m.text()) })
page.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message))

const displayParam = process.argv[2] ?? ''
await page.goto(`http://127.0.0.1:45123/harness.html${displayParam}`, { timeout: 20000 })
try {
  await page.waitForFunction(() => document.getElementById('wallet')?.dataset.status === 'ready', null, { timeout: 15000 })
} catch (e) { out.errors.push('ready-wait: ' + e.message) }

// probe the page MAIN world through a real <script> tag (patchright's
// page.evaluate runs in its own world here and can't read page globals)
await page.evaluate(() => {
  const s = document.createElement('script')
  s.textContent = `(function(){ document.documentElement.setAttribute('data-pw-injected', window.__arcLensInjected === true ? 'yes' : 'no'); document.documentElement.setAttribute('data-pw-proxy', !!(window.ethereum && window.ethereum.isArcLensProxy) ? 'yes' : 'no'); })();`
  document.head.appendChild(s)
})
out.injected = await page.evaluate(() => document.documentElement.getAttribute('data-pw-injected'))
out.proxy = await page.evaluate(() => document.documentElement.getAttribute('data-pw-proxy'))

if (out.proxy === 'yes') {
  await page.click('#sign')
  try {
    await page.waitForFunction(() => document.getElementById('risk')?.textContent.length > 0, null, { timeout: 45000 })
  } catch (e) { out.errors.push('risk-wait: ' + e.message) }
  out.riskSummary = await page.evaluate(() => document.getElementById('risk').textContent || null)
  out.walletSigned = await page.evaluate(() => document.getElementById('result').textContent || null)
  out.walletStatus = await page.evaluate(() => document.getElementById('wallet')?.dataset?.status ?? null)
  out.overlay = await page.evaluate(() => {
    const host = document.getElementById('arc-lens-overlay')
    const sr = host?.shadowRoot
    return {
      mounted: !!host,
      badge: sr?.querySelector('.arc-badge')?.textContent ?? null,
      action: sr?.querySelector('.arc-action')?.textContent ?? null,
      mismatchHidden: sr?.querySelector('.arc-mismatch')?.hidden ?? null,
      mismatchText: sr?.querySelector('.arc-mismatch')?.textContent?.slice(0, 110) ?? null,
      warnCount: sr?.querySelectorAll('.arc-warn').length ?? null,
    }
  })
}

console.log(JSON.stringify(out, null, 2))
await ctx.close()
server.close()

const pass =
  out.proxy === 'yes' &&
  out.overlay?.mounted === true &&
  !!out.riskSummary &&
  String(out.walletSigned).includes('signed')
process.exit(pass ? 0 : 1)