import {Platform} from 'react-native';

// 웹앱 URL 설정
export const WEB_APP_URL = __DEV__
  ? Platform.select({
      android: 'http://10.0.2.2:8080', // Android 에뮬레이터 → 호스트 머신
      ios: 'http://localhost:8080', // iOS 시뮬레이터 → 호스트 머신
    })!
  : 'https://barogagi.xyz/auth'; // 프로덕션 URL

export const APP_NAME = 'BarogagiApp';
export const APP_VERSION = '1.0.0';
