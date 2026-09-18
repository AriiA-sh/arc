import { publicClient } from '../../src/arc/client'
import { decodeTx } from '../../src/core/decoder/decoder'
import { makeTokenMetaFetcher } from '../../src/core/decoder/token-meta'
import { erc20Abi } from '../../src/core/decoder/abis'

const fetchTokenMeta = makeTokenMetaFetcher({
  readContract: (p) => publicClient.readContract({ ...p, args: [] }) as any,
  getCode: (a) => publicClient.getCode({ address: a }) as Promise<`0x${string}`>,
})

async function main() {
  // Scan a few recent blocks for any transaction that we can meaningfully decode.
  const num = await publicClient.getBlockNumber()
  const found: Array<{ hash: string; human: string }> = []
  let seen = 0
  for (let i = 0n; i < 15n; i++) {
    const block = await publicClient.getBlock({ blockNumber: num - i, includeTransactions: true })
    for (const tx of block.transactions) {
      seen++
      if (found.length >= 4) break
      const res = await decodeTx({ to: tx.to, value: tx.value, input: tx.input, from: tx.from }, { fetchTokenMeta })
      if (res.kind !== 'unknown' && res.kind !== 'contract_call') {
        found.push({ hash: tx.hash, human: res.human })
        printf(tx.hash, res)
      }
    }
    if (found.length >= 4) break
  }
  console.log(`\nscanned ${seen} txns, meaningfully decoded ${found.length}`)
  for (const f of found) console.log(`  ${f.hash}  ->  ${f.human}`)
}

function printf(hash: string, res: Awaited<ReturnType<typeof decodeTx>>) {
  console.log(`\nTX ${hash}`)
  console.log(`human: ${res.human}`)
  console.log(`desc : ${res.description}`)
  for (const p of res.params) console.log(`   ${p.name} = ${p.value.slice(0, 100)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})