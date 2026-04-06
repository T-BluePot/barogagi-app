import { Platform } from 'react-native';
import { DEV_HOST } from '@env';

// 기본값: Android 에뮬레이터용 호스트
const ANDROID_DEV_HOST = DEV_HOST || '10.0.2.2';

export const WEB_APP_URL = __DEV__
  ? Platform.select({
      android: `http://${ANDROID_DEV_HOST}:8080`,
      ios: 'http://localhost:8080',
    })!
  : 'https://barogagi.xyz/auth';

export const APP_NAME = 'BarogagiApp';
export const APP_VERSION = '1.0.0';
