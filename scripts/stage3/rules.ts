import { encodeFunctionData } from 'viem'
import { erc20Abi, MAX_UINT256 } from '../../src/core/decoder/abis'
import { decodeTx } from '../../src/core/decoder/decoder'
import { runRiskEngine } from '../../src/core/risk/engine'
import type { DecodedAction } from '../../src/core/decoder/types'

const TOKEN = '0x1111111111111111111111111111111111111111'
const SIGNER = '0x2222222222222222222222222222222222222222'
const RECIPIENT = '0x4444444444444444444444444444444444444444'
const SPENDER_CONTRACT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SPENDER_EOA = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const ZERO = '0x0000000000000000000000000000000000000000'

const tokenMeta = { name: 'USD Coin', symbol: 'USDC', decimals: 6 }

function fn(name: 'transfer' | 'approve' | 'transferFrom', args: readonly unknown[]) {
  const abiItem = erc20Abi.find((it) => it.type === 'function' && it.name === name)! as any
  return encodeFunctionData({ abi: [abiItem] as any, functionName: name, args: args as any })
}

type Expect = { id: string; severity?: string; present?: boolean }
type Case = { label: string; tx: Record<string, unknown>; expect: Expect[] }

const codeMap = new Map<string, string>([
  [TOKEN, '0x60fe6000'],
  [SPENDER_CONTRACT, '0x60006000'],
  [SPENDER_EOA, '0x'],
])
const hasCode = async (a: string) => {
  const c = codeMap.get(a.toLowerCase()) ?? '0x'
  return c !== '0x'
}

const ctx = { chainId: 5042002, from: SIGNER, hasCode }

const cases: Case[] = [
  {
    label: 'positive: unlimited approve to contract spender',
    tx: { to: TOKEN, from: SIGNER, value: 0n, data: fn('approve', [SPENDER_CONTRACT, MAX_UINT256]) },
    expect: [{ id: 'unlimited-approval', severity: 'warning' }],
  },
  {
    label: 'negative: finite approve to contract spender',
    tx: { to: TOKEN, from: SIGNER, value: 0n, data: fn('approve', [SPENDER_CONTRACT, 10000n]) },
    expect: [{ id: 'unlimited-approval', present: false }, { id: 'approve-to-eoa', present: false }],
  },
  {
    label: 'edge: finite approve to EOA spender',
    tx: { to: TOKEN, from: SIGNER, value: 0n, data: fn('approve', [SPENDER_EOA, 5n]) },
    expect: [{ id: 'approve-to-eoa', severity: 'warning' }],
  },
  {
    label: 'edge: unlimited approve to EOA spender',
    tx: { to: TOKEN, from: SIGNER, value: 0n, data: fn('approve', [SPENDER_EOA, MAX_UINT256]) },
    expect: [{ id: 'approve-to-eoa', severity: 'severe' }],
  },
  {
    label: 'positive: approve to zero address',
    tx: { to: TOKEN, from: SIGNER, value: 0n, data: fn('approve', [ZERO, 0n]) },
    expect: [{ id: 'approve-zero-or-burn' }],
  },
  {
    label: 'positive: approve to self (info)',
    tx: { to: TOKEN, from: SIGNER, value: 0n, data: fn('approve', [SIGNER, 10n]) },
    expect: [{ id: 'approve-to-self', severity: 'info' }],
  },
  {
    label: 'positive: zero-value native call',
    tx: { to: SPENDER_CONTRACT, value: 0n, data: '0x' },
    expect: [{ id: 'zero-value-native' }],
  },
  {
    label: 'negative: native transfer with value',
    tx: { to: RECIPIENT, value: 1000000n, data: '0x' },
    expect: [{ id: 'zero-value-native', present: false }],
  },
  {
    label: 'edge: transferFrom pulls from signer (agent flow, same operator)',
    tx: { to: TOKEN, from: SIGNER, value: 0n, data: fn('transferFrom', [SIGNER, RECIPIENT, 7n]) },
    expect: [{ id: 'transfer-from-signer', severity: 'info' }],
  },
  {
    label: 'positive: unknown contract call flagged info',
    tx: { to: '0x9999999999999999999999999999999999999999', value: 0n, data: '0x12345678' + '00'.repeat(64) },
    expect: [{ id: 'contract-call-no-abi' }],
  },
]

const found = (res: Awaited<ReturnType<typeof runRiskEngine>>, id: string) => res.find((f) => f.id === id)

async function main() {
  let pass = 0
  let fail = 0
  for (const c of cases) {
    const decoded: DecodedAction = await decodeTx({ ...c.tx } as any, { fetchTokenMeta: async () => tokenMeta })
    const res = await runRiskEngine(decoded, ctx)
    const checks = c.expect
      .map((ex) => {
        const f = found(res, ex.id)
        if (ex.present === false) return f ? `unexpected ${ex.id}` : null
        if (!f) return `missing ${ex.id}`
        if (ex.severity && f.severity !== ex.severity) return `${ex.id} severity=${f.severity} want ${ex.severity}`
        return null
      })
      .filter(Boolean) as string[]
    const ok = checks.length === 0
    if (ok) pass++
    else fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.label}`)
    if (!ok) for (const msg of checks) console.log(`      ✗ ${msg}`)
    for (const f of res) console.log(`      [${f.severity}] ${f.rule} — ${f.reason}`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})