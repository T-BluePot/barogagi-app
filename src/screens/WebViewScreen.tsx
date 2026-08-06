/**
 * @file WebViewScreen.tsx
 * @description 앱의 메인 화면. barogagi-front 웹앱을 WebView로 렌더링.
 *
 * RN_BRIDGE.md 명세에 따른 RPC 기반 브릿지.
 *
 * - 웹 → 네이티브: window.BarogagiApp.method(...) → postMessage → handleMessage
 *   응답: window.__bridgeResolve(id, ok, value) (§7)
 * - 네이티브 → 웹: webViewRef.injectJavaScript(...)
 * - RPC method: getData / saveData / deleteData / openExternal / exitApp
 *   + getFcmToken / getDeviceType (FCM) + loginWithOAuth (Custom Tab OAuth)
 * - 하드웨어 백: HARDWARE_BACK 메시지 dispatch, 웹이 결정 (§5)
 * - safe area: --sai-* CSS 변수로 inject (§6)
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  BackHandler,
  ActivityIndicator,
  StyleSheet,
  View,
  Linking,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import ErrorFallback from '../components/ErrorFallback';
import { WEB_APP_URL, APP_NAME, APP_HOST, OAUTH_CALLBACK } from '../constants/config';
import { BRIDGE_INTERFACE_JS } from '../utils/bridgeInterface';
import {
  isBridgeNamespace,
  storageDelete,
  storageGet,
  storageSet,
  warmupSecureStorage,
} from '../services/bridgeStorage';
import { getDeviceType, getFcmToken, initFcm } from '../services/fcm';

/**
 * Android intent:// 스킴을 처리한다.
 *
 * RN Android의 LinkingModule은 내부적으로 `new Intent(ACTION_VIEW, Uri.parse(url))`를
 * 쓰는데, intent://는 `Intent.parseUri(url, URI_INTENT_SCHEME)`로 파싱해야 하는
 * 형식이라 Uri.parse로는 처리할 액티비티가 없어 실패한다.
 * 카카오 JS SDK가 Android에서 공유 시 이 스킴으로 이동하므로 별도 분기가 필요하다.
 *
 * intent://<body>#Intent;scheme=<s>;package=<p>;S.browser_fallback_url=<url>;end;
 * → scheme을 뽑아 `<s>://<body>` 평문 스킴으로 되돌려 연다.
 *
 * 실패 시 fallback URL → 스토어 순으로 내려간다.
 */
const openIntentUrl = async (url: string): Promise<void> => {
  const body = url.slice('intent://'.length).split('#Intent')[0];
  const scheme = url.match(/;scheme=([^;]+)/)?.[1];
  const fallback = url.match(/;S\.browser_fallback_url=([^;]+)/)?.[1];
  const pkg = url.match(/;package=([^;]+)/)?.[1];

  if (scheme) {
    try {
      await Linking.openURL(`${scheme}://${body}`);
      return;
    } catch (e) {
      // 대상 앱(카카오톡 등) 미설치로 추정. 아래 폴백으로 계속 진행.
      console.warn('[nav] 평문 스킴 실패:', scheme, e);
    }
  }

  if (fallback) {
    try {
      await Linking.openURL(decodeURIComponent(fallback));
      return;
    } catch (e) {
      console.warn('[nav] fallback URL 실패:', e);
    }
  }

  if (pkg) {
    try {
      await Linking.openURL(`market://details?id=${pkg}`);
      return;
    } catch (e) {
      console.warn('[nav] 스토어 유도 실패:', e);
    }
  }

  console.warn('[nav] intent 처리 전부 실패:', url);
};

