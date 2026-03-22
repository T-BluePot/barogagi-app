/**
 * @file bridgeInterface.ts
 * @description 웹앱(barogagi-front)에서 사용할 네이티브 브릿지 인터페이스를 주입합니다.
 *
 * ## 개요
 * 이 파일은 WebView 안의 웹앱이 네이티브 기능을 호출할 수 있도록
 * window.BarogagiApp 객체를 웹 전역에 등록하는 JS 코드를 정의합니다.
 *
 * ## 동작 원리
 * 1. 앱이 WebView를 렌더링하기 전, BRIDGE_INTERFACE_JS가 injectedJavaScriptBeforeContentLoaded로 주입됩니다.
 * 2. 웹앱은 window.BarogagiApp.xxx() 형태로 네이티브 기능을 호출합니다.
 * 3. 내부적으로 ReactNativeWebView.postMessage()를 통해 메시지를 전송합니다.
 * 4. 네이티브 WebViewScreen의 handleMessage()가 메시지를 받아 처리합니다.
 *
 * ## 웹앱 개발자를 위한 사용 가이드 (barogagi-front)
 *
 * ### 네이티브 앱 환경 확인
 * ```javascript
 * if (window.isNativeApp) {
 *   // 앱 내에서 실행 중
 *   console.log(window.appPlatform); // 'ios' | 'android'
 * }
 * ```
 *
 * ### 인증
 * ```javascript
 * // 로그인 완료 후 — 앱 스토리지에 사용자 정보 저장 (재실행 시 쿠키로 복원됨)
 * window.BarogagiApp.login('kakao_12345', 'user@example.com', '홍길동');
 *
 * // 로그아웃 — 앱 스토리지에서 사용자 정보 삭제
 * window.BarogagiApp.logout();
 *
 * // SNS 로그인 요청 — 앱이 카카오/네이버/구글 SDK를 실행 후 아래 콜백으로 결과 전달
 * window.BarogagiApp.snsLogin('kakao');
 * // 웹에서 구현해야 할 콜백:
 * window.snsLoginResult = function(type, providerId, email, name) {
 *   // 로그인 결과 처리
 * };
 * ```
 *
 * ### FCM 푸시 알림
 * ```javascript
 * // 로그인 완료 후 FCM 토큰 요청 (서버에 토큰 등록을 위해 필요)
 * window.BarogagiApp.updateFcmToken();
 * // 웹에서 구현해야 할 콜백:
 * window.saveFcmToken = function(token) {
 *   // 서버에 토큰 등록 처리
 * };
 *
 * // 특정 토픽 알림 구독/해제
 * window.BarogagiApp.subscribeTopic('notice');
 * window.BarogagiApp.unsubscribeTopic('notice');
 * ```
 *
 * ### 앱 스토리지 (비동기)
 * ```javascript
 * // 저장
 * window.BarogagiApp.saveData('lastVisitedPage', '/home');
 *
 * // 조회 — 결과는 콜백으로 수신 (직접 return하지 않음)
 * window.BarogagiApp.getData('lastVisitedPage');
 * window.getDataResult = function(key, value) {
 *   if (key === 'lastVisitedPage') {
 *     console.log(value); // '/home'
 *   }
 * };
 *
 * // 삭제
 * window.BarogagiApp.deleteData('lastVisitedPage');
 * ```
 *
 * ### 시스템
 * ```javascript
 * // 외부 링크를 기기 기본 브라우저로 열기
 * window.BarogagiApp.navigate('https://example.com');
 * // 위 메서드는 sendToNative 기반 — 아래처럼 호출도 동일하게 동작함
 * window.sendToNative('NAVIGATE', { url: 'https://example.com' });
 * ```
 *
 * ## 네이티브 → 웹 콜백 목록 (웹에서 반드시 구현해야 하는 함수)
 * | 함수 시그니처                                        | 호출 시점                  |
 * |------------------------------------------------------|----------------------------|
 * | window.snsLoginResult(type, providerId, email, name) | SNS 로그인 완료 후         |
 * | window.getDataResult(key, data)                      | getData() 응답 시          |
 * | window.saveFcmToken(token)                           | updateFcmToken() 응답 시   |
 */

import {Platform} from 'react-native';

/**
 * WebView에 주입되는 window.BarogagiApp 인터페이스 정의 JS 코드.
 *
 * Platform.OS는 React Native 번들 로딩 시점에 'ios' 또는 'android'로 확정되므로
 * 템플릿 리터럴로 직접 삽입해도 안전합니다.
 *
 * WebViewScreen의 injectedJavaScriptBeforeContentLoaded에 전달됩니다.
 */
