/**
 * @file fcm.ts
 * @description FCM 토큰 발급/캐싱/권한 및 네이티브 알림 표시 담당.
 *
 * RN_FCM 핸드오프 기준. 웹은 토큰을 "받아서" 서버에 등록만 하고,
 * 토큰 "발급"과 푸시 "표시"는 네이티브(여기) 책임.
 *
 * - getFcmToken(): 브릿지 계약상 절대 throw 금지, 실패 시 항상 null 반환.
 * - 토큰은 MMKV + 메모리에 캐싱해 브릿지 호출(웹 RPC 3초 타임아웃) 시 즉시 반환.
 * - 포그라운드: onMessage → notifee 로컬 알림. 백그라운드/종료: index.js 핸들러.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  requestPermission,
  AuthorizationStatus,
  type RemoteMessage,
} from '@react-native-firebase/messaging';

/** deviceType 브릿지 반환값. 백엔드 푸시 발송이 플랫폼을 구분할 때 사용. */
export type DeviceType = 'ANDROID' | 'IOS';

/** Android notifee 기본 알림 채널 ID. 백그라운드 핸들러(index.js)와 공유. */
export const DEFAULT_CHANNEL_ID = 'default';

/** 토큰 캐시 전용 MMKV. bridgeStorage의 persistent와 분리해 관심사 격리. */
const fcmStore = new MMKV({ id: 'barogagi-fcm' });
const TOKEN_KEY = 'fcmToken';

/** 메모리 캐시 — 앱 세션 동안 MMKV 접근 없이 즉시 반환하기 위함. */
let cachedToken: string | null = fcmStore.getString(TOKEN_KEY) ?? null;

const messaging = () => getMessaging(getApp());

const setCachedToken = (token: string | null) => {
  cachedToken = token;
  if (token) {
    fcmStore.set(TOKEN_KEY, token);
  } else {
    fcmStore.delete(TOKEN_KEY);
  }
};

/** 현재 플랫폼의 deviceType. 웹이 ANDROID/IOS로 토큰 등록 시 사용(열린 질문 #1). */
export const getDeviceType = (): DeviceType =>
  Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

/**
 * 알림 권한 요청.
 * - iOS: messaging.requestPermission() (시스템 권한 시트)
 * - Android 13+(API 33): POST_NOTIFICATIONS 런타임 권한 추가 필요
 * @returns 권한 허용 여부. 거부 시 토큰 발급해도 알림이 도착하지 않음.
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'android') {
      // Android 13 미만은 런타임 권한이 없어 항상 허용으로 간주.
      if (Number(Platform.Version) >= 33) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    }

    const status = await requestPermission(messaging());
    return (
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL
    );
  } catch (e) {
    console.warn('[fcm] 권한 요청 실패:', e);
    return false;
  }
};

/**
 * FCM 토큰 발급. 브릿지(getFcmToken)의 실제 구현부.
 *
 * 캐시가 있으면 즉시 반환(웹 RPC 3초 타임아웃 대비), 없으면 권한 확인 후 발급.
 * 권한 거부/발급 실패/미지원은 모두 null. 호출자 계약상 throw 하지 않음.
 */
export const getFcmToken = async (): Promise<string | null> => {
  if (cachedToken) return cachedToken;

  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;

    const token = await getToken(messaging());
    setCachedToken(token ?? null);
    return cachedToken;
  } catch (e) {
    console.warn('[fcm] 토큰 발급 실패:', e);
    return null;
  }
};

/** Android 8+ 알림 표시에 필요한 기본 채널 생성(멱등). */
const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: DEFAULT_CHANNEL_ID,
    name: '기본 알림',
    importance: AndroidImportance.HIGH,
  });
};

/**
 * RemoteMessage를 시스템 알림으로 표시. 포그라운드 onMessage / 백그라운드 핸들러 공용.
 *
 * 웹 서비스워커(firebase-messaging-sw.js)는 WebView에서 동작하지 않으므로
 * 네이티브가 직접 표시한다. notification 페이로드가 없는 data-only 메시지는 표시 생략.
 */
export const displayNotification = async (
  message: RemoteMessage,
): Promise<void> => {
  const { notification, data } = message;
  if (!notification?.title && !notification?.body) return;

  await ensureAndroidChannel();
  await notifee.displayNotification({
    title: notification?.title,
    body: notification?.body,
    data,
    android: {
      channelId: DEFAULT_CHANNEL_ID,
      pressAction: { id: 'default' }, // 탭 시 앱 실행
    },
  });
};

/**
 * 앱 진입 시 1회 호출. 권한 요청 + 토큰 캐시 예열 + 갱신/포그라운드 구독.
 *
 * @returns 구독 해제 함수(언마운트 시 호출). onTokenRefresh/onMessage 정리.
 */
export const initFcm = (): (() => void) => {
  ensureAndroidChannel().catch(() => {});

  // 권한 요청 후 토큰을 미리 발급해 캐시를 예열(브릿지 호출 시 즉시 반환).
  getFcmToken().catch(() => {});

  // 토큰 갱신 시 캐시 업데이트. 웹으로의 재전파는 다음 로그인/재진입 시 재동기화에 위임.
  const unsubscribeRefresh = onTokenRefresh(messaging(), token => {
    setCachedToken(token ?? null);
  });

  // 포그라운드 수신 메시지는 네이티브가 표시(웹 toast는 앱 환경에서 비활성 권장).
  const unsubscribeMessage = onMessage(messaging(), async message => {
    await displayNotification(message);
  });

  return () => {
    unsubscribeRefresh();
    unsubscribeMessage();
  };
};