const WebViewScreen = () => {
  /** WebView 인스턴스 참조 — injectJavaScript()/reload() 등 직접 제어에 사용 */
  const webViewRef = useRef<WebView>(null);

  /** 기기의 safe area 인셋 값. §6 CSS 변수 inject에 사용. */
  const insets = useSafeAreaInsets();

  /** 로딩 스피너 표시 여부 */
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 최초 페이지 로드 완료 여부.
   * SPA 페이지 이동 시 onLoadStart가 반복되지만 이 플래그가 true면 스피너 재표시 안 함.
   */
  const [initialLoaded, setInitialLoaded] = useState(false);

  /** 페이지 로드 에러 여부 — true가 되면 ErrorFallback 표시 */
  const [hasError, setHasError] = useState(false);

  /**
   * §2 — EncryptedStorage 첫 접근 시 키 derivation 비용을 미리 발생시켜
   * 부팅 직후 웹이 secure 토큰 4종을 동시 조회할 때의 white screen 시간을 단축.
   */
  useEffect(() => {
    warmupSecureStorage();
  }, []);

  /**
   * FCM 초기화 — 알림 권한 요청 + 토큰 캐시 예열 + 갱신/포그라운드 구독.
   * 언마운트 시 onTokenRefresh/onMessage 구독 해제.
   */
  useEffect(() => {
    const unsubscribe = initFcm();
    return unsubscribe;
  }, []);

  /**
   * §6 — safe area inset을 CSS 변수(--sai-*)로 WebView에 주입.
   *
   * WebView 138+ env(safe-area-inset-*) 회귀 버그(react-native-webview #3828) 대응.
   * 웹의 .pt-safe / .pb-safe / .pl-safe / .pr-safe utility가 max(env(...), var(--sai-*))
   * fallback으로 이 값을 사용.
   *
   * inset이 바뀔 때마다(회전 등) 재주입. onLoadEnd에서도 한 번 더 호출해 새로고침 후
   * 변수 휘발을 방지(아래 onLoadEnd 콜백 참고).
   */
  const injectSafeAreaVars = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      document.documentElement.style.setProperty('--sai-top',    '${insets.top}px');
      document.documentElement.style.setProperty('--sai-bottom', '${insets.bottom}px');
      document.documentElement.style.setProperty('--sai-left',   '${insets.left}px');
      document.documentElement.style.setProperty('--sai-right',  '${insets.right}px');
      true;
    `);
  }, [insets.top, insets.bottom, insets.left, insets.right]);

  useEffect(() => {
    injectSafeAreaVars();
  }, [injectSafeAreaVars]);

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
        case 'loginWithOAuth': {
          // 소셜 로그인 authorizeUrl을 Custom Tab으로 열고, 백엔드가 OAUTH_CALLBACK
          // (custom scheme)으로 302하면 그 콜백 URL 전체를 웹에 그대로 회신.
          // Linking.openURL(풀 브라우저: 상단 주소창 + 하단 네비바) 대신 Custom Tab을 써서
          // 하단 네비바를 없애고 상단은 슬림바(스크롤 시 숨김)로 축소 → 브라우저 UI 노출 최소화.
          // 완료 후엔 메인 WebView(fitpl.xyz)로 복귀하므로 풀 브라우저에 머물지 않음.
          const p = (payload ?? {}) as { url?: unknown };
          if (typeof p.url !== 'string') {
            throw new Error('Invalid loginWithOAuth payload');
          }
          // Custom Tab 지원 브라우저가 없으면 openAuth가 실패하므로 사전 차단.
          if (!(await InAppBrowser.isAvailable())) {
            throw new Error('Custom Tab unavailable');
          }
          // Android Custom Tab은 크롬 쿠키를 공유하므로 카카오/네이버 SSO 세션이 그대로 재사용됨.
          const res = await InAppBrowser.openAuth(p.url, OAUTH_CALLBACK, {
            showTitle: false,
            enableUrlBarHiding: true, // 스크롤 시 상단 주소영역 숨김
            forceCloseOnRedirection: true, // 콜백(OAUTH_CALLBACK) 도달 시 탭 자동 닫힘
          });
          if (res.type === 'success' && res.url) {
            respond(true, res.url);
          } else {
            // 사용자가 탭을 닫음(cancel/dismiss) → 웹은 모달 없이 무시
            respond(false, 'oauth_cancelled');
          }
          break;
        }
        case 'exitApp': {
          // 응답을 먼저 보내야 웹 측 Promise가 timeout 없이 resolve 됨
          respond(true, null);
          BackHandler.exitApp();
          break;
        }
        case 'getFcmToken': {
          // 발급 실패/권한 거부 시에도 throw 없이 null 반환(브릿지 계약)
          const token = await getFcmToken();
          respond(true, token);
          break;
        }
        case 'getDeviceType': {
          respond(true, getDeviceType());
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
   * APP_HOST(=WEB_APP_URL의 호스트명) 및 그 서브도메인(*.APP_HOST), about: 스킴만
   * WebView 내부 로딩 허용. 외부 호스트는 Linking.openURL로 위임하고 내부 로딩은 차단.
   */
  const shouldAllowNavigation = useCallback((req: { url: string }): boolean => {
    if (req.url.startsWith('about:')) return true;

    // intent://는 일반 openURL이 처리하지 못하므로 호스트 판정보다 먼저 분기한다.
    // (intent://send?... 는 new URL()에서 hostname이 'send'로 잡혀 그냥 두면
    //  외부 호스트로 오인돼 openURL로 넘어가고, 거기서 조용히 실패한다.)
    if (req.url.startsWith('intent://')) {
      openIntentUrl(req.url).catch(e =>
        console.warn('[nav] intent 처리 실패:', req.url, e),
      );
      return false;
    }

    try {
      const host = new URL(req.url).hostname;
      // 정확 매치 또는 서브도메인(www.fitpl.xyz 등) 허용. 앞 점(.)으로
      // 'evilfitpl.xyz' 같은 접미사 위장은 배제됨.
      if (host === APP_HOST || host.endsWith('.' + APP_HOST)) return true;
    } catch {
      return false;
    }

    // 실패를 삼키면 원인 추적이 불가능해진다(카카오 공유 무반응 건). 반드시 로깅.
    Linking.openURL(req.url).catch(e =>
      console.warn('[nav] openURL 실패:', req.url, e),
    );
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

  return (
    <View style={styles.container}>
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
         * 페이지 파싱 전 RPC 인터페이스(window.BarogagiApp + __bridgeResolve)를 등록.
         * BeforeContentLoaded여야 웹앱 React 초기화 직전에 window.BarogagiApp이 준비됨.
         */
        injectedJavaScriptBeforeContentLoaded={BRIDGE_INTERFACE_JS}
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
          // 새로고침/SPA 라우팅 시 CSS 변수 휘발 방지를 위해 재주입 (§6)
          injectSafeAreaVars();
          // 최초 콘텐츠 로드 완료 시점에만 네이티브 스플래시 dismiss.
          // 너무 일찍 hide하면 WebView 백그라운드(흰 화면)가 보이므로 onLoadEnd가 적정 타이밍.
          if (!initialLoaded) {
            setInitialLoaded(true);
            BootSplash.hide({ fade: true }).catch((e: unknown) => {
              // Android 네이티브 모듈은 hide를 항상 resolve하므로(이미 숨겨진
              // 상태도 resolve) reject는 예기치 않은 상황. 삼키지 않고 로깅.
              console.warn('[bootsplash] hide 실패:', e);
            });
          }
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
