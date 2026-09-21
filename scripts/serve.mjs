import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, normalize, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)) // project root, ends with /
const PORT = 45123
const HOST = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

// url path → disk path relative to ROOT. Returns null if not allowed/exists.
function resolvePath(urlPath) {
  const u = new URL(urlPath, 'http://x')
  let p = u.pathname
  if (p === '/' || p === '/index.html') p = '/dist/index.html'
  else if (p.startsWith('/web')) {
    const rest = p.slice(4)
    p = '/dist' + (rest && rest !== '/' ? rest : '/index.html')
  }
  else if (p.startsWith('/assets') || p === '/favicon.svg' || p === '/vite.svg') p = '/dist' + p
  else if (p === '/demo' || p === '/demo/') p = '/demo/approve-demo.html'
  else if (p === '/harness.html') p = '/extension/test/harness.html'
  if (p.endsWith('/')) p += 'index.html'
  const norm = normalize(p).replace(/^([/\\])+/, '')
  if (norm.includes('..')) return null
  const abs = join(ROOT, norm)
  const rel = relative(ROOT, abs)
  if (rel.startsWith('..')) return null
  return abs
}

const server = createServer((req, res) => {
  const url = req.url ?? '/'

  if (url === '/__status') {
    const has = (f) => existsSync(join(ROOT, f))
    const body = {
      web: has('dist/index.html'),
      harness: has('extension/test/harness.html'),
      demo: has('demo/approve-demo.html') && has('demo/approve-demo.js'),
      extension: has('dist-extension/manifest.json'),
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
    return
  }

  const abs = resolvePath(url)
  if (!abs || !existsSync(abs)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('404 — not found on Arc Lens Hub')
    return
  }
  const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' })
  res.end(readFileSync(abs))
})

server.listen(PORT, HOST, () => {
  console.log(`\n  Arc Lens → http://${HOST}:${PORT}\n  (unified app; Ctrl+C to stop)\n`)
  console.log(
    [
      '  Dev/test extras on the same port:',
      '  /harness.html    dApp simulator (needs the extension loaded to see overlay)',
      '  /demo/           screenshot scene for X',
      '',
    ].join('\n'),
  )
})
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use — another Arc Lens Hub may already be running.`)
    console.error(`Open http://${HOST}:${PORT} in your browser.`)
  } else {
    console.error(e)
  }
})