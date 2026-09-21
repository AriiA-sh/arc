/**
 * Stage 9 verification for the unpacked-extension bundle (load via
 * chrome://extensions → Load unpacked, or --load-extension in automation).
 *
 * Fails if: dist is missing, the manifest is invalid, or any file the
 * manifest references does not actually exist in the bundle.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist-extension')
const manifestPath = join(EXT, 'manifest.json')
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ← ' + extra}`)
  if (!cond) failures++
}

check('manifest.json exists', existsSync(manifestPath))
let manifest = null
  try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  check('manifest.json valid JSON', true)
} catch (e) {
  check('manifest.json valid JSON', false, String(e))
}

const required = ['background.js', 'injected.js', 'content.js', 'popup.js', 'settings.js', 'popup.html', 'settings.html']
for (const f of required) check(`bundle has ${f}`, existsSync(join(EXT, f)))

if (manifest) {
  check('manifest_version 3', manifest.manifest_version === 3, String(manifest.manifest_version))
  check('name/version set', !!manifest.name && !!manifest.version, `${manifest.name} ${manifest.version}`)
  check('background points at bundle', manifest.background?.service_worker === 'background.js', JSON.stringify(manifest.background))
  check('injected MAIN + content ISOLATED', manifest.content_scripts?.length === 2 && !manifest.content_scripts.some((cs) => !cs.world), JSON.stringify(manifest.content_scripts))
  check('NO <all_urls> host permission', !(manifest.host_permissions ?? []).includes('<all_urls>'), JSON.stringify(manifest.host_permissions))
  check('scripting + activeTab present (on-demand activation)', manifest.permissions?.includes('scripting') && manifest.permissions?.includes('activeTab'), JSON.stringify(manifest.permissions))
  check('only Arc RPCs in host_permissions', (manifest.host_permissions ?? []).every((h) => h.startsWith('https://rpc.')), JSON.stringify(manifest.host_permissions))
  check('AI hosts are OPTIONAL permissions', manifest.optional_host_permissions?.length === 3, JSON.stringify(manifest.optional_host_permissions))
  check('auto-inject restricted to Arc/localhost', manifest.content_scripts.every((cs) => cs.matches.every((m) => m.includes('arc.io') || m.includes('arc.network') || m.includes('127.0.0.1') || m.includes('localhost'))), JSON.stringify(manifest.content_scripts[0]?.matches))
  check('popup + options wired', manifest.action?.default_popup === 'popup.html' && manifest.options_ui?.page === 'settings.html', JSON.stringify(manifest.options_ui))
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)