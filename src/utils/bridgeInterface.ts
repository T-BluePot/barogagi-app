/**
 * @file bridgeInterface.ts
 * @description WebView 페이지 파싱 전에 주입되는 RPC 통신 골격.
 *
 * RN_BRIDGE.md §7 RPC 통신 프로토콜.
 *
 * - 웹 → RN: window.BarogagiApp.method(...) → rpc()가 {id, method, payload}로 직렬화해 postMessage
 * - RN → 웹: window.__bridgeResolve(id, ok, value)로 Promise resolve/reject
 * - 3초 내 응답 없으면 'bridge timeout' 에러로 reject
 */

export const BRIDGE_INTERFACE_JS = `
(function() {
  var pending = new Map();
  var nextId = 1;

  function rpc(method, payload) {
    return new Promise(function(resolve, reject) {
      var id = nextId++;
      pending.set(id, { resolve: resolve, reject: reject });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, method: method, payload: payload }));
      } else {
        pending.delete(id);
        reject(new Error('ReactNativeWebView not available'));
        return;
      }
      setTimeout(function() {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('bridge timeout'));
        }
      }, 3000);
    });
  }

  window.__bridgeResolve = function(id, ok, value) {
    var p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(value);
    else p.reject(new Error(value));
  };

  window.BarogagiApp = {
    getData: function(ns, key) {
      return rpc('getData', { ns: ns, key: key });
    },
    saveData: function(ns, key, value) {
      return rpc('saveData', { ns: ns, key: key, value: value });
    },
    deleteData: function(ns, key) {
      return rpc('deleteData', { ns: ns, key: key });
    },
    openExternal: function(url) {
      return rpc('openExternal', { url: url });
    },
    exitApp: function() {
      return rpc('exitApp', {});
    },
  };
})();
true;
`;
