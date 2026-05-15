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

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  BackHandler,
  ActivityIndicator,
  StyleSheet,
  View,
  Linking,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorFallback from '../components/ErrorFallback';
import { WEB_APP_URL, APP_NAME, APP_HOST } from '../constants/config';
import { StorageService } from '../services/StorageService';
import { buildCookieInjectionJS } from '../utils/cookieInjector';
import { BRIDGE_INTERFACE_JS } from '../utils/bridgeInterface';
import {
  isBridgeNamespace,
  storageDelete,
  storageGet,
  storageSet,
  warmupSecureStorage,
} from '../services/bridgeStorage';

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
      setInitData({ ...loginInfo, autoLogin });
    };
    loadInitData();
  }, []);

  /**
   * §2 — EncryptedStorage 첫 접근 시 키 derivation 비용을 미리 발생시켜
   * 부팅 직후 웹이 secure 토큰 4종을 동시 조회할 때의 white screen 시간을 단축.
   */
  useEffect(() => {
    warmupSecureStorage();
  }, []);

  /**
   * §5 — Android 하드웨어 뒤로가기 처리.
   *
   * SPA + WebView 조합에서 webView.goBack()은 React Router 변경을 못 따라가므로
   * 이벤트를 항상 swallow(return true)하고, 웹에 HARDWARE_BACK 메시지를 dispatch.
   * 웹의 nativeBackHandler가 모달 stack → router back → exitApp 순으로 결정하고,
   * 더 처리할 게 없으면 BarogagiApp.exitApp() RPC를 호출. 그때만 앱이 종료됨.
   */
  useEffect(() => {
    const onBackPress = () => {
      webViewRef.current?.injectJavaScript(`
        window.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'HARDWARE_BACK' })
        }));
        true;
      `);
      return true;
    };
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );
    return () => subscription.remove();
  }, []);

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
   * 웹 → 네이티브 RPC 메시지 핸들러.
   *
   * RN_BRIDGE.md §7 RPC 통신 프로토콜.
   *
   * 요청 포맷: { id: number, method: string, payload: object }
   * 응답 포맷: window.__bridgeResolve(id, ok, value)를 injectJavaScript로 호출
   *
   * 응답은 반드시 보내야 함. 누락 시 웹 측 Promise가 3초 후 timeout으로 reject됨.
   *
   * method 분기는 후속 커밋(§1 storage, §4 openExternal, §5 exitApp)에서 추가됨.
   * 각 case는 자체적으로 respond(true, value)를 호출한 뒤 break.
   */
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    let parsed: { id?: unknown; method?: unknown; payload?: Record<string, unknown> };
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      console.warn('[bridge] 메시지 파싱 실패:', e);
      return;
    }

    const { id, method, payload } = parsed;
    // RN→웹 dispatch가 echo로 돌아오는 케이스(HARDWARE_BACK 등) 방어
    if (typeof id !== 'number' || typeof method !== 'string') return;

    const respond = (ok: boolean, value: unknown) => {
      webViewRef.current?.injectJavaScript(
        `window.__bridgeResolve && window.__bridgeResolve(${id}, ${ok}, ${JSON.stringify(
          value,
        )}); true;`,
      );
    };

    try {
      switch (method) {
        case 'getData': {
          const p = (payload ?? {}) as { ns?: unknown; key?: unknown };
          if (!isBridgeNamespace(p.ns) || typeof p.key !== 'string') {
            throw new Error('Invalid getData payload');
          }
          const value = await storageGet(p.ns, p.key);
          respond(true, value);
          break;
        }
        case 'saveData': {
          const p = (payload ?? {}) as {
            ns?: unknown;
            key?: unknown;
            value?: unknown;
          };
          if (
            !isBridgeNamespace(p.ns) ||
            typeof p.key !== 'string' ||
            typeof p.value !== 'string'
          ) {
            throw new Error('Invalid saveData payload');
          }
          await storageSet(p.ns, p.key, p.value);
          respond(true, null);
          break;
        }
        case 'deleteData': {
          const p = (payload ?? {}) as { ns?: unknown; key?: unknown };
          if (!isBridgeNamespace(p.ns) || typeof p.key !== 'string') {
            throw new Error('Invalid deleteData payload');
          }
          await storageDelete(p.ns, p.key);
          respond(true, null);
          break;
        }
        case 'openExternal': {
          const p = (payload ?? {}) as { url?: unknown };
          if (typeof p.url !== 'string') {
            throw new Error('Invalid openExternal payload');
          }
          await Linking.openURL(p.url);
          respond(true, null);
          break;
        }
        case 'exitApp': {
          // 응답을 먼저 보내야 웹 측 Promise가 timeout 없이 resolve 됨
          respond(true, null);
          BackHandler.exitApp();
          break;
        }
        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (e) {
      respond(false, String(e));
    }
  }, []);

  /**
   * §4 — 외부 호스트로의 네비게이션을 시스템 브라우저로 위임.
   *
   * APP_HOST(=WEB_APP_URL의 호스트명)와 about: 스킴만 WebView 내부 로딩 허용.
   * 외부 호스트는 Linking.openURL로 위임하고 WebView 내부 로딩은 차단.
   */
  const shouldAllowNavigation = useCallback((req: { url: string }): boolean => {
    if (req.url.startsWith('about:')) return true;
    try {
      const u = new URL(req.url);
      if (u.hostname === APP_HOST) return true;
    } catch {
      return false;
    }
    Linking.openURL(req.url);
    return false;
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webView}
        // iOS 스와이프 뒤로가기 제스처 활성화
        allowsBackForwardNavigationGestures={true}
        // localStorage, sessionStorage 활성화 (Zustand persist, JWT 저장에 필요)
        domStorageEnabled={true}
        // OAuth/결제 위젯이 서드파티 쿠키에 의존하는 경우 대비 (Android 기본 false)
        thirdPartyCookiesEnabled={true}
        // window.open('_blank') 호출 시 새 WebView 생성을 막아 링크 무반응 방지
        setSupportMultipleWindows={false}
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
        // 외부 호스트 네비게이션 차단 (§4)
        onShouldStartLoadWithRequest={shouldAllowNavigation}
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
  },
  centered: {
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
