import { PROXY_FLAG } from '../channel'

type RequestHandler = (method: string, params: unknown[]) => void

/**
 * Wrap a real EIP-1193 provider so Arc Lens can observe targeted RPC methods
 * ONE hop before the wallet answers. Everything else passes through untouched,
 * and the intercepted request's promise chain is fully preserved.
 */
export function wrapProvider(real: unknown, onRequest: RequestHandler): unknown {
  if (!real || typeof real !== 'object') return real
  if ((real as { [PROXY_FLAG]?: boolean })[PROXY_FLAG]) return real

  const target = real as Record<string, unknown>
  const realRequest = target.request as ((args: { method?: string; params?: unknown[] }) => Promise<unknown>) | undefined

  const interceptedRequest = function (this: unknown, args: { method?: string; params?: unknown[] }) {
    const method = args?.method
    const params = Array.isArray(args?.params) ? args.params : []
    if (method && typeof realRequest === 'function') {
      onRequest(method, params)
      return realRequest.call(target, args)
    }
    if (typeof realRequest === 'function') return realRequest.call(target, args)
    return Promise.reject(new Error('no underlying request()'))
  }

  return new Proxy(target, {
    get(_t, prop, receiver) {
      if (prop === PROXY_FLAG) return true
      if (prop === 'request') return interceptedRequest
      // forward function properties (on/removeListener/... ) bound to the real provider
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') return value.bind(target)
      return value
    },
    set(_t, prop, value) {
      Reflect.set(target, prop, value)
      return true
    },
    has(_t, prop) {
      if (prop === PROXY_FLAG) return true
      return prop in target
    },
  })
}