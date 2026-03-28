/**
 * @file bridgeTypes.ts
 * @description 웹(WebView) ↔ 네이티브(React Native) 간 브릿지 메시지 타입 상수 모음
 *
 * ## 브릿지란?
 * 이 앱은 React Native 위에서 웹앱(barogagi-front)을 WebView로 띄우는 구조입니다.
 * 웹과 네이티브는 서로 다른 실행 환경이기 때문에 직접 함수를 호출할 수 없고,
 * 메시지(문자열)를 주고받는 방식으로 통신합니다.
 *
 * ## 통신 흐름
 * [웹 → 네이티브]
 *   웹에서 window.BarogagiApp.someMethod() 호출
 *   → 내부적으로 ReactNativeWebView.postMessage(JSON.stringify({ type, data })) 전송
 *   → 네이티브 WebViewScreen의 handleMessage()가 type을 보고 분기 처리
 *
 * [네이티브 → 웹]
 *   네이티브에서 webViewRef.current.injectJavaScript(코드 문자열) 실행
 *   → 웹에 미리 정의된 콜백 함수(window.getDataResult 등) 호출
 *
 * ## 이 파일의 역할
 * 메시지 type 값을 문자열 리터럴 대신 상수로 관리합니다.
 * 오타 방지 + 자동완성 지원을 위해 as const로 선언합니다.
 */

export const BRIDGE_TYPES = {
  // ─────────────────────────────────────────
  // 인증 (Authentication)
  // ─────────────────────────────────────────

  /**
   * 웹에서 로그인 완료 후 네이티브에 사용자 정보를 저장할 때 사용.
   * 네이티브는 이 정보를 AsyncStorage에 저장하고, 다음 앱 실행 시 쿠키로 웹에 전달.
   *
   * payload: { provider_id: string, email: string, name: string }
   */
  LOGIN: 'LOGIN',

  /**
   * 웹에서 로그아웃 또는 회원탈퇴 시 네이티브 저장 정보를 초기화할 때 사용.
   *
   * payload: 없음
   */
  LOGOUT: 'LOGOUT',

  /**
   * 웹에서 SNS(카카오/네이버/구글) 로그인 버튼 클릭 시 네이티브 SDK 호출을 요청.
   * 네이티브가 SDK 로그인을 처리한 뒤 window.snsLoginResult() 콜백으로 결과를 돌려줌.
   *
   * payload: { type: 'kakao' | 'naver' | 'google' }
   * 콜백: window.snsLoginResult(type, provider_id, email, name)
   */
  SNS_LOGIN: 'SNS_LOGIN',

  // ─────────────────────────────────────────
  // FCM 푸시 알림 (Firebase Cloud Messaging)
  // ─────────────────────────────────────────

  /**
   * 웹에서 FCM 푸시 토큰이 필요할 때 네이티브에 요청.
   * 네이티브가 Firebase SDK로 토큰을 발급받아 window.saveFcmToken() 콜백으로 전달.
   * → 로그인 완료 후 반드시 호출해야 푸시 알림을 받을 수 있음.
   *
   * payload: 없음
   * 콜백: window.saveFcmToken(token)
   */
  UPDATE_FCM_TOKEN: 'UPDATE_FCM_TOKEN',

  /**
   * 특정 주제(topic)의 FCM 푸시 알림을 구독.
   * 예: 공지사항 알림 구독 → subscribeTopic('notice')
   *
   * payload: { topic: string }
   */
  SUBSCRIBE_TOPIC: 'SUBSCRIBE_TOPIC',

  /**
   * 특정 주제(topic)의 FCM 푸시 알림 구독을 해제.
   *
   * payload: { topic: string }
   */
  UNSUBSCRIBE_TOPIC: 'UNSUBSCRIBE_TOPIC',

  // ─────────────────────────────────────────
  // 앱 설정 (Settings)
  // ─────────────────────────────────────────

  /**
   * 앱 테마를 변경합니다. 변경된 값은 네이티브 스토리지에 저장되며,
   * 다음 앱 실행 시 쿠키(app_theme)로 웹에 전달됩니다.
   *
   * payload: { theme: 'light' | 'dark' | 'system' }
   */
  SET_THEME: 'SET_THEME',

  /**
   * 푸시 알림 수신 설정을 변경합니다. 변경된 값은 네이티브 스토리지에 저장되며,
   * 다음 앱 실행 시 쿠키(notification_enabled)로 웹에 전달됩니다.
   *
   * payload: { enabled: boolean }
   */
  SET_NOTIFICATION: 'SET_NOTIFICATION',

  // ─────────────────────────────────────────
  // 앱 스토리지 (AsyncStorage)
  // ─────────────────────────────────────────

  /**
   * 웹에서 네이티브 스토리지(AsyncStorage)에 key-value 데이터를 저장.
   * 앱을 종료했다 다시 켜도 유지됨 (localStorage와 유사하지만 네이티브 영역).
   *
   * payload: { key: string, value: string }
   */
  SAVE_DATA: 'SAVE_DATA',

  /**
   * 웹에서 네이티브 스토리지에 저장된 데이터를 조회.
   * 결과는 비동기로 window.getDataResult(key, data) 콜백을 통해 반환됨.
   *
   * payload: { key: string }
   * 콜백: window.getDataResult(key, data)
   */
  GET_DATA: 'GET_DATA',

  /**
   * 웹에서 네이티브 스토리지의 특정 key 데이터를 삭제.
   *
   * payload: { key: string }
   */
  DELETE_DATA: 'DELETE_DATA',

  // ─────────────────────────────────────────
  // 시스템 (System)
  // ─────────────────────────────────────────

  /**
   * WebView 내부에서 처리할 수 없는 외부 URL을 기기 기본 브라우저로 열기.
   * 예: 외부 결제 페이지, 약관 링크 등
   *
   * payload: { url: string }
   */
  NAVIGATE: 'NAVIGATE',

  /**
   * 네이티브 공유 시트(Share Sheet)를 띄워 콘텐츠를 다른 앱으로 공유.
   * iOS/Android 각 플랫폼의 기본 공유 UI가 열림.
   *
   * payload: { message: string, title?: string }
   */
  SHARE: 'SHARE',

  /**
   * 기기 진동(햅틱 피드백)을 트리거.
   * 버튼 클릭 등 사용자 인터랙션에 물리적 피드백을 주고 싶을 때 사용.
   *
   * payload: { style?: 'light' | 'medium' | 'heavy' }
   */
  HAPTIC: 'HAPTIC',
} as const;

/**
 * BRIDGE_TYPES의 값(value) 유니온 타입.
 * 함수 파라미터 타입 지정에 사용.
 *
 * @example
 * function handleMessage(type: BridgeType) { ... }
 */
export type BridgeType = (typeof BRIDGE_TYPES)[keyof typeof BRIDGE_TYPES];
