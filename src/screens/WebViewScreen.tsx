/**
 * @file WebViewScreen.tsx
 * @description 앱의 메인 화면. barogagi-front 웹앱을 WebView로 렌더링합니다.
 *
 * ## 전체 동작 흐름
 *
 * [앱 시작]
 *   1. AsyncStorage에서 로그인 정보, 앱 설정(테마, 알림, FCM)을 로드 (initData)
 *   2. initData 로딩 완료 전에는 로딩 스피너 표시
 *
 * [WebView 렌더링]
 *   3. injectedJavaScriptBeforeContentLoaded 실행 (페이지 파싱 전)
 *      - 쿠키 주입: safe area, 사용자 정보, 테마, 알림, FCM 토큰, 앱 버전 등
 *      - window.BarogagiApp 인터페이스 등록
 *   4. 웹앱(barogagi-front) 로드 시작
 *   5. 웹앱이 document.cookie를 읽어 초기 상태 설정
 *
 * [런타임 브릿지]
 *   - 웹 → 네이티브: window.BarogagiApp.xxx() → postMessage → handleMessage()
 *   - 네이티브 → 웹: webViewRef.current.injectJavaScript() → 웹의 콜백 함수 호출
 *   - 설정 변경 시 해당 쿠키를 즉시 갱신 (buildStorageCookieJS → injectJavaScript)
 */

import React, {useRef, useState, useEffect, useCallback, useMemo} from 'react';
import {
  BackHandler,
  ActivityIndicator,
  StyleSheet,
  View,
  Linking,
  Share,
} from 'react-native';
import {WebView, WebViewMessageEvent} from 'react-native-webview';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ErrorFallback from '../components/ErrorFallback';
import {WEB_APP_URL, APP_NAME} from '../constants/config';
import {BRIDGE_TYPES} from '../constants/bridgeTypes';
import {StorageService} from '../services/StorageService';
import type {AppTheme} from '../services/StorageService';
import {
  buildCookieInjectionJS,
  buildSafeAreaCookieJS,
  buildStorageCookieJS,
} from '../utils/cookieInjector';
import type {StorageCookieData} from '../utils/cookieInjector';
import {BRIDGE_INTERFACE_JS} from '../utils/bridgeInterface';

/** 앱 시작 시 AsyncStorage에서 로드하는 초기 데이터 타입 */
interface InitData {
  providerId: string;
  email: string;
  name: string;
  autoLogin: boolean;
  appTheme: AppTheme;
  fcmToken: string;
  notificationEnabled: boolean;
}

/**
 * 현재 AsyncStorage 상태를 StorageCookieData 형태로 조합합니다.
 * 설정 변경 후 쿠키를 즉시 갱신할 때 사용합니다.
 */
const loadStorageCookieData = async (): Promise<StorageCookieData> => {
  const [loginInfo, autoLogin, appTheme, fcmToken, notificationEnabled] =
    await Promise.all([
      StorageService.getLoginInfo(),
      StorageService.getAutoLogin(),
      StorageService.getAppTheme(),
      StorageService.getFcmToken(),
      StorageService.getNotificationEnabled(),
    ]);
  return {
    ...loginInfo,
    autoLogin,
    appTheme,
    fcmToken,
    notificationEnabled,
  };
};

