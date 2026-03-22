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
import {buildCookieInjectionJS} from '../utils/cookieInjector';
import {BRIDGE_INTERFACE_JS} from '../utils/bridgeInterface';

interface InitData {
  providerId: string;
  email: string;
  name: string;
  autoLogin: boolean;
}

const WebViewScreen = () => {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();

  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // SPA 페이지 이동 시 onLoadStart가 반복 트리거되는 문제 방지
  // 최초 1회만 로딩 스피너를 표시하기 위한 플래그
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  // 스토리지에서 읽은 초기 데이터 — null이면 아직 로딩 중
  const [initData, setInitData] = useState<InitData | null>(null);

  // 앱 시작 시 스토리지에서 초기 데이터 로드
  useEffect(() => {
    const loadInitData = async () => {
      const [loginInfo, autoLogin] = await Promise.all([
        StorageService.getLoginInfo(),
        StorageService.getAutoLogin(),
      ]);
      setInitData({...loginInfo, autoLogin});
    };
    loadInitData();
  }, []);

  // Android 하드웨어 뒤로가기 처리
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
   * WebView 로드 전 주입 JS
   * 1) 쿠키 설정 (safe area, 사용자 정보, 앱 정보)
   * 2) window.BarogagiApp 인터페이스 정의
   */
  const injectedJSBeforeContent = useMemo(() => {
    if (!initData) {
      return 'true;';
    }
    const cookieJS = buildCookieInjectionJS({
      safeAreaTop: insets.top,
      safeAreaBottom: insets.bottom,
      providerId: initData.providerId,
      email: initData.email,
      name: initData.name,
      autoLogin: initData.autoLogin,
    });
    return cookieJS + '\n' + BRIDGE_INTERFACE_JS + '\ntrue;';
  }, [initData, insets.top, insets.bottom]);

  // 웹 → 네이티브 메시지 핸들러
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      switch (message.type) {
        // 로그인 완료 — 사용자 정보 저장
        case BRIDGE_TYPES.LOGIN: {
          const {provider_id, email, name} = message.data;
          await StorageService.saveLoginInfo(provider_id, email, name);
          break;
        }

        // 로그아웃 — 저장된 사용자 정보 초기화
        case BRIDGE_TYPES.LOGOUT: {
          await StorageService.clearLoginInfo();
          break;
        }

        // SNS 로그인 요청 — 완료 후 snsLoginResult 콜백
        // TODO: @react-native-google-signin, react-native-kakao, etc. SDK 연동 필요
        case BRIDGE_TYPES.SNS_LOGIN: {
          const {type} = message.data;
          console.log('[SNS_LOGIN] type:', type);
          // SDK 연동 후 아래 패턴으로 콜백:
          // webViewRef.current?.injectJavaScript(
          //   `window.snsLoginResult && window.snsLoginResult(
          //     '${type}', providerId, email, name
          //   ); true;`
          // );
          break;
        }

        // FCM 토큰 조회 후 웹으로 전달
        // TODO: @react-native-firebase/messaging SDK 연동 필요
        case BRIDGE_TYPES.UPDATE_FCM_TOKEN: {
          console.log('[UPDATE_FCM_TOKEN] Firebase SDK 연동 후 구현');
          // SDK 연동 후 아래 패턴으로 콜백:
          // const token = await messaging().getToken();
          // webViewRef.current?.injectJavaScript(
          //   `window.saveFcmToken && window.saveFcmToken('${token}'); true;`
          // );
          break;
        }

        // FCM 토픽 구독
        // TODO: @react-native-firebase/messaging SDK 연동 필요
        case BRIDGE_TYPES.SUBSCRIBE_TOPIC: {
          console.log('[SUBSCRIBE_TOPIC] topic:', message.data?.topic);
          // await messaging().subscribeToTopic(message.data.topic);
          break;
        }

        // FCM 토픽 구독 해제
        // TODO: @react-native-firebase/messaging SDK 연동 필요
        case BRIDGE_TYPES.UNSUBSCRIBE_TOPIC: {
          console.log('[UNSUBSCRIBE_TOPIC] topic:', message.data?.topic);
          // await messaging().unsubscribeFromTopic(message.data.topic);
          break;
        }

        // 범용 데이터 저장
        case BRIDGE_TYPES.SAVE_DATA: {
          const {key, value} = message.data;
          await StorageService.saveWebData(key, value);
          break;
        }

        // 범용 데이터 조회 — getDataResult(key, data) 콜백으로 반환
        case BRIDGE_TYPES.GET_DATA: {
          const {key} = message.data;
          const value = await StorageService.getWebData(key);
          webViewRef.current?.injectJavaScript(
            `window.getDataResult && window.getDataResult(${JSON.stringify(key)}, ${JSON.stringify(value)}); true;`,
          );
          break;
        }

        // 범용 데이터 삭제
        case BRIDGE_TYPES.DELETE_DATA: {
          const {key} = message.data;
          await StorageService.deleteWebData(key);
          break;
        }

        // 외부 URL 열기
        case BRIDGE_TYPES.NAVIGATE: {
          if (message.data?.url) {
            Linking.openURL(message.data.url);
          }
          break;
        }

        // 네이티브 공유 시트
        case BRIDGE_TYPES.SHARE: {
          Share.share({
            message: message.data?.message || '',
            title: message.data?.title || '',
          });
          break;
        }

        // 햅틱 피드백
        // TODO: react-native-haptic-feedback SDK 연동 필요
        case BRIDGE_TYPES.HAPTIC: {
          console.log('[HAPTIC] style:', message.data?.style);
          break;
        }

        default:
          console.log('[WebView Message]', message);
      }
    } catch (error) {
      console.warn('[WebView] 메시지 파싱 실패:', error);
    }
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  if (hasError) {
    return <ErrorFallback onRetry={handleRetry} />;
  }

  // 스토리지 로딩 완료 전 — 스피너 표시
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
        // 네비게이션 상태 추적
        onNavigationStateChange={navState => setCanGoBack(navState.canGoBack)}
        // iOS 스와이프 뒤로가기
        allowsBackForwardNavigationGestures={true}
        // DOM Storage 활성화 (Zustand persist, JWT 저장)
        domStorageEnabled={true}
        // 바운스 효과 제거
        bounces={false}
        overScrollMode="never"
        // 줌 비활성화
        scalesPageToFit={false}
        // User-Agent에 앱 식별자 추가
        applicationNameForUserAgent={APP_NAME}
        // URL 허용 목록
        originWhitelist={['https://*', 'http://*']}
        // 캐시 설정
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        // 페이지 로드 전: 쿠키 + window.BarogagiApp 주입
        injectedJavaScriptBeforeContentLoaded={injectedJSBeforeContent}
        // 웹 → 네이티브 메시지 수신
        onMessage={handleMessage}
        // 로딩 상태
        onLoadStart={() => {
          if (!initialLoaded) {
            setIsLoading(true);
          }
        }}
        onLoadEnd={() => {
          setIsLoading(false);
          setInitialLoaded(true);
        }}
        // 에러 핸들링
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
