/**
 * @file cookieInjector.ts
 * @description 앱 정보를 쿠키로 변환해 WebView에 주입하는 JS 코드를 생성합니다.
 *
 * ## 왜 쿠키를 사용하나요?
 * React Native WebView와 웹앱(barogagi-front)은 서로 다른 실행 환경입니다.
 * 앱이 알고 있는 정보(safe area 크기, 로그인 정보, 다크모드 여부 등)를
 * 웹앱이 초기 렌더링 시점부터 알 수 있도록 쿠키를 활용합니다.
 *
 * ## 함수 구성
 * - buildSafeAreaCookieJS  : safe area 인셋만 쿠키로 주입 (여백 전용)
 * - buildStorageCookieJS   : 스토리지 기반 사용자/앱 정보를 쿠키로 주입
 * - buildCookieInjectionJS : 위 두 함수를 조합한 초기 전체 주입용 (WebView 최초 로딩 시)
 *
 * ## 런타임 갱신 패턴
 * 초기 로딩 이후 값이 변경될 때 개별 함수로 특정 쿠키만 갱신할 수 있습니다.
 * - 로그인/로그아웃 후  : buildStorageCookieJS → injectJavaScript
 * - 화면 회전 등        : buildSafeAreaCookieJS → injectJavaScript
 *
 * ## 웹앱에서 쿠키 읽는 방법 (barogagi-front 참고용)
 * ```javascript
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
 * | Key             | 함수                  | 설명                              | 예시 값       |
 * |-----------------|-----------------------|-----------------------------------|---------------|
 * | safe_area_top   | buildSafeAreaCookieJS | 상단 safe area 높이 (px)          | '59'          |
 * | safe_area_bottom| buildSafeAreaCookieJS | 하단 safe area 높이 (px)          | '34'          |
 * | provider_id     | buildStorageCookieJS  | 로그인 사용자 고유 ID             | 'kakao_12345' |
 * | email           | buildStorageCookieJS  | 로그인 사용자 이메일              | 'a@b.com'     |
 * | name            | buildStorageCookieJS  | 로그인 사용자 이름                | '홍길동'      |
 * | auto_login      | buildStorageCookieJS  | 자동 로그인 여부                  | 'true'        |
 * | app_version     | buildStorageCookieJS  | 앱 버전                           | '1.0.0'       |
 * | app_darkMode    | buildStorageCookieJS  | 시스템 다크모드 여부              | 'false'       |
 * | app_platform    | buildStorageCookieJS  | 플랫폼                            | 'ios'         |
 */

import {Appearance, Platform} from 'react-native';
import {APP_VERSION} from '../constants/config';

// ─────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────

/** buildStorageCookieJS에 전달하는 스토리지 기반 데이터 타입 */
export interface StorageCookieData {
  /** 로그인 사용자의 SNS 제공자 고유 ID. 비로그인 시 빈 문자열. */
  providerId: string;
  /** 로그인 사용자 이메일. 비로그인 시 빈 문자열. */
  email: string;
  /** 로그인 사용자 이름. 비로그인 시 빈 문자열. */
  name: string;
  /** 자동 로그인 활성화 여부 */
  autoLogin: boolean;
}

/** buildCookieInjectionJS에 전달하는 전체 데이터 타입 (safe area + 스토리지 조합) */
export interface CookieInjectionData extends StorageCookieData {
  /** 상단 safe area 높이 (상태바 + 노치 포함, px 단위) */
  safeAreaTop: number;
  /** 하단 safe area 높이 (홈 인디케이터 포함, px 단위) */
  safeAreaBottom: number;
}

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────

/**
 * document.cookie에 단일 항목을 세팅하는 JS 구문을 생성합니다.
 * path=/를 지정해 모든 경로에서 쿠키가 유효하도록 합니다.
 * SameSite=Lax는 크로스사이트 요청 시 쿠키 전송을 제한하는 보안 설정입니다.
 */
const setCookie = (key: string, value: string): string =>
  `document.cookie = '${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax';`;

// ─────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────

/**
 * Safe area 인셋 값만 쿠키로 주입하는 JS 코드를 생성합니다.
 *
 * ### 사용 시점
 * - WebView 최초 로딩: buildCookieInjectionJS 내부에서 호출됨
 * - 런타임 갱신: 화면 회전 등으로 insets가 변경될 때 injectJavaScript로 재주입
 *
 * @param top    - 상단 safe area 높이 (px)
 * @param bottom - 하단 safe area 높이 (px)
 * @returns WebView에 주입할 JS 코드 문자열
 */
export const buildSafeAreaCookieJS = (top: number, bottom: number): string => `
(function() {
  ${setCookie('safe_area_top', String(top))}
  ${setCookie('safe_area_bottom', String(bottom))}
})();`;

/**
 * AsyncStorage 기반 사용자/앱 정보를 쿠키로 주입하는 JS 코드를 생성합니다.
 *
 * ### 사용 시점
 * - WebView 최초 로딩: buildCookieInjectionJS 내부에서 호출됨
 * - 런타임 갱신: 로그인/로그아웃 완료 후 injectJavaScript로 재주입
 *
 * @param data - 쿠키로 주입할 스토리지 기반 데이터 ({@link StorageCookieData} 참고)
 * @returns WebView에 주입할 JS 코드 문자열
 */
export const buildStorageCookieJS = (data: StorageCookieData): string => {
  // Appearance.getColorScheme()은 현재 기기의 다크모드 설정을 반환합니다.
  // 'dark' | 'light' | null (null은 기기가 설정을 지원하지 않는 경우)
  const darkMode = Appearance.getColorScheme() === 'dark';

  return `
(function() {
  ${setCookie('provider_id', data.providerId)}
  ${setCookie('email', data.email)}
  ${setCookie('name', data.name)}
  ${setCookie('auto_login', String(data.autoLogin))}
  ${setCookie('app_version', APP_VERSION)}
  ${setCookie('app_darkMode', String(darkMode))}
  ${setCookie('app_platform', Platform.OS)}
})();`;
};

/**
 * WebView 초기 로딩 전 주입할 전체 쿠키 JS를 생성합니다.
 * buildSafeAreaCookieJS와 buildStorageCookieJS를 조합합니다.
 *
 * WebViewScreen의 useMemo에서 initData, insets가 준비된 후 호출됩니다.
 * 이 함수가 반환한 JS는 WebView가 페이지를 파싱하기 전에 실행됩니다.
 *
 * @param data - 쿠키로 주입할 전체 데이터 ({@link CookieInjectionData} 참고)
 * @returns WebView에 주입할 JS 코드 문자열
 */
export const buildCookieInjectionJS = (data: CookieInjectionData): string =>
  buildSafeAreaCookieJS(data.safeAreaTop, data.safeAreaBottom) +
  '\n' +
  buildStorageCookieJS({
    providerId: data.providerId,
    email: data.email,
    name: data.name,
    autoLogin: data.autoLogin,
  });