export const BRIDGE_INTERFACE_JS = `
(function() {
  /**
   * 네이티브로 메시지를 전송하는 내부 헬퍼 함수.
   * ReactNativeWebView가 없는 환경(일반 브라우저)에서는 아무 동작도 하지 않습니다.
   *
   * @param {string} type  - BRIDGE_TYPES 값 (예: 'LOGIN', 'LOGOUT')
   * @param {object} [data] - 메시지와 함께 전달할 데이터
   */
  function _post(type, data) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: type, data: data || {} })
      );
    }
  }

  /** 네이티브 앱 환경 여부 — 웹앱에서 조건 분기 시 사용 */
  window.isNativeApp = true;

  /** 현재 실행 중인 플랫폼 ('ios' | 'android') */
  window.appPlatform = '${Platform.OS}';

  /**
   * 네이티브 기능 호출 인터페이스.
   * WebView가 페이지를 파싱하기 전에 등록되므로 어느 시점에서나 호출 가능합니다.
   */
  window.BarogagiApp = {
    /**
     * 로그인 완료 후 앱 스토리지에 사용자 정보를 저장합니다.
     * 저장된 정보는 앱 재실행 시 쿠키(provider_id, email, name)로 웹에 자동 전달됩니다.
     *
     * @param {string} providerId - SNS 제공자 기준 고유 사용자 ID
     * @param {string} email      - 사용자 이메일
     * @param {string} name       - 사용자 이름
     */
    login: function(providerId, email, name) {
      _post('LOGIN', { provider_id: providerId, email: email, name: name });
    },

    /**
     * 앱 스토리지에서 사용자 정보를 모두 삭제합니다.
     * 로그아웃 또는 회원탈퇴 시 호출하세요.
     */
    logout: function() {
      _post('LOGOUT');
    },

    /**
     * 네이티브 SNS SDK를 통한 로그인을 요청합니다.
     * 로그인 처리가 완료되면 window.snsLoginResult(type, providerId, email, name) 콜백이 호출됩니다.
     *
     * @param {'kakao'|'naver'|'google'} type - SNS 로그인 타입
     */
    snsLogin: function(type) {
      _post('SNS_LOGIN', { type: type });
    },

    /**
     * Firebase FCM 토큰 갱신을 요청합니다.
     * 토큰 발급이 완료되면 window.saveFcmToken(token) 콜백이 호출됩니다.
     * 로그인 완료 직후 반드시 호출해 서버에 토큰을 등록하세요.
     */
    updateFcmToken: function() {
      _post('UPDATE_FCM_TOKEN');
    },

    /**
     * 특정 FCM 토픽을 구독합니다.
     * 해당 토픽으로 발송된 푸시 알림을 수신할 수 있습니다.
     *
     * @param {string} topic - 구독할 토픽명 (예: 'notice', 'event')
     */
    subscribeTopic: function(topic) {
      _post('SUBSCRIBE_TOPIC', { topic: topic });
    },

    /**
     * FCM 토픽 구독을 해제합니다.
     *
     * @param {string} topic - 구독 해제할 토픽명
     */
    unsubscribeTopic: function(topic) {
      _post('UNSUBSCRIBE_TOPIC', { topic: topic });
    },

    /**
     * 네이티브 스토리지(AsyncStorage)에 데이터를 저장합니다.
     * 앱을 종료했다 재실행해도 데이터가 유지됩니다.
     * 값은 반드시 문자열이어야 합니다. 객체 저장 시 JSON.stringify를 사용하세요.
     *
     * @param {string} key   - 저장할 키
     * @param {string} value - 저장할 값 (문자열)
     */
    saveData: function(key, value) {
      _post('SAVE_DATA', { key: key, value: value });
    },

    /**
     * 네이티브 스토리지에서 데이터를 조회합니다.
     * 결과는 비동기로 window.getDataResult(key, data) 콜백을 통해 수신됩니다.
     * (직접 return값이 없으므로 반드시 콜백을 구현해야 합니다)
     *
     * @param {string} key - 조회할 키
     */
    getData: function(key) {
      _post('GET_DATA', { key: key });
    },

    /**
     * 네이티브 스토리지에서 특정 키의 데이터를 삭제합니다.
     *
     * @param {string} key - 삭제할 키
     */
    deleteData: function(key) {
      _post('DELETE_DATA', { key: key });
    },
  };

  /**
   * 하위 호환용 헬퍼 — 기존에 sendToNative를 직접 쓰던 코드를 위해 유지합니다.
   * 신규 코드는 window.BarogagiApp.xxx() 형태를 사용하세요.
   *
   * @param {string} type  - 브릿지 타입
   * @param {object} [data] - 전달 데이터
   */
  window.sendToNative = function(type, data) {
    _post(type, data);
  };
})();
`;
