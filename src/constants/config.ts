import { Platform } from 'react-native';
import { DEV_HOST } from '@env';

// 기본값: Android 에뮬레이터용 호스트
const ANDROID_DEV_HOST = DEV_HOST || '10.0.2.2';

export const WEB_APP_URL = __DEV__
  ? Platform.select({
      android: `http://${ANDROID_DEV_HOST}:8080`,
      ios: 'http://localhost:8080',
    })!
  : 'https://fitpl.xyz/auth';

/**
 * 외부 링크 차단(§4)용 호스트 화이트리스트.
 * WEB_APP_URL의 hostname을 그대로 사용해 dev/prod 모두 자동 매칭.
 */
export const APP_HOST = new URL(WEB_APP_URL).hostname;

/**
 * OAuth 로그인(§OAuth) 콜백 딥링크.
 *
 * 소셜 로그인은 Custom Tab(외부 브라우저)에서 진행되고, 백엔드가 인증 완료 후 이 custom
 * scheme으로 302 리다이렉트하면 OS가 intent-filter(AndroidManifest)를 통해 앱으로 복귀시킨다.
 * react-native-inappbrowser-reborn의 openAuth(url, OAUTH_CALLBACK)가 이 prefix로 시작하는
 * URL을 감지해 {type:'success', url}로 resolve → 웹이 url의 쿼리에서 토큰을 파싱한다.
 *
 * 앱 소유 scheme이라 dev/prod 공통 고정값(WEB_APP_URL 파생 아님).
 * ⚠️ 백엔드의 앱 콜백 302 타깃 + AndroidManifest intent-filter(scheme=barogagiapp, host=oauth)와
 *    반드시 동일해야 한다. 셋 중 하나라도 어긋나면 콜백이 앱으로 돌아오지 않는다.
 */
export const OAUTH_CALLBACK = 'barogagiapp://oauth/callback';

export const APP_NAME = 'fitpl';
export const APP_VERSION = '1.2.1';
