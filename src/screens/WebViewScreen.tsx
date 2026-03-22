/**
 * @file WebViewScreen.tsx
 * @description 앱의 메인 화면. barogagi-front 웹앱을 WebView로 렌더링합니다.
 *
 * ## 전체 동작 흐름
 *
 * [앱 시작]
 *   1. AsyncStorage에서 로그인 정보, 자동 로그인 설정을 로드 (initData)
 *   2. initData 로딩 완료 전에는 로딩 스피너 표시
 *
 * [WebView 렌더링]
 *   3. injectedJavaScriptBeforeContentLoaded 실행 (페이지 파싱 전)
 *      - 쿠키 주입: safe area, 사용자 정보, 앱 버전, 다크모드 등
 *      - window.BarogagiApp 인터페이스 등록
 *   4. 웹앱(barogagi-front) 로드 시작
 *   5. 웹앱이 document.cookie를 읽어 초기 상태 설정
 *
 * [런타임 브릿지]
 *   - 웹 → 네이티브: window.BarogagiApp.xxx() → postMessage → handleMessage()
 *   - 네이티브 → 웹: webViewRef.current.injectJavaScript() → 웹의 콜백 함수 호출
 *
 * ## 파일 구조와의 연관
 * - bridgeTypes.ts   : handleMessage의 switch case 타입 상수
 * - StorageService.ts: AsyncStorage 읽기/쓰기 추상화
 * - cookieInjector.ts: 쿠키 주입 JS 코드 생성
 * - bridgeInterface.ts: window.BarogagiApp 주입 JS 코드
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
import {buildCookieInjectionJS} from '../utils/cookieInjector';
import {BRIDGE_INTERFACE_JS} from '../utils/bridgeInterface';

/** 앱 시작 시 AsyncStorage에서 로드하는 초기 데이터 타입 */
interface InitData {
  providerId: string;
  email: string;
  name: string;
  autoLogin: boolean;
}

