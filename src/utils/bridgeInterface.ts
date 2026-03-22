import {Platform} from 'react-native';

/**
 * 웹에 주입되는 window.BarogagiApp 인터페이스 정의
 *
 * 웹 앱에서 호출 방법:
 *   window.BarogagiApp.login(provider_id, email, name)
 *   window.BarogagiApp.logout()
 *   window.BarogagiApp.snsLogin("kakao" | "naver" | "google")
 *   window.BarogagiApp.updateFcmToken()
 *   window.BarogagiApp.subscribeTopic(topic)
 *   window.BarogagiApp.unsubscribeTopic(topic)
 *   window.BarogagiApp.saveData(key, value)
 *   window.BarogagiApp.getData(key)      → 결과는 window.getDataResult(key, data) 콜백으로 수신
 *   window.BarogagiApp.deleteData(key)
 *
 * 네이티브 → 웹 콜백 (웹에서 구현해야 할 함수):
 *   window.snsLoginResult(type, provider_id, email, name)
 *   window.getDataResult(key, data)
 *   window.saveFcmToken(token)
 */
export const BRIDGE_INTERFACE_JS = `
(function() {
  var platform = '${Platform.OS}';

  function _post(type, data) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: type, data: data || {} })
      );
    }
  }

  window.isNativeApp = true;
  window.appPlatform = platform;

  window.BarogagiApp = {
    // 로그인 완료 후 앱에 사용자 정보 저장
    login: function(providerId, email, name) {
      _post('LOGIN', { provider_id: providerId, email: email, name: name });
    },

    // 로그아웃 — 앱 저장 정보 초기화
    logout: function() {
      _post('LOGOUT');
    },

    // SNS 로그인 요청 ("kakao" | "naver" | "google")
    // 완료 후 window.snsLoginResult(type, provider_id, email, name) 콜백
    snsLogin: function(type) {
      _post('SNS_LOGIN', { type: type });
    },

    // FCM 토큰 갱신 요청
    // 완료 후 window.saveFcmToken(token) 콜백
    updateFcmToken: function() {
      _post('UPDATE_FCM_TOKEN');
    },

    // FCM 토픽 구독
    subscribeTopic: function(topic) {
      _post('SUBSCRIBE_TOPIC', { topic: topic });
    },

    // FCM 토픽 구독 해제
    unsubscribeTopic: function(topic) {
      _post('UNSUBSCRIBE_TOPIC', { topic: topic });
    },

    // 앱 스토리지에 데이터 저장
    saveData: function(key, value) {
      _post('SAVE_DATA', { key: key, value: value });
    },

    // 앱 스토리지에서 데이터 조회
    // 결과는 window.getDataResult(key, data) 콜백으로 수신
    getData: function(key) {
      _post('GET_DATA', { key: key });
    },

    // 앱 스토리지에서 데이터 삭제
    deleteData: function(key) {
      _post('DELETE_DATA', { key: key });
    },
  };

  // 하위 호환 — 기존 sendToNative 유지
  window.sendToNative = function(type, data) {
    _post(type, data);
  };
})();
`;
