# CLAUDE.md

## 프로젝트 개요
barogagi-app은 React Native WebView 기반의 웹앱 래퍼입니다.
기존 웹 프로젝트(barogagi-front)를 네이티브 앱으로 감싸는 역할을 합니다.

## 핵심 정보
- **웹 프로젝트**: T-BluePot/barogagi-front (별도 레포)
- **프로덕션 URL**: https://barogagi.xyz/auth
- **개발 서버**: localhost:8080 (barogagi-front의 Vite dev server)
- **앱 식별자**: BarogagiApp (User-Agent에 추가됨)

## 기술 스택
- React Native 0.84
- react-native-webview
- react-native-safe-area-context
- @react-native-async-storage/async-storage
- TypeScript

## 주요 명령어
- `npx react-native run-ios` — iOS 시뮬레이터 실행
- `npx react-native run-android` — Android 에뮬레이터 실행
- `cd ios && pod install` — iOS 의존성 설치

## 구조
```
src/
  constants/
    config.ts         — URL, 앱 버전 등 설정 상수
    bridgeTypes.ts    — 브릿지 메시지 타입 상수
  services/
    StorageService.ts — AsyncStorage 래퍼 (로그인 정보, 범용 key-value)
  utils/
    cookieInjector.ts — 쿠키 주입 JS 빌더
    bridgeInterface.ts — window.BarogagiApp 주입 JS
  screens/
    WebViewScreen.tsx — 메인 WebView 화면 (브릿지 핸들러 포함)
  components/
    ErrorFallback.tsx — 에러 폴백 UI
```

## 웹 → 네이티브 쿠키 (앱 시작 시 자동 주입)

WebView 로드 전 `injectedJavaScriptBeforeContentLoaded`로 `document.cookie`에 주입됨.
웹 앱은 `document.cookie`를 파싱해 사용.

| 쿠키 Key | 값 | 출처 |
|---|---|---|
| `safe_area_top` | 상단 safe area 높이 (px) | useSafeAreaInsets |
| `safe_area_bottom` | 하단 safe area 높이 (px) | useSafeAreaInsets |
| `provider_id` | 로그인한 사용자 고유 ID | AsyncStorage |
| `email` | 로그인한 사용자 이메일 | AsyncStorage |
| `name` | 로그인한 사용자 이름 | AsyncStorage |
| `auto_login` | 자동 로그인 여부 (`true`/`false`) | AsyncStorage |
| `app_version` | 앱 버전 | config.ts |
| `app_darkMode` | 시스템 다크모드 여부 (`true`/`false`) | Appearance API |
| `app_platform` | 플랫폼 (`ios`/`android`) | Platform API |

## 웹 → 네이티브 브릿지 (window.BarogagiApp)

웹에서 `window.BarogagiApp.메서드명()`으로 호출.

```javascript
// 로그인 완료 후 앱에 사용자 정보 저장
window.BarogagiApp.login(provider_id, email, name)

// 로그아웃 — 앱 저장 정보 초기화
window.BarogagiApp.logout()

// SNS 로그인 요청 ("kakao" | "naver" | "google")
window.BarogagiApp.snsLogin(type)

// FCM 토큰 갱신 요청
window.BarogagiApp.updateFcmToken()

// FCM 토픽 구독 / 해제
window.BarogagiApp.subscribeTopic(topic)
window.BarogagiApp.unsubscribeTopic(topic)

// 앱 스토리지 저장 / 조회 / 삭제
window.BarogagiApp.saveData(key, value)
window.BarogagiApp.getData(key)       // → getDataResult(key, data) 콜백
window.BarogagiApp.deleteData(key)
```

## 네이티브 → 웹 콜백 (웹에서 구현 필요)

네이티브가 결과를 돌려줄 때 `injectJavaScript`로 호출.
웹 앱은 아래 함수를 전역으로 정의해야 함.

```javascript
// SNS 로그인 완료 콜백
window.snsLoginResult(type, provider_id, email, name)

// getData 결과 콜백
window.getDataResult(key, data)

// FCM 토큰 수신 콜백
window.saveFcmToken(token)
```

## FCM / SNS SDK 연동 현황
- SNS 로그인, FCM 관련 브릿지 핸들러는 **골격만 구현된 상태**
- SDK 패키지 설치 후 `WebViewScreen.tsx`의 TODO 주석 부분을 채워야 함
  - SNS: `@react-native-google-signin/google-signin`, Kakao SDK, etc.
  - FCM: `@react-native-firebase/messaging`

## 네이밍 컨벤션
- 파일명: PascalCase (WebViewScreen.tsx)
- 변수명: camelCase
- 상수명: UPPER_SNAKE_CASE

## 커밋 컨벤션
- feat: 새로운 기능
- fix: 버그 수정
- chore: 설정 변경
- refactor: 리팩토링
- docs: 문서

## 브랜치 전략
release ← main ← dev ← feat/*
