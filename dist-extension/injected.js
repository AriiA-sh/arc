(() => {
  // src/extension/channel.ts
  var PAGE_CHANNEL = "ARCLENS_PAGE";
  var INJECTED_FLAG = "__arcLensInjected";
  var PROXY_FLAG = "isArcLensProxy";
  function newUid() {
    return `arcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // src/extension/injected/proxy.ts
  function wrapProvider(real, onRequest) {
    if (!real || typeof real !== "object") return real;
    if (real[PROXY_FLAG]) return real;
    const target = real;
    const realRequest = target.request;
    const interceptedRequest = function(args) {
      const method = args?.method;
      const params = Array.isArray(args?.params) ? args.params : [];
      if (method && typeof realRequest === "function") {
        onRequest(method, params);
        return realRequest.call(target, args);
      }
      if (typeof realRequest === "function") return realRequest.call(target, args);
      return Promise.reject(new Error("no underlying request()"));
    };
    return new Proxy(target, {
      get(_t, prop, receiver) {
        if (prop === PROXY_FLAG) return true;
        if (prop === "request") return interceptedRequest;
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") return value.bind(target);
        return value;
      },
      set(_t, prop, value) {
        Reflect.set(target, prop, value);
        return true;
      },
      has(_t, prop) {
        if (prop === PROXY_FLAG) return true;
        return prop in target;
      }
    });
  }

  // src/extension/injected/main.ts
  var TARGETED_METHODS = /* @__PURE__ */ new Set([
    "eth_sendTransaction",
    "eth_signTypedData_v4",
    "eth_signTypedData",
    "personal_sign",
    "eth_sign",
    "wallet_switchEthereumChain"
  ]);
  function toTxCapture(method, params) {
    const [first] = params;
    const out = { method };
    if (method === "eth_sendTransaction" && first && typeof first === "object") {
      const t = first;
      out.tx = {
        from: typeof t.from === "string" ? t.from : void 0,
        to: typeof t.to === "string" ? t.to : void 0,
        value: t.value !== void 0 ? String(t.value) : void 0,
        data: typeof t.data === "string" ? t.data : void 0,
        chainId: typeof t.chainId === "string" || typeof t.chainId === "number" ? t.chainId : void 0
      };
    } else if (method === "eth_signTypedData_v4" || method === "eth_signTypedData") {
      const json = typeof first === "string" ? first : typeof params[1] === "string" ? params[1] : void 0;
      if (json) {
        try {
          const data = JSON.parse(json);
          out.domain = data?.domain;
          out.primaryType = data?.primaryType;
        } catch {
          out.domain = void 0;
        }
      }
    }
    return out;
  }
  function emit(ev) {
    window.postMessage({ channel: PAGE_CHANNEL, ...ev }, "*");
  }
  function handleRequest(method, params) {
    if (!TARGETED_METHODS.has(method)) return;
    const cap = toTxCapture(method, params);
    const uid = newUid();
    emit({
      type: "TX_CAPTURED",
      uid,
      method,
      payload: {
        ...cap,
        chainId: window.ethereum?.chainId
      }
    });
  }
  function installProviderInterception() {
    if (window[INJECTED_FLAG]) return false;
    window[INJECTED_FLAG] = true;
    let current = void 0;
    function setEthereum(val) {
      if (!val || typeof val !== "object") return;
      current = wrapProvider(val, handleRequest);
    }
    let preExisting;
    try {
      preExisting = window.ethereum;
    } catch {
      preExisting = void 0;
    }
    try {
      Object.defineProperty(window, "ethereum", {
        // non-configurable + non-writable getter: a page cannot delete or
        // redefine the property to drop out of observation (Stage-b hardening).
        configurable: false,
        get() {
          return current;
        },
        set(val) {
          setEthereum(val);
        }
      });
    } catch {
      const eth = window.ethereum;
      if (eth) setEthereum(eth);
    }
    if (preExisting) {
      setEthereum(preExisting);
    } else {
      let tries = 0;
      const timer = setInterval(() => {
        const eth = window.ethereum;
        if (eth && eth !== current) setEthereum(eth);
        if (current || ++tries > 50) clearInterval(timer);
      }, 100);
    }
    return true;
  }
  installProviderInterception();
})();
//# sourceMappingURL=injected.js.map
