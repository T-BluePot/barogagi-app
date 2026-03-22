import React, {useRef, useState, useEffect, useCallback} from 'react';
import {
  Platform,
  BackHandler,
  ActivityIndicator,
  StyleSheet,
  View,
  Linking,
  Share,
} from 'react-native';
import {WebView, WebViewMessageEvent} from 'react-native-webview';
import ErrorFallback from '../components/ErrorFallback';
import {WEB_APP_URL, APP_NAME} from '../constants/config';

// 웹앱에 주입할 JavaScript — 네이티브 브릿지 설정
const INJECTED_JAVASCRIPT = `
  (function() {
    // 네이티브 앱 여부 플래그
    window.isNativeApp = true;
    window.appPlatform = '${Platform.OS}';

    // 네이티브로 메시지 전송하는 헬퍼 함수
    window.sendToNative = function(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
      }
    };
  })();
  true;
`;

const WebViewScreen = () => {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Android 하드웨어 뒤로가기 처리
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false; // 기본 동작 (앱 종료)
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );
    return () => subscription.remove();
  }, [canGoBack]);

  // 웹 → 네이티브 메시지 핸들러
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      switch (message.type) {
        case 'NAVIGATE':
          // 외부 URL 열기
          if (message.data?.url) {
            Linking.openURL(message.data.url);
          }
          break;
        case 'SHARE':
          // 네이티브 공유 시트
          Share.share({
            message: message.data?.message || '',
            title: message.data?.title || '',
          });
          break;
        case 'HAPTIC':
          // 햅틱 피드백 (추후 구현 예정)
          console.log('[Haptic] type:', message.data?.style);
          break;
        default:
          console.log('[WebView Message]', message);
      }
    } catch (error) {
      console.warn('[WebView] 메시지 파싱 실패:', error);
    }
  };

  // 에러 발생 시 재시도
  const handleRetry = () => {
    setHasError(false);
    webViewRef.current?.reload();
  };

  if (hasError) {
    return <ErrorFallback onRetry={handleRetry} />;
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
        // DOM Storage 활성화 (JWT 토큰, Zustand persist 저장용)
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
        // 웹 ↔ 네이티브 브릿지
        injectedJavaScript={INJECTED_JAVASCRIPT}
        onMessage={handleMessage}
        // 로딩 상태
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        // 에러 핸들링
        onError={() => setHasError(true)}
      />
      {/* 로딩 인디케이터 */}
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});

export default WebViewScreen;
