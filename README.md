# 바로가기 앱 (barogagi-app)

React Native WebView 기반의 네이티브 앱입니다.
웹 프로젝트 [barogagi-front](https://github.com/T-BluePot/barogagi-front)를 iOS/Android 앱으로 감싸는 역할을 합니다.

## 기술 스택

- React Native 0.84
- react-native-webview
- TypeScript

## 프로젝트 구조

```
barogagi-app/
├── src/
│   ├── screens/
│   │   └── WebViewScreen.tsx      # 메인 WebView 화면
│   ├── components/
│   │   └── ErrorFallback.tsx      # 네트워크 에러 시 표시되는 폴백 UI
│   └── constants/
│       └── config.ts              # URL, 앱 이름 등 설정 상수
├── android/                       # Android 네이티브 코드
├── ios/                           # iOS 네이티브 코드
├── App.tsx                        # 앱 진입점 (SafeArea + StatusBar + WebView)
├── index.js                       # React Native 앱 등록
└── package.json
```

### 핵심 파일 설명

| 파일 | 설명 |
|------|------|
| `src/screens/WebViewScreen.tsx` | WebView 렌더링, 웹-네이티브 브릿지 처리, 뒤로가기/로딩/에러 상태 관리 |
| `src/components/ErrorFallback.tsx` | 인터넷 연결 오류 시 "다시 시도" 버튼이 있는 에러 화면 |
| `src/constants/config.ts` | 개발/프로덕션 URL 분기, 앱 이름·버전 상수 |
| `App.tsx` | SafeAreaProvider로 감싼 최상위 컴포넌트 |

## 웹 - 네이티브 브릿지

웹앱에서 네이티브 기능을 호출할 때 사용하는 통신 구조입니다.

### 웹 → 네이티브

웹앱에서 아래 함수를 호출하면 네이티브 앱이 수신합니다:

```javascript
window.sendToNative(type, data)
```

### 지원하는 메시지 타입

| 타입 | 기능 | 예시 |
|------|------|------|
| `NAVIGATE` | 외부 URL을 기본 브라우저로 열기 | `sendToNative('NAVIGATE', { url: 'https://...' })` |
| `SHARE` | 네이티브 공유 시트 호출 | `sendToNative('SHARE', { message: '...', title: '...' })` |
| `HAPTIC` | 햅틱 피드백 (추후 구현) | `sendToNative('HAPTIC', { style: 'light' })` |

### 네이티브가 주입하는 전역 변수

앱이 WebView에 자동으로 주입하는 값들입니다. 웹앱에서 네이티브 환경을 감지할 때 사용합니다.

```javascript
window.isNativeApp    // true
window.appPlatform    // 'ios' 또는 'android'
```

## 환경 설정

### URL 분기

| 환경 | URL |
|------|-----|
| 개발 (Android 에뮬레이터) | `http://10.0.2.2:8080` |
| 개발 (iOS 시뮬레이터) | `http://localhost:8080` |
| 프로덕션 | `https://barogagi.xyz/auth` |

> 개발 시 [barogagi-front](https://github.com/T-BluePot/barogagi-front)의 Vite 개발 서버(`localhost:8080`)가 실행 중이어야 합니다.

### 플랫폼 요구사항

| 플랫폼 | 최소 버전 |
|---------|-----------|
| Android | API 24 (Android 7.0) |
| iOS | 13.0+ |
| Node.js | 22.11.0+ |

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. iOS 추가 설정

```bash
cd ios && pod install && cd ..
```

### 3. 앱 실행

```bash
# Metro 번들러 시작
npm start

# iOS 시뮬레이터
npx react-native run-ios

# Android 에뮬레이터
npx react-native run-android
```

## 관련 레포지토리

| 레포 | 설명 |
|------|------|
| [barogagi-front](https://github.com/T-BluePot/barogagi-front) | WebView에 로드되는 웹 프로젝트 (React) |
| [barogagi-app](https://github.com/T-BluePot/barogagi-app) | 이 레포 - React Native 앱 래퍼 |
