# 웹-네이티브 브릿지 & 쿠키 가이드

barogagi-app(React Native)과 barogagi-front(웹앱) 간의 데이터 통신 구조와 사용법을 정리합니다.

---

## 전체 구조

```
[앱 시작]
  AsyncStorage에서 초기 데이터 로드
       ↓
[WebView 로드 전]
  injectedJavaScriptBeforeContentLoaded
  ├─ 쿠키 주입 (document.cookie)
  └─ window.BarogagiApp 인터페이스 등록
       ↓
[웹앱 실행]
  document.cookie 읽기 → 초기 상태 설정
  window.BarogagiApp.xxx() → 네이티브 기능 호출
       ↓
[런타임 갱신]
  설정 변경 시 → 네이티브 스토리지 저장 + 쿠키 즉시 갱신
```

---

## 1. 쿠키 (앱 → 웹, 자동 주입)

앱 시작 시 WebView가 로드되기 **전에** `document.cookie`로 주입됩니다.
웹앱은 별도 요청 없이 `document.cookie`를 파싱하면 됩니다.

### 주입되는 쿠키 목록

| 쿠키 Key | 타입 | 설명 | 예시 값 |
|---|---|---|---|
| `safe_area_top` | number | 상단 safe area 높이 (px) | `'59'` |
| `safe_area_bottom` | number | 하단 safe area 높이 (px) | `'34'` |
| `provider_id` | string | 로그인 사용자 고유 ID | `'kakao_12345'` |
| `email` | string | 사용자 이메일 | `'user@mail.com'` |
| `name` | string | 사용자 이름 | `'홍길동'` |
| `auto_login` | boolean | 자동 로그인 여부 | `'true'` |
| `app_theme` | string | 사용자 테마 설정 | `'dark'` / `'light'` / `'system'` |
| `app_darkMode` | boolean | 시스템 다크모드 여부 | `'false'` |
| `fcm_token` | string | FCM 푸시 토큰 | `'dKjF3...'` |
| `notification_enabled` | boolean | 알림 수신 설정 | `'true'` |
| `app_version` | string | 앱 버전 | `'1.0.0'` |
| `app_platform` | string | 플랫폼 | `'ios'` / `'android'` |

### 쿠키 읽기 유틸 (웹앱에서 구현)

```javascript
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// 사용 예시
const safeAreaTop = parseInt(getCookie('safe_area_top') ?? '0', 10);
const theme = getCookie('app_theme') ?? 'system';
const isNotificationOn = getCookie('notification_enabled') === 'true';
const isAutoLogin = getCookie('auto_login') === 'true';
```

### 런타임 갱신

쿠키는 초기 로딩 시 1회 주입 후, 아래 상황에서 **자동 갱신**됩니다:

| 상황 | 갱신되는 쿠키 |
|---|---|
| 로그인/로그아웃 | 전체 스토리지 쿠키 |
| `setTheme()` 호출 | 전체 스토리지 쿠키 |
| `setNotification()` 호출 | 전체 스토리지 쿠키 |
| 화면 회전 (safe area 변경) | `safe_area_top`, `safe_area_bottom` |

---

## 2. 브릿지 (웹 → 네이티브)

웹에서 `window.BarogagiApp.메서드명()`으로 호출합니다.

### 앱 환경 확인

```javascript
if (window.isNativeApp) {
  console.log(window.appPlatform); // 'ios' | 'android'
}
```

### 인증

```javascript
// 로그인 완료 후 — 네이티브 스토리지에 저장 + 쿠키 즉시 갱신
window.BarogagiApp.login('kakao_12345', 'user@mail.com', '홍길동');

// 로그아웃 — 스토리지 초기화 + 쿠키 즉시 갱신
window.BarogagiApp.logout();

// SNS 로그인 (네이티브 SDK 실행)
window.BarogagiApp.snsLogin('kakao'); // 'kakao' | 'naver' | 'google'
// 결과 콜백 (웹에서 구현 필요):
window.snsLoginResult = function(type, providerId, email, name) {
  // 로그인 결과 처리
};
```

### 앱 설정

```javascript
// 테마 변경 — 네이티브 스토리지 저장 + 쿠키(app_theme) 즉시 갱신
window.BarogagiApp.setTheme('dark');   // 'light' | 'dark' | 'system'

// 알림 설정 — 네이티브 스토리지 저장 + 쿠키(notification_enabled) 즉시 갱신
window.BarogagiApp.setNotification(false);
```

### FCM 푸시 알림

```javascript
// FCM 토큰 요청 — 네이티브가 토큰 발급 후 콜백
window.BarogagiApp.updateFcmToken();
// 결과 콜백 (웹에서 구현 필요):
window.saveFcmToken = function(token) {
  // 서버에 토큰 등록
};

// 토픽 구독/해제
window.BarogagiApp.subscribeTopic('notice');
window.BarogagiApp.unsubscribeTopic('notice');
```