const WebViewScreen = () => {
  const webViewRef = useRef<WebView>(null);

  /**
   * 기기의 safe area 인셋 값 (단위: px).
   * 이 값을 쿠키로 전달해 웹앱이 겹침 없이 레이아웃을 구성할 수 있게 합니다.
   */
  const insets = useSafeAreaInsets();

  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  /**
   * AsyncStorage에서 로드한 초기 데이터.
   * null이면 아직 로딩 중이므로 WebView를 렌더링하지 않습니다.
   */
  const [initData, setInitData] = useState<InitData | null>(null);

  /** 앱 시작 시 AsyncStorage에서 초기 데이터를 병렬 로드합니다. */
  useEffect(() => {
    const load = async () => {
      const data = await loadStorageCookieData();
      setInitData(data);
    };
    load();
  }, []);

  /**
   * safe area 인셋 변경 시 여백 쿠키를 런타임으로 갱신합니다.
   * 화면 회전이나 키보드 노출 등으로 insets가 달라질 때 웹앱에 최신 값을 전달합니다.
   */
  useEffect(() => {
    if (!initialLoaded) {
      return;
    }
    const safeAreaJS = buildSafeAreaCookieJS(insets.top, insets.bottom);
    webViewRef.current?.injectJavaScript(safeAreaJS + '\ntrue;');
  }, [insets.top, insets.bottom, initialLoaded]);

  /** Android 하드웨어 뒤로가기 버튼 처리 */
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );
    return () => subscription.remove();
  }, [canGoBack]);

  /**
   * 스토리지 변경 후 쿠키를 즉시 갱신하는 헬퍼.
   * AsyncStorage에서 최신 상태를 읽어 전체 스토리지 쿠키를 재주입합니다.
   */
  const refreshStorageCookies = useCallback(async () => {
    const data = await loadStorageCookieData();
    const js = buildStorageCookieJS(data);
    webViewRef.current?.injectJavaScript(js + '\ntrue;');
  }, []);

  /** WebView 로드 전 주입할 JS 코드 (쿠키 + 브릿지 인터페이스) */
  const injectedJSBeforeContent = useMemo(() => {
    if (!initData) {
      return 'true;';
    }
    const cookieJS = buildCookieInjectionJS({
      safeAreaTop: insets.top,
      safeAreaBottom: insets.bottom,
      ...initData,
    });
    return cookieJS + '\n' + BRIDGE_INTERFACE_JS + '\ntrue;';
  }, [initData, insets.top, insets.bottom]);

  /** 웹 → 네이티브 메시지 수신 핸들러 */
  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);

        switch (message.type) {
          // ── 인증 ──

          case BRIDGE_TYPES.LOGIN: {
            const {provider_id, email, name} = message.data;
            await StorageService.saveLoginInfo(provider_id, email, name);
            await refreshStorageCookies();
            break;
          }

          case BRIDGE_TYPES.LOGOUT: {
            await StorageService.clearLoginInfo();
            await refreshStorageCookies();
            break;
          }

          case BRIDGE_TYPES.SNS_LOGIN: {
            const {type} = message.data;
            console.log('[SNS_LOGIN] type:', type);
            // TODO: SDK 연동 후 구현
            break;
          }

          // ── FCM ──

          case BRIDGE_TYPES.UPDATE_FCM_TOKEN: {
            console.log('[UPDATE_FCM_TOKEN] Firebase SDK 연동 후 구현');
            // TODO: SDK 연동 후 아래 패턴으로 구현
            // const token = await messaging().getToken();
            // await StorageService.setFcmToken(token);
            // await refreshStorageCookies();
            // webViewRef.current?.injectJavaScript(
            //   `window.saveFcmToken && window.saveFcmToken('${token}'); true;`
            // );
            break;
          }

          case BRIDGE_TYPES.SUBSCRIBE_TOPIC: {
            console.log('[SUBSCRIBE_TOPIC] topic:', message.data?.topic);
            // TODO: await messaging().subscribeToTopic(message.data.topic);
            break;
          }

          case BRIDGE_TYPES.UNSUBSCRIBE_TOPIC: {
            console.log('[UNSUBSCRIBE_TOPIC] topic:', message.data?.topic);
            // TODO: await messaging().unsubscribeFromTopic(message.data.topic);
            break;
          }

          // ── 앱 설정 ──

          /**
           * [SET_THEME] 앱 테마를 변경하고 쿠키를 즉시 갱신합니다.
           * 웹에서 호출: window.BarogagiApp.setTheme('dark')
           */
          case BRIDGE_TYPES.SET_THEME: {
            const {theme} = message.data;
            await StorageService.setAppTheme(theme);
            await refreshStorageCookies();
            break;
          }

          /**
           * [SET_NOTIFICATION] 알림 수신 설정을 변경하고 쿠키를 즉시 갱신합니다.
           * 웹에서 호출: window.BarogagiApp.setNotification(false)
           */
          case BRIDGE_TYPES.SET_NOTIFICATION: {
            const {enabled} = message.data;
            await StorageService.setNotificationEnabled(enabled);
            await refreshStorageCookies();
            break;
          }

          // ── 범용 스토리지 ──

          case BRIDGE_TYPES.SAVE_DATA: {
            const {key, value} = message.data;
            await StorageService.saveWebData(key, value);
            break;
          }

          case BRIDGE_TYPES.GET_DATA: {
            const {key, callbackId} = message.data;
            const value = await StorageService.getWebData(key);
            if (callbackId) {
              // Promise 기반: 일회성 콜백으로 응답
              webViewRef.current?.injectJavaScript(
                `window[${JSON.stringify(callbackId)}] && window[${JSON.stringify(callbackId)}](${JSON.stringify(value)}); true;`,
              );
            } else {
              // 레거시 호환: window.getDataResult 콜백
              webViewRef.current?.injectJavaScript(
                `window.getDataResult && window.getDataResult(${JSON.stringify(key)}, ${JSON.stringify(value)}); true;`,
              );
            }
            break;
          }

          case BRIDGE_TYPES.DELETE_DATA: {
            const {key} = message.data;
            await StorageService.deleteWebData(key);
            break;
          }

          // ── 시스템 ──

          case BRIDGE_TYPES.NAVIGATE: {
            if (message.data?.url) {
              Linking.openURL(message.data.url);
            }
            break;
          }

          case BRIDGE_TYPES.SHARE: {
            Share.share({
              message: message.data?.message || '',
              title: message.data?.title || '',
            });
            break;
          }

          case BRIDGE_TYPES.HAPTIC: {
            console.log('[HAPTIC] style:', message.data?.style);
            // TODO: react-native-haptic-feedback 설치 후 구현
            break;
          }

          default:
            console.log('[WebView] 알 수 없는 메시지 타입:', message);
        }
      } catch (error) {
        console.warn('[WebView] 메시지 파싱 실패:', error);
      }
    },
    [refreshStorageCookies],
  );

  const handleRetry = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  if (hasError) {
    return <ErrorFallback onRetry={handleRetry} />;
  }

  if (!initData) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{uri: WEB_APP_URL}}
        style={styles.webView}
        onNavigationStateChange={navState => setCanGoBack(navState.canGoBack)}
        allowsBackForwardNavigationGestures={true}
        domStorageEnabled={true}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={false}
        applicationNameForUserAgent={APP_NAME}
        originWhitelist={['https://*', 'http://*']}
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        injectedJavaScriptBeforeContentLoaded={injectedJSBeforeContent}
        onMessage={handleMessage}
        onLoadStart={() => {
          if (!initialLoaded) {
            setIsLoading(true);
          }
        }}
        onLoadEnd={() => {
          setIsLoading(false);
          setInitialLoaded(true);
        }}
        onError={() => setHasError(true)}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6C5CE7" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});

export default WebViewScreen;
