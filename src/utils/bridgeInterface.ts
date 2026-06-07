/**
 * @file bridgeInterface.ts
 * @description WebView 페이지 파싱 전에 주입되는 RPC 통신 골격.
 *
 * RN_BRIDGE.md §7 RPC 통신 프로토콜.
 *
 * - 웹 → RN: window.BarogagiApp.method(...) → rpc()가 {id, method, payload}로 직렬화해 postMessage
 * - RN → 웹: window.__bridgeResolve(id, ok, value)로 Promise resolve/reject
 * - 3초 내 응답 없으면 'bridge timeout' 에러로 reject
 * - OAuth처럼 외부 브라우저 왕복(사용자 상호작용)이 끼는 호출은 rpcNoTimeout()으로
 *   타임아웃을 적용하지 않음. RN이 콜백/취소 시점에 __bridgeResolve로 회신.
 */

export const BRIDGE_INTERFACE_JS = `
(function() {
  var pending = new Map();
  var nextId = 1;

  function rpc(method, payload, timeoutMs) {
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
      // timeoutMs <= 0 이면 타임아웃 미적용(OAuth 등 외부 브라우저 왕복). 기본 3초.
      var t = typeof timeoutMs === 'number' ? timeoutMs : 3000;
      if (t > 0) {
        setTimeout(function() {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error('bridge timeout'));
          }
        }, t);
      }
    });
  }

  // 외부 브라우저 로그인 등 응답이 늦는 호출용. 타임아웃 없이 RN 회신을 무기한 대기.
  function rpcNoTimeout(method, payload) {
    return rpc(method, payload, 0);
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
    // OAuth 로그인: authorizeUrl을 Custom Tab으로 열고 백엔드 콜백까지 대기(타임아웃 없음).
    // resolve 값은 콜백 URL 문자열 → 웹이 new URL(url).searchParams로 토큰 파싱.
    // 사용자가 탭을 닫으면(cancel/dismiss) reject → 웹은 모달 없이 무시.
    loginWithOAuth: function(url) {
      return rpcNoTimeout('loginWithOAuth', { url: url });
    },
    exitApp: function() {
      return rpc('exitApp', {});
    },
    // FCM 토큰 발급(네이티브). 실패/거부/미지원 시 null. 웹이 로그인 직후 호출.
    getFcmToken: function() {
      return rpc('getFcmToken', {});
    },
    // 푸시 토큰 등록용 deviceType('ANDROID' | 'IOS'). 웹이 서버 등록 시 사용.
    getDeviceType: function() {
      return rpc('getDeviceType', {});
    },
  };
})();
true;
`;
