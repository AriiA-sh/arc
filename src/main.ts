import './style.css'
import { mountApp } from './web/app'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header class="hero">
      <h1>ARC LENS</h1>
      <p class="tagline">Understand <span class="sep">→</span> Warn <span class="sep">→</span> Explain</p>
      <p class="sub">Paste an Arc Testnet transaction hash or raw calldata. No wallet needed.</p>
    </header>
    <div id="tool"></div>
  </main>
`

mountApp(document.querySelector<HTMLDivElement>('#tool')!)