# CLAUDE.md

## 프로젝트 개요
barogagi-app은 React Native WebView 기반의 웹앱 래퍼.
기존 웹 프로젝트(barogagi-front)를 네이티브 앱으로 감싸는 역할.

**타깃 플랫폼: Android only** (현 단계).
브릿지 명세 원본은 `RN_BRIDGE.md` 참고.

## 핵심 정보
- **웹 프로젝트**: T-BluePot/barogagi-front (별도 레포)
- **프로덕션 URL**: https://fitpl.xyz/auth
- **개발 서버**: localhost:8080 (barogagi-front의 Vite dev server)
- **앱 식별자**: BarogagiApp (User-Agent에 추가됨)

## 기술 스택
- React Native 0.84
- react-native-webview
- react-native-mmkv — persistent storage
- react-native-encrypted-storage — secure storage (인증 토큰)
- react-native-safe-area-context
- TypeScript

## 주요 명령어
- `npx react-native run-android` — Android 에뮬레이터 실행
- `npx react-native run-ios` — iOS 시뮬레이터 실행 (현 단계 비대상)
- `cd ios && pod install` — iOS 의존성 설치

## 구조
```
src/
  constants/
    config.ts          — WEB_APP_URL, APP_HOST, APP_NAME 등 상수
  services/
    bridgeStorage.ts   — 3종 namespace storage 백엔드 (secure/persistent/session)
  utils/
    bridgeInterface.ts — window.BarogagiApp + __bridgeResolve RPC 인터페이스 inject JS
  screens/
    WebViewScreen.tsx  — 메인 WebView 화면 (RPC 핸들러, 백 처리, safe area inject)
  components/
    ErrorFallback.tsx  — 에러 폴백 UI
```

## RPC 브릿지 (window.BarogagiApp)

웹에서 `window.BarogagiApp.method(...)` 호출 → `{id, method, payload}`로 직렬화 →
`ReactNativeWebView.postMessage`. 응답은 `window.__bridgeResolve(id, ok, value)`로 회신.
3초 내 응답 없으면 웹 측 Promise가 timeout으로 reject.

| Method | 시그니처 | 설명 |
|---|---|---|
| `getData` | `(ns, key) => Promise<string \| null>` | namespace에서 값 조회 |
| `saveData` | `(ns, key, value) => Promise<void>` | namespace에 값 저장 |
| `deleteData` | `(ns, key) => Promise<void>` | namespace에서 값 삭제 |
| `openExternal` | `(url) => Promise<void>` | 외부 URL을 시스템 브라우저로 |
| `exitApp` | `() => Promise<void>` | 앱 종료 (백 처리 후 웹이 호출) |

### namespace 종류 (RN_BRIDGE.md §1)
- `secure` — EncryptedSharedPreferences. 인증 토큰 4종이 들어감
- `persistent` — MMKV. 영속 데이터 (최근 검색 등)
- `session` — in-memory `Map`. **앱 종료 시 사라져야 하는 draft 전용**
  (회원가입/일정 작성 진행 중 잔존 방지)

## 하드웨어 백 버튼 (Android)

`BackHandler`는 항상 `return true`로 swallow (앱 종료 차단).
RN이 `HARDWARE_BACK` 메시지를 웹에 dispatch → 웹의 nativeBackHandler가
모달 → 라우터 back → 앱 종료 순으로 결정 → 종료할 때만 `BarogagiApp.exitApp()` 호출 →
RN이 `BackHandler.exitApp()` 실행.

## Safe Area Inset

`useSafeAreaInsets`로 측정한 inset을 CSS 변수로 inject:
```
document.documentElement.style.setProperty('--sai-top',    '<n>px');
document.documentElement.style.setProperty('--sai-bottom', '<n>px');
document.documentElement.style.setProperty('--sai-left',   '<n>px');
document.documentElement.style.setProperty('--sai-right',  '<n>px');
```
inset 변경 시(회전) + `onLoadEnd`에서 재주입.
웹은 `.pt-safe / .pb-safe / .pl-safe / .pr-safe` utility class로 소비.

## 외부 링크 차단

`onShouldStartLoadWithRequest`로 `APP_HOST`(= `WEB_APP_URL`의 hostname) 외 호스트는
`Linking.openURL`로 위임하고 WebView 내부 로딩은 차단.
웹 측 `openExternal` RPC 호출도 동일 경로(`Linking.openURL`)로 처리.

## 네이밍 컨벤션
- 파일명: PascalCase (WebViewScreen.tsx)
- 변수명: camelCase
- 상수명: UPPER_SNAKE_CASE

## 커밋 컨벤션
- feat: 새 기능 추가
- fix: 버그 수정
- chore: 빌드·설정·패키지 관리
- refactor: 동작 변경 없는 코드 개선
- docs: 문서만 변경
- test: 테스트 추가·수정

## 브랜치 전략
release ← main ← dev ← feat/*
