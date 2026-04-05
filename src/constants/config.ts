import { Platform } from 'react-native';
import { DEV_HOST } from '@env';

// 웹앱 URL 설정
export const WEB_APP_URL = __DEV__
  ? Platform.select({
      android: `http://${DEV_HOST}:8080`,
      ios: 'http://localhost:8080',
    })!
  : 'https://barogagi.xyz/auth';

export const APP_NAME = 'BarogagiApp';
export const APP_VERSION = '1.0.0';