### 범용 스토리지 (saveData / getData / deleteData)

프론트엔드 개발자가 필요한 값을 자유롭게 추가/조회/삭제할 수 있습니다.
앱 내부 키와의 충돌 방지를 위해 `web_data_` 접두사가 자동으로 붙습니다.

```javascript
// 저장
window.BarogagiApp.saveData('lastVisitedPage', '/home');

// 조회 (Promise 기반 — await 사용 가능)
const value = await window.BarogagiApp.getData('lastVisitedPage');
console.log(value); // '/home'

// 삭제
window.BarogagiApp.deleteData('lastVisitedPage');
```

> **참고**: 객체를 저장할 때는 `JSON.stringify` / `JSON.parse`를 사용하세요.
> ```javascript
> window.BarogagiApp.saveData('settings', JSON.stringify({ fontSize: 16 }));
> const settings = JSON.parse(await window.BarogagiApp.getData('settings'));
> ```

### 시스템

```javascript
// 외부 브라우저로 URL 열기
window.BarogagiApp.navigate('https://example.com');
// 또는 호환 방식:
window.sendToNative('NAVIGATE', { url: 'https://example.com' });

// 공유 시트 열기
window.sendToNative('SHARE', { message: '공유할 내용', title: '제목' });

// 햅틱 피드백 (TODO: SDK 설치 필요)
window.sendToNative('HAPTIC', { style: 'light' });
```

---

## 3. 콜백 (네이티브 → 웹, 웹에서 구현 필요)

네이티브가 비동기 작업 완료 후 웹에 결과를 돌려줄 때 사용합니다.
아래 함수를 웹앱 전역에 정의해야 합니다.

| 함수 | 호출 시점 |
|---|---|
| `window.snsLoginResult(type, providerId, email, name)` | SNS 로그인 완료 |
| `window.saveFcmToken(token)` | FCM 토큰 발급 완료 |

> `getData`는 Promise 기반이므로 별도 콜백이 필요 없습니다.

---

## 4. 파일 구조

```
src/
  constants/
    config.ts           — URL, 앱 버전 상수
    bridgeTypes.ts      — 브릿지 메시지 타입 상수 (LOGIN, SET_THEME 등)
  services/
    StorageService.ts   — AsyncStorage 래퍼 (로그인, 테마, FCM, 알림, 범용 데이터)
  utils/
    cookieInjector.ts   — 쿠키 주입 JS 빌더
    ├ buildSafeAreaCookieJS(top, bottom)  — 여백 쿠키 전용
    ├ buildStorageCookieJS(data)          — 스토리지 쿠키 전용
    └ buildCookieInjectionJS(data)        — 전체 조합 (초기 로딩용)
    bridgeInterface.ts  — window.BarogagiApp JS 인터페이스 정의
  screens/
    WebViewScreen.tsx   — 메인 화면 (쿠키 주입 + 브릿지 핸들러)
  components/
    ErrorFallback.tsx   — 에러 폴백 UI
```

---

## 5. 새 설정값 추가 가이드

프론트엔드에서 새로운 앱 설정이 필요할 때:

### A. 쿠키로 주입해야 하는 경우 (앱 시작 시 즉시 필요한 값)

1. **StorageService.ts** — 저장/조회 함수 추가
2. **bridgeTypes.ts** — 새 브릿지 타입 추가 (SET_XXX)
3. **cookieInjector.ts** — `StorageCookieData` 인터페이스에 필드 추가 + `buildStorageCookieJS`에 setCookie 추가
4. **bridgeInterface.ts** — `window.BarogagiApp`에 setter 메서드 추가
5. **WebViewScreen.tsx** — `loadStorageCookieData()`에 조회 추가 + handleMessage에 case 추가

### B. 범용 스토리지로 충분한 경우 (런타임에만 필요한 값)

```javascript
// 코드 변경 없이 바로 사용 가능
window.BarogagiApp.saveData('myNewKey', 'myValue');
const value = await window.BarogagiApp.getData('myNewKey');
```

---

## 6. 저장소별 특성 비교

| 저장소 | 읽기 방식 | 앱 종료 후 | 앱 삭제 후 | 용도 |
|---|---|---|---|---|
| 쿠키 (document.cookie) | 동기 | 유지 | 삭제 | WebView 로드 전 초기 데이터 |
| 네이티브 AsyncStorage | 비동기 (브릿지) | 유지 | 삭제 | 앱 설정, 인증 정보 |
| 웹 localStorage | 동기 | 유지 | 삭제 | 웹앱 자체 상태 (장바구니 등) |
| 웹 sessionStorage | 동기 | 삭제 | 삭제 | 임시 세션 데이터 |
