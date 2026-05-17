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

export const APP_NAME = 'BarogagiApp';
export const APP_VERSION = '1.0.0';
