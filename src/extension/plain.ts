/**
 * Structured-clone-safe normaliser for objects that cross chrome.runtime /
 * chrome.storage boundaries. decodeTx / viem can emit BigInt values and
 * exotic prototypes that Chrome's serializers reject, so reduce any value
 * graph to a fully JSON-plain, pure-data graph before handing it over.
 */
export function plain<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  ) as T
}