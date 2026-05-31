/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';
import { displayNotification } from './src/services/fcm';

/**
 * 백그라운드/종료 상태 FCM 수신 핸들러.
 * 컴포넌트 밖, AppRegistry 등록 전에 모듈 스코프에서 등록해야 헤드리스로 동작함.
 * 웹 서비스워커(firebase-messaging-sw.js)는 WebView에서 동작하지 않으므로 네이티브가 표시.
 */
setBackgroundMessageHandler(getMessaging(getApp()), async message => {
  await displayNotification(message);
});

AppRegistry.registerComponent(appName, () => App);
