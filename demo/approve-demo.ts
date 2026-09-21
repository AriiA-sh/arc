/// Standalone screenshot demo (for X / docs). Uses the REAL overlay code.
///
/// Renders a fake "Approve USDC" dApp card whose on-screen spender address
/// differs from the address the wallet is being asked to approve to — so the
/// screenshot shows BOTH headline features at once:
///   - SEVERE card (BEFORE YOU SIGN)
///   - ⚠ Displayed vs Signed mismatch box
///
/// Build:  npm run demo:screenshot
/// Serve:  npx serve demo  ->  open demo/approve-demo.html
import { showOverlay } from '../src/extension/content/overlay'
import type { RiskSummary } from '../src/extension/channel'

const SPENDER_SHOWN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // what the UI displays
const SPENDER_SIGNED = '0x1111111111111111111111111111111111111111' // what the tx actually targets

document.body.innerHTML = `
<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0e1117">
  <div style="width:380px;background:#fff;border-radius:16px;padding:22px;font-family:Inter,system-ui,sans-serif;color:#0b0e13">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:34px;height:34px;border-radius:50%;background:#2775ca;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">A</div>
      <div><b style="font-size:15px">ArcSwap</b><div style="font-size:11px;color:#6a7282">Testnet · arcswap.example</div></div>
    </div>
    <h2 style="margin:18px 0 4px;font-size:17px">Approve USDC</h2>
    <div style="font-size:12px;color:#6a7282">Allow <b>ArcSwap Router</b> to spend your USDC.</div>
    <div style="margin-top:14px;background:#f4f6f9;border-radius:12px;padding:12px">
      <div style="font-size:11px;color:#6a7282">Spender contract</div>
      <div style="font-family:ui-monospace,monospace;font-size:12.5px;color:#0b0e13;margin-top:3px;word-break:break-all">${SPENDER_SHOWN}</div>
    </div>
    <div style="margin-top:10px;background:#f4f6f9;border-radius:12px;padding:12px">
      <div style="font-size:11px;color:#6a7282">Max approval</div>
      <div style="font-size:13px;font-weight:600;margin-top:3px">Unlimited</div>
    </div>
    <button id="demo-confirm" style="margin-top:16px;width:100%;padding:12px;border:0;border-radius:12px;background:#2775ca;color:#fff;font-weight:700;font-size:14px;cursor:pointer">Approve</button>
  </div>
</div>`

document.getElementById('demo-confirm')!.addEventListener('click', () => {
  const summary: RiskSummary = {
    uid: 'arcl-demo0000-00000',
    human: 'Approve token',
    kind: 'erc20_approve',
    severity: 'severe',
    count: 2,
    highlights: ['Unlimited approval', 'Approval to a plain account'],
    to: SPENDER_SIGNED,
    value: '0',
    findings: [
      {
        id: 'unlimited-approval',
        severity: 'warning',
        rule: 'Unlimited approval',
        reason: 'This approval may allow 0x1111…1111 to spend your token later.',
        evidence: 'allowance set to uint256 max (2^256-1)',
        limitation: 'Arc Lens cannot know whether the spender intends to use the full allowance.',
      },
      {
        id: 'approve-to-eoa',
        severity: 'severe',
        rule: 'Approval to a plain account',
        reason: 'The page calls it a “contract”, but the target has no contract code (it is a plain wallet).',
        evidence: 'getCode(0x1111…1111) returned 0x on chain',
        limitation: 'An EOA spender could be a legitimate recipient in some flows; assess manually.',
      },
    ],
  }
  showOverlay({ summary, txTo: SPENDER_SIGNED })
})