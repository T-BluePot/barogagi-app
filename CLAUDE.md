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
- TypeScript

## 주요 명령어
- `npx react-native run-ios` — iOS 시뮬레이터 실행
- `npx react-native run-android` — Android 에뮬레이터 실행
- `cd ios && pod install` — iOS 의존성 설치

## 구조
- `src/screens/WebViewScreen.tsx` — 메인 WebView 화면
- `src/components/ErrorFallback.tsx` — 에러 폴백 UI
- `src/constants/config.ts` — URL 및 앱 설정 상수

## 웹 ↔ 네이티브 브릿지
웹앱에서 window.ReactNativeWebView.postMessage()로 메시지 전송.
앱에서 onMessage 핸들러로 수신 후 switch(type)으로 분기.
- NAVIGATE: 외부 URL 열기
- SHARE: 네이티브 공유 시트
- HAPTIC: 햅틱 피드백

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