const WebViewScreen = () => {
  /** WebView 인스턴스 참조 — goBack(), injectJavaScript() 등 직접 제어에 사용 */
  const webViewRef = useRef<WebView>(null);

  /**
   * 기기의 safe area 인셋 값 (단위: px).
   * iOS 노치/Dynamic Island/홈 인디케이터, Android 시스템 바 높이가 반영됩니다.
   * 이 값을 쿠키로 전달해 웹앱이 겹침 없이 레이아웃을 구성할 수 있게 합니다.
   */
  const insets = useSafeAreaInsets();

  /** WebView 내 현재 페이지가 뒤로 갈 수 있는지 여부 (Android 뒤로가기 버튼 제어용) */
  const [canGoBack, setCanGoBack] = useState(false);

  /** 로딩 스피너 표시 여부 */
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 최초 페이지 로드 완료 여부.
   * SPA(Single Page Application)에서는 페이지 이동 시마다 onLoadStart가 재트리거됩니다.
   * 이 플래그가 true가 된 이후에는 onLoadStart에서 isLoading을 true로 올리지 않아
   * 페이지 이동 때마다 스피너가 반복 표시되는 문제를 방지합니다.
   */
  const [initialLoaded, setInitialLoaded] = useState(false);

  /** 페이지 로드 에러 여부 — true가 되면 ErrorFallback 컴포넌트를 표시합니다 */
  const [hasError, setHasError] = useState(false);

  /**
   * AsyncStorage에서 로드한 초기 데이터.
   * null이면 아직 로딩 중이므로 WebView를 렌더링하지 않습니다.
   * (쿠키 주입 전에 WebView가 로드되면 쿠키가 비어있게 되므로 반드시 기다려야 함)
   */
  const [initData, setInitData] = useState<InitData | null>(null);

  /**
   * 앱 시작 시 AsyncStorage에서 초기 데이터를 로드합니다.
   * 두 개의 비동기 작업을 Promise.all로 병렬 실행해 대기 시간을 최소화합니다.
   */
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

  /**
   * Android 하드웨어 뒤로가기 버튼 처리.
   * WebView 내 이전 페이지가 있으면 goBack()을 호출하고,
   * 더 이상 뒤로 갈 페이지가 없으면 기본 동작(앱 종료)을 수행합니다.
   *
   * canGoBack 상태가 변경될 때마다 구독을 재등록합니다.
   */
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // 이벤트 소비 — 앱 종료 막음
      }
      return false; // 기본 동작 허용 — 앱 종료
    };
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );
    return () => subscription.remove();
  }, [canGoBack]);

  /**
   * WebView 로드 전 주입할 JS 코드를 조합합니다.
   *
   * initData 또는 insets 값이 변경될 때만 재계산합니다 (useMemo).
   * 두 부분으로 구성됩니다:
   *   1. 쿠키 주입 JS (buildCookieInjectionJS)
   *   2. window.BarogagiApp 인터페이스 정의 JS (BRIDGE_INTERFACE_JS)
   *
   * initData가 null이면 아직 스토리지 로딩 중이므로 'true;'만 반환합니다.
   * (injectedJavaScriptBeforeContentLoaded는 반드시 truthy 값으로 끝나야 함)
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

  /**
   * 웹 → 네이티브 메시지 수신 핸들러.
   * 웹앱에서 window.BarogagiApp.xxx()를 호출하면 이 함수가 트리거됩니다.
   *
   * message 구조: { type: string, data: object }
   * type은 BRIDGE_TYPES 상수값과 일치해야 합니다.
   *
   * useCallback으로 감싸 불필요한 재생성을 방지합니다.
   */
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      switch (message.type) {
        /**
         * [LOGIN] 웹 로그인 완료 후 사용자 정보를 앱 스토리지에 저장합니다.
         * 다음 앱 실행 시 이 정보가 쿠키로 웹에 자동 전달됩니다.
         *
         * 웹에서 호출: window.BarogagiApp.login(provider_id, email, name)
         */
        case BRIDGE_TYPES.LOGIN: {
          const {provider_id, email, name} = message.data;
          await StorageService.saveLoginInfo(provider_id, email, name);
          break;
        }

        /**
         * [LOGOUT] 앱 스토리지에서 사용자 정보를 초기화합니다.
         * 웹의 세션/쿠키 정리는 웹앱에서 별도로 처리해야 합니다.
         *
         * 웹에서 호출: window.BarogagiApp.logout()
         */
        case BRIDGE_TYPES.LOGOUT: {
          await StorageService.clearLoginInfo();
          break;
        }

        /**
         * [SNS_LOGIN] 네이티브 SNS SDK로 로그인을 처리합니다.
         * 완료 후 window.snsLoginResult(type, provider_id, email, name)를 웹에 콜백합니다.
         *
         * 웹에서 호출: window.BarogagiApp.snsLogin('kakao' | 'naver' | 'google')
         *
         * TODO: 각 SNS SDK 패키지 설치 후 구현 필요
         *   - 카카오: react-native-kakao-login
         *   - 네이버: @react-native-seoul/naver-login
         *   - 구글: @react-native-google-signin/google-signin
         */
        case BRIDGE_TYPES.SNS_LOGIN: {
          const {type} = message.data;
          console.log('[SNS_LOGIN] type:', type);
          // SDK 연동 후 아래 패턴으로 결과를 웹에 전달하세요:
          // webViewRef.current?.injectJavaScript(
          //   `window.snsLoginResult && window.snsLoginResult(
          //     '${type}', providerId, email, name
          //   ); true;`
          // );
          break;
        }

        /**
         * [UPDATE_FCM_TOKEN] Firebase에서 FCM 토큰을 발급받아 웹에 전달합니다.
         * 완료 후 window.saveFcmToken(token)을 웹에 콜백합니다.
         * 웹은 이 토큰을 서버에 등록해 푸시 알림 수신에 사용합니다.
         *
         * 웹에서 호출: window.BarogagiApp.updateFcmToken()
         *
         * TODO: @react-native-firebase/messaging 설치 후 구현 필요
         */
        case BRIDGE_TYPES.UPDATE_FCM_TOKEN: {
          console.log('[UPDATE_FCM_TOKEN] Firebase SDK 연동 후 구현');
          // SDK 연동 후 아래 패턴으로 결과를 웹에 전달하세요:
          // const token = await messaging().getToken();
          // webViewRef.current?.injectJavaScript(
          //   `window.saveFcmToken && window.saveFcmToken('${token}'); true;`
          // );
          break;
        }

        /**
         * [SUBSCRIBE_TOPIC] 특정 FCM 토픽을 구독합니다.
         * 해당 토픽으로 발송된 푸시 알림을 수신할 수 있습니다.
         *
         * 웹에서 호출: window.BarogagiApp.subscribeTopic('notice')
         *
         * TODO: @react-native-firebase/messaging 설치 후 구현 필요
         */
        case BRIDGE_TYPES.SUBSCRIBE_TOPIC: {
          console.log('[SUBSCRIBE_TOPIC] topic:', message.data?.topic);
          // await messaging().subscribeToTopic(message.data.topic);
          break;
        }

        /**
         * [UNSUBSCRIBE_TOPIC] FCM 토픽 구독을 해제합니다.
         *
         * 웹에서 호출: window.BarogagiApp.unsubscribeTopic('notice')
         *
         * TODO: @react-native-firebase/messaging 설치 후 구현 필요
         */
        case BRIDGE_TYPES.UNSUBSCRIBE_TOPIC: {
          console.log('[UNSUBSCRIBE_TOPIC] topic:', message.data?.topic);
          // await messaging().unsubscribeFromTopic(message.data.topic);
          break;
        }

        /**
         * [SAVE_DATA] 웹에서 전달한 key-value를 앱 스토리지에 저장합니다.
         * 앱 내부 키와의 충돌 방지를 위해 'web_data_' 접두사가 붙습니다.
         *
         * 웹에서 호출: window.BarogagiApp.saveData('myKey', 'myValue')
         */
        case BRIDGE_TYPES.SAVE_DATA: {
          const {key, value} = message.data;
          await StorageService.saveWebData(key, value);
          break;
        }

        /**
         * [GET_DATA] 앱 스토리지에서 데이터를 조회해 웹에 콜백으로 반환합니다.
         * 결과는 window.getDataResult(key, data)로 전달됩니다.
         * 값이 없으면 data에 null이 전달됩니다.
         *
         * 웹에서 호출: window.BarogagiApp.getData('myKey')
         * 웹 콜백 구현: window.getDataResult = function(key, data) { ... }
         */
        case BRIDGE_TYPES.GET_DATA: {
          const {key} = message.data;
          const value = await StorageService.getWebData(key);
          webViewRef.current?.injectJavaScript(
            `window.getDataResult && window.getDataResult(${JSON.stringify(key)}, ${JSON.stringify(value)}); true;`,
          );
          break;
        }

        /**
         * [DELETE_DATA] 앱 스토리지에서 특정 키의 데이터를 삭제합니다.
         *
         * 웹에서 호출: window.BarogagiApp.deleteData('myKey')
         */
        case BRIDGE_TYPES.DELETE_DATA: {
          const {key} = message.data;
          await StorageService.deleteWebData(key);
          break;
        }

        /**
         * [NAVIGATE] WebView 내부에서 열 수 없는 외부 URL을 기기 기본 브라우저로 엽니다.
         * 예: 결제 페이지, 약관 링크, 외부 서비스 연결 등
         *
         * 웹에서 호출: window.sendToNative('NAVIGATE', { url: 'https://...' })
         */
        case BRIDGE_TYPES.NAVIGATE: {
          if (message.data?.url) {
            Linking.openURL(message.data.url);
          }
          break;
        }

        /**
         * [SHARE] iOS/Android 네이티브 공유 시트를 엽니다.
         * 사용자가 카카오톡, 메시지, 클립보드 등 원하는 앱으로 공유할 수 있습니다.
         *
         * 웹에서 호출: window.sendToNative('SHARE', { message: '...', title: '...' })
         */
        case BRIDGE_TYPES.SHARE: {
          Share.share({
            message: message.data?.message || '',
            title: message.data?.title || '',
          });
          break;
        }

        /**
         * [HAPTIC] 기기 햅틱(진동) 피드백을 트리거합니다.
         * 버튼 클릭, 에러 알림 등에 물리적 피드백을 줄 때 사용합니다.
         *
         * 웹에서 호출: window.sendToNative('HAPTIC', { style: 'light' })
         *
         * TODO: react-native-haptic-feedback 설치 후 구현 필요
         */
        case BRIDGE_TYPES.HAPTIC: {
          console.log('[HAPTIC] style:', message.data?.style);
          break;
        }

        default:
          console.log('[WebView] 알 수 없는 메시지 타입:', message);
      }
    } catch (error) {
      console.warn('[WebView] 메시지 파싱 실패:', error);
    }
  }, []);

  /**
   * 에러 발생 시 재시도 핸들러.
   * ErrorFallback 컴포넌트의 재시도 버튼과 연결됩니다.
   */
  const handleRetry = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  // 페이지 로드 에러 시 에러 폴백 UI 표시
  if (hasError) {
    return <ErrorFallback onRetry={handleRetry} />;
  }

  // AsyncStorage 로딩 완료 전 — 쿠키 주입 준비가 안 됐으므로 WebView 렌더링 보류
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
        // WebView 내 페이지 이동 시 canGoBack 상태를 업데이트합니다
        onNavigationStateChange={navState => setCanGoBack(navState.canGoBack)}
        // iOS 스와이프 뒤로가기 제스처 활성화
        allowsBackForwardNavigationGestures={true}
        // localStorage, sessionStorage 활성화 (Zustand persist, JWT 저장에 필요)
        domStorageEnabled={true}
        // iOS 스크롤 바운스 효과 제거
        bounces={false}
        // Android 오버스크롤 효과 제거
        overScrollMode="never"
        // 핀치 줌 비활성화 (웹앱 자체 viewport 설정에 위임)
        scalesPageToFit={false}
        // User-Agent에 'BarogagiApp'을 추가해 웹앱이 앱 환경임을 인식할 수 있게 합니다
        applicationNameForUserAgent={APP_NAME}
        // https, http URL만 허용 (javascript:, data: 등의 스킴 차단)
        originWhitelist={['https://*', 'http://*']}
        // 페이지 캐시 활성화 — 재방문 시 로딩 속도 향상
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        /**
         * 페이지 파싱 전 실행 — 쿠키 주입 + window.BarogagiApp 등록
         * 이 타이밍에 실행해야 웹앱 React 초기화 시점에 쿠키와 인터페이스가 준비됩니다.
         */
        injectedJavaScriptBeforeContentLoaded={injectedJSBeforeContent}
        // 웹 → 네이티브 메시지 수신
        onMessage={handleMessage}
        /**
         * SPA 로딩 스피너 처리:
         * - initialLoaded가 false인 최초 1회만 스피너를 표시합니다.
         * - SPA 페이지 이동 시 onLoadStart가 반복 호출되지만, initialLoaded가 true이므로
         *   스피너가 다시 표시되지 않습니다.
         */
        onLoadStart={() => {
          if (!initialLoaded) {
            setIsLoading(true);
          }
        }}
        onLoadEnd={() => {
          setIsLoading(false);
          setInitialLoaded(true);
        }}
        // 네트워크 오류, 페이지 없음 등 로드 실패 시 에러 폴백으로 전환
        onError={() => setHasError(true)}
      />
      {/* 최초 로딩 중에만 표시되는 스피너 오버레이 */}
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
  /** 초기 로딩 시 화면 전체를 덮는 흰색 오버레이 */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});

export default WebViewScreen;
