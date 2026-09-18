export function isZeroAddress(addr: string): boolean {
  return /^0x0+$/i.test(addr)
}

export function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '')
}

export function shortAddr(addr: string, lead = 7, tail = 4): string {
  if (addr.length <= lead + tail + 1) return addr
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`
}