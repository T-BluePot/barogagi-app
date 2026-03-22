/**
 * @file cookieInjector.ts
 * @description 앱 정보를 쿠키로 변환해 WebView에 주입하는 JS 코드를 생성합니다.
 *
 * ## 왜 쿠키를 사용하나요?
 * React Native WebView와 웹앱(barogagi-front)은 서로 다른 실행 환경입니다.
 * 앱이 알고 있는 정보(safe area 크기, 로그인 정보, 다크모드 여부 등)를
 * 웹앱이 초기 렌더링 시점부터 알 수 있도록 쿠키를 활용합니다.
 *
 * ## 왜 injectedJavaScriptBeforeContentLoaded를 사용하나요?
 * 일반적인 injectedJavaScript는 HTML 파싱이 끝난 뒤 실행됩니다.
 * React 웹앱은 HTML 파싱 직후 바로 마운트되기 때문에,
 * 그 시점에 이미 쿠키가 존재해야 값을 읽을 수 있습니다.
 * BeforeContentLoaded는 HTML 파싱 이전에 실행되므로 웹앱 초기화 전에 쿠키가 세팅됩니다.
 *
 * ## 웹앱에서 쿠키 읽는 방법 (barogagi-front 참고용)
 * ```javascript
 * // 유틸 함수 예시
 * function getCookie(name) {
 *   const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
 *   return match ? decodeURIComponent(match[2]) : null;
 * }
 *
 * const safeAreaBottom = parseInt(getCookie('safe_area_bottom') ?? '0', 10);
 * const isAutoLogin    = getCookie('auto_login') === 'true';
 * const isDarkMode     = getCookie('app_darkMode') === 'true';
 * ```
 *
 * ## 주입되는 쿠키 목록
 * | Key             | 설명                              | 예시 값       |
 * |-----------------|-----------------------------------|---------------|
 * | safe_area_top   | 상단 safe area 높이 (px)          | '59'          |
 * | safe_area_bottom| 하단 safe area 높이 (px)          | '34'          |
 * | provider_id     | 로그인 사용자 고유 ID             | 'kakao_12345' |
 * | email           | 로그인 사용자 이메일              | 'a@b.com'     |
 * | name            | 로그인 사용자 이름                | '홍길동'      |
 * | auto_login      | 자동 로그인 여부                  | 'true'        |
 * | app_version     | 앱 버전                           | '1.0.0'       |
 * | app_darkMode    | 시스템 다크모드 여부              | 'false'       |
 * | app_platform    | 플랫폼                            | 'ios'         |
 */

import {Appearance, Platform} from 'react-native';
import {APP_VERSION} from '../constants/config';

/** buildCookieInjectionJS에 전달하는 데이터 타입 */
export interface CookieInjectionData {
  /** 상단 safe area 높이 (상태바 + 노치 포함, px 단위) */
  safeAreaTop: number;
  /** 하단 safe area 높이 (홈 인디케이터 포함, px 단위) */
  safeAreaBottom: number;
  /** 로그인 사용자의 SNS 제공자 고유 ID. 비로그인 시 빈 문자열. */
  providerId: string;
  /** 로그인 사용자 이메일. 비로그인 시 빈 문자열. */
  email: string;
  /** 로그인 사용자 이름. 비로그인 시 빈 문자열. */
  name: string;
  /** 자동 로그인 활성화 여부 */
  autoLogin: boolean;
}

/**
 * document.cookie에 단일 항목을 세팅하는 JS 구문을 생성합니다.
 * path=/를 지정해 모든 경로에서 쿠키가 유효하도록 합니다.
 * SameSite=Lax는 크로스사이트 요청 시 쿠키 전송을 제한하는 보안 설정입니다.
 *
 * @param key - 쿠키 키
 * @param value - 쿠키 값 (특수문자 안전 처리를 위해 encodeURIComponent 적용)
 */
const setCookie = (key: string, value: string): string =>
  `document.cookie = '${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax';`;

/**
 * WebView의 injectedJavaScriptBeforeContentLoaded 속성에 전달할
 * 쿠키 설정 JS 문자열을 빌드합니다.
 *
 * WebViewScreen의 useMemo에서 initData, insets가 준비된 후 호출됩니다.
 * 이 함수가 반환한 JS는 WebView가 페이지를 파싱하기 전에 실행됩니다.
 *
 * @param data - 쿠키로 주입할 데이터 ({@link CookieInjectionData} 참고)
 * @returns WebView에 주입할 JS 코드 문자열
 */
export const buildCookieInjectionJS = (data: CookieInjectionData): string => {
  // Appearance.getColorScheme()은 현재 기기의 다크모드 설정을 반환합니다.
  // 'dark' | 'light' | null (null은 기기가 설정을 지원하지 않는 경우)
  const darkMode = Appearance.getColorScheme() === 'dark';

  return `
(function() {
  ${setCookie('safe_area_top', String(data.safeAreaTop))}
  ${setCookie('safe_area_bottom', String(data.safeAreaBottom))}
  ${setCookie('provider_id', data.providerId)}
  ${setCookie('email', data.email)}
  ${setCookie('name', data.name)}
  ${setCookie('auto_login', String(data.autoLogin))}
  ${setCookie('app_version', APP_VERSION)}
  ${setCookie('app_darkMode', String(darkMode))}
  ${setCookie('app_platform', Platform.OS)}
})();
`;
};
