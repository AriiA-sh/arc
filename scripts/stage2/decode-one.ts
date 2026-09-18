import { publicClient } from '../../src/arc/client'
import { decodeTx } from '../../src/core/decoder/decoder'
import { makeTokenMetaFetcher } from '../../src/core/decoder/token-meta'

const fetchTokenMeta = makeTokenMetaFetcher({
  readContract: (p) => publicClient.readContract({ ...p, args: [] }) as any,
  getCode: (a) => publicClient.getCode({ address: a }) as Promise<`0x${string}`>,
})

const HASHES = process.argv.slice(2)

async function main() {
  for (const hash of HASHES) {
    const tx = await publicClient.getTransaction({ hash: hash as `0x${string}` })
    const res = await decodeTx({ to: tx.to, value: tx.value, input: tx.input, from: tx.from }, { fetchTokenMeta })
    console.log(`\nTX ${hash}`)
    console.log(`to:  ${tx.to ?? 'contract-creation'}`)
    console.log(`from:${tx.from}`)
    console.log(`human: ${res.human}`)
    console.log(`desc : ${res.description}`)
    console.log(`params:`)
    for (const p of res.params) console.log(`   ${p.name} = ${p.value.slice(0, 100)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})