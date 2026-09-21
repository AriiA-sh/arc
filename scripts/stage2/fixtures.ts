import { encodeFunctionData } from 'viem'
import { erc20Abi } from '../../src/core/decoder/abis'
import { decodeTx } from '../../src/core/decoder/decoder'
import { MAX_UINT256 } from '../../src/core/decoder/abis'

// Synthetic token contract we use as "to" in fixtures.
const TOKEN = '0x1111111111111111111111111111111111111111'
const FROM = '0x2222222222222222222222222222222222222222'
const TO = '0x3333333333333333333333333333333333333333'
const SPENDER = '0x4444444444444444444444444444444444444444'

const tokenMeta = { name: 'USD Coin (Testnet)', symbol: 'USDC', decimals: 6 }

function calldata(fn: 'transfer' | 'approve' | 'transferFrom', args: readonly unknown[]) {
  const abiItem = erc20Abi.find((it) => it.type === 'function' && it.name === fn)! as any
  return encodeFunctionData({ abi: [abiItem] as any, functionName: fn, args: args as any })
}

const cases: Array<{ label: string; tx: Parameters<typeof decodeTx>[0]; expectKind: string; expectHumanInclude: string; expectParamUnlimited?: boolean }> = [
  {
    label: 'ERC-20 approve unlimited',
    tx: { to: TOKEN, from: SPENDER, value: 0n, data: calldata('approve', [SPENDER, MAX_UINT256]) },
    expectKind: 'erc20_approve',
    expectHumanInclude: 'Approve USDC',
    expectParamUnlimited: true,
  },
  {
    label: 'ERC-20 approve finite',
    tx: { to: TOKEN, from: SPENDER, value: 0n, data: calldata('approve', [SPENDER, 1000n * 10n ** 6n]) },
    expectKind: 'erc20_approve',
    expectHumanInclude: 'Approve',
  },
  {
    label: 'ERC-20 transfer',
    tx: { to: TOKEN, from: FROM, value: 0n, data: calldata('transfer', [TO, 250n * 10n ** 6n]) },
    expectKind: 'erc20_transfer',
    expectHumanInclude: 'Send',
  },
  {
    label: 'ERC-20 transferFrom',
    tx: { to: TOKEN, from: SPENDER, value: 0n, data: calldata('transferFrom', [FROM, TO, 42n * 10n ** 6n]) },
    expectKind: 'erc20_transfer_from',
    expectHumanInclude: 'Pull',
  },
  {
    label: 'Native transfer (no data)',
    tx: { to: TO, value: 10n ** 18n, data: '0x' },
    expectKind: 'native_transfer',
    expectHumanInclude: 'Send USDC',
  },
  {
    label: 'Empty calldata zero value',
    tx: { to: TO, value: 0n, data: '0x' },
    expectKind: 'native_transfer',
    expectHumanInclude: 'Contract call',
  },
  {
    label: 'Unknown selector',
    tx: { to: TO, value: 0n, data: '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000000' },
    expectKind: 'contract_call',
    expectHumanInclude: 'Unknown contract call',
  },
  {
    label: 'Raw calldata without to',
    tx: { to: undefined, value: 0n, data: '0x' },
    expectKind: 'unknown',
    expectHumanInclude: 'Unknown',
  },
]

async function main() {
  let pass = 0
  let fail = 0
  for (const c of cases) {
    const res = await decodeTx(c.tx, {
      fetchTokenMeta: async () => tokenMeta,
    })
    const kindOk = res.kind === c.expectKind
    const humanOk = res.human.includes(c.expectHumanInclude)
    const paramOk = c.expectParamUnlimited === undefined ? true : res.params.some((p) => p.name === 'amount' && p.value === 'Unlimited')
    const ok = kindOk && humanOk && paramOk
    if (ok) pass++
    else fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.label}`)
    console.log(`      kind=${res.kind} human="${res.human}"`)
    if (!ok) {
      console.log(`      expected kind=${c.expectKind} human~"${c.expectHumanInclude}"${c.expectParamUnlimited ? ' param amount=Unlimited' : ''}`)
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})