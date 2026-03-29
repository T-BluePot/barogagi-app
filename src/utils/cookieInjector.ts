/**
 * @file cookieInjector.ts
 * @description 앱 정보를 쿠키로 변환해 WebView에 주입하는 JS 코드를 생성합니다.
 *
 * ## 함수 구성
 * - buildSafeAreaCookieJS  : safe area 인셋 전용
 * - buildStorageCookieJS   : 사용자 인증 + 앱 설정(테마, 알림, FCM) 전용
 * - buildCookieInjectionJS : 위 두 함수를 조합한 초기 전체 주입용
 *
 * ## 런타임 갱신 패턴
 * 개별 함수로 특정 쿠키만 갱신할 수 있습니다.
 * - 로그인/로그아웃/테마 변경/알림 설정 : buildStorageCookieJS → injectJavaScript
 * - 화면 회전 등                        : buildSafeAreaCookieJS → injectJavaScript
 *
 * ## 웹앱에서 쿠키 읽는 방법 (barogagi-front 참고용)
 * ```javascript
 * function getCookie(name) {
 *   const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
 *   return match ? decodeURIComponent(match[2]) : null;
 * }
 * ```
 *
 * ## 주입되는 쿠키 목록
 * | Key                  | 함수                  | 설명                      | 예시 값       |
 * |----------------------|-----------------------|---------------------------|---------------|
 * | safe_area_top        | buildSafeAreaCookieJS | 상단 safe area (px)       | '59'          |
 * | safe_area_bottom     | buildSafeAreaCookieJS | 하단 safe area (px)       | '34'          |
 * | user_info            | buildStorageCookieJS  | 사용자 정보 (JSON)        | '{"provider_id":"kakao_12345","email":"a@b.com","name":"홍길동"}' |
 * | auto_login           | buildStorageCookieJS  | 자동 로그인 여부          | 'true'        |
 * | app_theme            | buildStorageCookieJS  | 사용자 테마 설정          | 'dark'        |
 * | app_darkMode         | buildStorageCookieJS  | 시스템 다크모드 여부      | 'false'       |
 * | fcm_token            | buildStorageCookieJS  | FCM 푸시 토큰             | 'abc...'      |
 * | notification_enabled | buildStorageCookieJS  | 알림 수신 설정            | 'true'        |
 * | app_version          | buildStorageCookieJS  | 앱 버전                   | '1.0.0'       |
 * | app_platform         | buildStorageCookieJS  | 플랫폼                    | 'ios'         |
 */

import {Appearance, Platform} from 'react-native';
import {APP_VERSION} from '../constants/config';
import type {AppTheme} from '../services/StorageService';

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
  /** 사용자 테마 설정. 'light' | 'dark' | 'system' */
  appTheme: AppTheme;
  /** FCM 푸시 토큰. 미발급 시 빈 문자열. */
  fcmToken: string;
  /** 알림 수신 허용 여부 */
  notificationEnabled: boolean;
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
 * @param top    - 상단 safe area 높이 (px)
 * @param bottom - 하단 safe area 높이 (px)
 */
export const buildSafeAreaCookieJS = (top: number, bottom: number): string => `
(function() {
  ${setCookie('safe_area_top', String(top))}
  ${setCookie('safe_area_bottom', String(bottom))}
})();`;

/**
 * AsyncStorage 기반 사용자/앱 설정 정보를 쿠키로 주입하는 JS 코드를 생성합니다.
 * 로그인/로그아웃, 테마 변경, 알림 설정 변경 후 런타임 갱신에도 사용됩니다.
 *
 * @param data - 쿠키로 주입할 스토리지 기반 데이터
 */
export const buildStorageCookieJS = (data: StorageCookieData): string => {
  const darkMode = Appearance.getColorScheme() === 'dark';

  return `
(function() {
  ${setCookie('user_info', JSON.stringify({provider_id: data.providerId, email: data.email, name: data.name}))}
  ${setCookie('auto_login', String(data.autoLogin))}
  ${setCookie('app_theme', data.appTheme)}
  ${setCookie('app_darkMode', String(darkMode))}
  ${setCookie('fcm_token', data.fcmToken)}
  ${setCookie('notification_enabled', String(data.notificationEnabled))}
  ${setCookie('app_version', APP_VERSION)}
  ${setCookie('app_platform', Platform.OS)}
})();`;
};

/**
 * WebView 초기 로딩 전 주입할 전체 쿠키 JS를 생성합니다.
 * buildSafeAreaCookieJS + buildStorageCookieJS를 조합합니다.
 *
 * @param data - 쿠키로 주입할 전체 데이터
 */
export const buildCookieInjectionJS = (data: CookieInjectionData): string =>
  buildSafeAreaCookieJS(data.safeAreaTop, data.safeAreaBottom) +
  '\n' +
  buildStorageCookieJS(data);
