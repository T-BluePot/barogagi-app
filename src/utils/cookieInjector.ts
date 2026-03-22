import {Appearance, Platform} from 'react-native';
import {APP_VERSION} from '../constants/config';

export interface CookieInjectionData {
  safeAreaTop: number;
  safeAreaBottom: number;
  providerId: string;
  email: string;
  name: string;
  autoLogin: boolean;
}

// document.cookie 단일 항목 세팅 JS 구문
const setCookie = (key: string, value: string): string =>
  `document.cookie = '${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax';`;

/**
 * WebView injectedJavaScriptBeforeContentLoaded에 주입할 쿠키 설정 JS 빌드
 * - 웹 앱이 최초 마운트 시 document.cookie로 이 값들을 읽을 수 있음
 */
export const buildCookieInjectionJS = (data: CookieInjectionData): string => {
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
