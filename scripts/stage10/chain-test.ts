import { arcTestnet, arcMainnet, ARC_CHAIN_ID, ARC_CHAINS } from '../../src/arc/chain'
import { DEFAULT_SETTINGS } from '../../src/extension/channel'

let failures = 0
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ← ' + extra}`)
  if (!cond) failures++
}

// Verified against https://docs.arc.io/arc/references/rpc-endpoints (2026-09)
check('testnet id = 5042002', arcTestnet.id === 5042002, String(arcTestnet.id))
check('testnet RPC = rpc.testnet.arc.io', ARC_CHAINS.testnet.rpcUrls.default.http[0] === 'https://rpc.testnet.arc.io', ARC_CHAINS.testnet.rpcUrls.default.http[0])
check('mainnet id = 5042', arcMainnet.id === 5042, String(arcMainnet.id))
check('mainnet RPC = rpc.mainnet.arc.io', ARC_CHAINS.mainnet.rpcUrls.default.http[0] === 'https://rpc.mainnet.arc.io', ARC_CHAINS.mainnet.rpcUrls.default.http[0])
check('ARC_CHAIN_ID stays testnet (5042002)', ARC_CHAIN_ID === 5042002, String(ARC_CHAIN_ID))
check('default settings network is testnet', DEFAULT_SETTINGS.network === 'testnet', String(DEFAULT_SETTINGS.network))
check('defaults expectedChainId = 5042002', DEFAULT_SETTINGS.expectedChainId === 5042002, String(DEFAULT_SETTINGS.expectedChainId))
check('network names differ', ARC_CHAINS.mainnet.name !== ARC_CHAINS.testnet.name)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)