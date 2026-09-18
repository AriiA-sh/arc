import { publicClient } from '../../src/arc/client'
import { ARC_CHAIN_ID } from '../../src/arc/chain'

async function main() {
  const [chainId, blockNumber, block] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
    publicClient.getBlock({ blockTag: 'latest' }),
  ])
  const ok = chainId === ARC_CHAIN_ID
  console.log(`Arc Testnet`)
  console.log(`Chain ID: ${chainId}${ok ? '' : '  <-- MISMATCH!'}`)
  console.log(`Latest Block: ${blockNumber}`)
  console.log(`Block hash: ${block.hash}`)
  console.log(`Block time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`)
  console.log(ok ? `✓  Connected` : `✗  NOT connected`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(`Connection failed: ${e.message}`)
  process.exit(1)
})