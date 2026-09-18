import { build } from 'esbuild'
import { writeFile, mkdir, rm } from 'node:fs/promises'

const OUT = 'dist-extension'
const watch = process.argv.includes('--watch')

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const baseOptions = {
    bundle: true,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
    logLevel: 'warning',
  }

  const entries = [
    { in: 'src/extension/injected/main.ts', out: 'injected', format: 'iife' },
    { in: 'src/extension/content/content.ts', out: 'content', format: 'iife' },
    { in: 'src/extension/popup/main.ts', out: 'popup', format: 'iife' },
    { in: 'src/extension/settings/settings.ts', out: 'settings', format: 'iife' },
    { in: 'src/extension/background/background.ts', out: 'background', format: 'esm' },
  ]

  const results = await Promise.all(
    entries.map((e) =>
      build({
        ...baseOptions,
        entryPoints: [e.in],
        outfile: `${OUT}/${e.out}.js`,
        format: e.format,
        external: [],
      }),
    ),
  )
  if (watch) {
    console.log('watching…')
  } else {
    for (const [i, e] of entries.entries()) console.log(`built ${e.in} -> ${OUT}/${e.out}.js (${results[i].metafile ? 'ok' : 'ok'})`)
    await writeManifest()
  }
}

const manifest = {
  manifest_version: 3,
  name: 'Arc Lens',
  version: '0.1.0',
  description: 'Understand → Warn → Explain. Transaction intelligence for Arc at the moment of signing.',
  permissions: ['storage', 'activeTab'],
  host_permissions: ['<all_urls>'],
  background: { service_worker: 'background.js', type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['injected.js'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['<all_urls>'],
      js: ['content.js'],
      run_at: 'document_start',
      world: 'ISOLATED',
    },
  ],
  action: {
    default_popup: 'popup.html',
    default_title: 'Arc Lens',
  },
  options_ui: { page: 'settings.html', open_in_tab: true },
}

async function writeManifest() {
  await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2))
  await writeFile(`${OUT}/popup.html`, BUILTIN_POPUP_HTML)
  await writeFile(`${OUT}/settings.html`, BUILTIN_SETTINGS_HTML)
  console.log(`manifest + popup.html + settings.html written to ${OUT}/`)
}

const BUILTIN_POPUP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Arc Lens</title>
  <style>
    :root { color-scheme: dark; }
    body { width: 340px; margin: 0; background: #0b0e13; color: #e8eaed;
      font: 13px system-ui, sans-serif; padding: 14px; }
    h1 { font-size: 14px; letter-spacing: .25em; margin: 0 0 10px; color: #9fc3ff; }
    .muted { color: #9aa0a6; }
    .btn { display:block; width:100%; margin-top:12px; padding:8px; border:0;
      border-radius:8px; background:#4f8cff; color:#fff; font-weight:600; cursor:pointer; }
  </style>
</head>
<body>
  <h1>ARC LENS</h1>
  <div id="arc-popup-root" class="muted">Waiting…</div>
  <a class="btn" id="arc-open-settings" href="#">Settings</a>
  <script src="popup.js"></script>
</body>
</html>`

const BUILTIN_SETTINGS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Arc Lens — Settings</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #0b0e13; color: #e8eaed;
      font: 14px system-ui, sans-serif; padding: 20px; min-width: 380px; }
    h1 { color:#9fc3ff; letter-spacing:.2em; font-size:16px; }
    label { display:block; margin:14px 0 4px; color:#9aa0a6; }
    select,input { width:100%; box-sizing:border-box; padding:8px; border-radius:8px;
      border:1px solid #252b36; background:#0d1016; color:#e8eaed; }
    .note { color:#9aa0a6; font-size:12px; margin-top:6px; }
    .save { margin-top:16px; padding:9px; width:100%; border:0; border-radius:8px;
      background:#4f8cff; color:#fff; font-weight:600; cursor:pointer; }
  </style>
</head>
<body>
  <h1>ARC LENS · SETTINGS</h1>
  <label for="aiProvider">AI provider (optional — deterministic rules always run)</label>
  <select id="aiProvider">
    <option value="disabled">Disabled</option>
    <option value="gemini">Gemini</option>
    <option value="openai">OpenAI</option>
    <option value="anthropic">Anthropic</option>
  </select>
  <label for="apiKey">API key (stored only in your browser, sent only to your provider)</label>
  <input id="apiKey" type="password" placeholder="sk-…" autocomplete="off" />
  <label for="network">Network</label>
  <select id="network">
    <option value="testnet">Arc Testnet (5042002)</option>
    <option value="mainnet" disabled>Arc Mainnet (5042 — permissioned, unavailable)</option>
  </select>
  <label for="expectedChainId">Expected chain id</label>
  <input id="expectedChainId" type="number" value="5042002" />
  <div class="note">Arc Lens never stores private keys or seed phrases. Your API key is local to this browser.</div>
  <button class="save" id="save">Save</button>
  <div id="status"></div>
  <script src="settings.js"></script>
</body>
</html>`

main().catch((e) => {
  console.error(e)
  process.exit(1)
})