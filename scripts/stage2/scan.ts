import { publicClient } from '../../src/arc/client'

async function main() {
  const num = await publicClient.getBlockNumber()
  let total = 0
  const sample: string[] = []
  for (let i = 0n; i < 10n; i++) {
    const b = await publicClient.getBlock({ blockNumber: num - i })
    total += b.transactions.length
    console.log(`block ${num - i}: ${b.transactions.length} txns`)
    if (sample.length === 0 && b.transactions.length > 0) {
      const t = b.transactions[0]
      sample.push(typeof t === 'string' ? t : t.hash)
    }
  }
  console.log(`total txns in 10 blocks: ${total}`)
  if (sample[0]) console.log(`sample tx: ${sample[0]}`)
}

main().catch((e) => {
  console.error(`ERR ${e.message}`)
  process.exit(1)
})