import { publicClient } from '../../src/arc/client'
import { decodeTx } from '../../src/core/decoder/decoder'
import { makeTokenMetaFetcher } from '../../src/core/decoder/token-meta'

const fetchTokenMeta = makeTokenMetaFetcher({
  readContract: (p) => publicClient.readContract({ ...p, args: [] }) as any,
  getCode: (a) => publicClient.getCode({ address: a }) as Promise<string | undefined>,
})

async function main() {
  const num = await publicClient.getBlockNumber()
  const approves: string[] = []
  for (let i = 0n; i < 60n && approves.length < 5; i++) {
    const block = await publicClient.getBlock({ blockNumber: num - i, includeTransactions: true })
    for (const tx of block.transactions) {
      const res = await decodeTx({ to: tx.to, value: tx.value, input: tx.input, from: tx.from }, { fetchTokenMeta })
      if (res.kind === 'erc20_approve') {
        approves.push(tx.hash)
        console.log(`APPROVE ${tx.hash}`)
        console.log(`   human: ${res.human}`)
        console.log(`   desc : ${res.description}`)
      }
    }
  }
  if (approves.length === 0) console.log('no approves found in 60 blocks')
  else console.log(`\nfav approve hashes:`)
  approves.forEach((h) => console.log(h))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})