/**
 * @file StorageService.ts
 * @description React Native AsyncStorage를 감싸는 서비스 레이어
 *
 * ## 역할
 * 앱 내 모든 영구 저장소 접근을 이 파일 하나로 통일합니다.
 * AsyncStorage API를 직접 호출하는 대신 StorageService를 통해 접근하면:
 *   - 저장 키 충돌 방지 (내부 키 vs 웹에서 저장하는 키 네임스페이스 분리)
 *   - 타입 안전성 확보
 *   - 저장소 구현 변경 시 이 파일만 수정하면 됨
 *
 * ## 저장소 구조
 * AsyncStorage는 기기 내부에 key-value 형태로 데이터를 저장합니다.
 * 앱을 종료했다 재실행해도 데이터가 유지됩니다 (단, 앱 삭제 시 초기화).
 *
 * 키 네임스페이스:
 *   - 'provider_id', 'email', 'name', 'auto_login' → 앱 내부 관리 키
 *   - 'web_data_*' → 웹에서 saveData/getData로 저장하는 범용 데이터
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** 앱 내부에서 직접 관리하는 저장 키 목록 */
const STORAGE_KEYS = {
  PROVIDER_ID: 'provider_id',
  EMAIL: 'email',
  NAME: 'name',
  AUTO_LOGIN: 'auto_login',
  APP_THEME: 'app_theme',
  FCM_TOKEN: 'fcm_token',
  NOTIFICATION_ENABLED: 'notification_enabled',
} as const;

/** 앱 테마 타입. system은 기기 설정을 따릅니다. */
export type AppTheme = 'light' | 'dark' | 'system';

/**
 * 웹에서 saveData/getData로 저장하는 키의 접두사.
 * 앱 내부 키와 충돌하지 않도록 네임스페이스를 분리합니다.
 *
 * 예: saveData('myKey', 'value') → AsyncStorage에는 'web_data_myKey'로 저장됨
 */
const WEB_DATA_PREFIX = 'web_data_';

export const StorageService = {
  // ─────────────────────────────────────────
  // 로그인 정보
  // 앱 재실행 시 쿠키로 웹에 전달하기 위해 네이티브에 저장합니다.
  // ─────────────────────────────────────────

  /**
   * 로그인 완료 후 사용자 정보를 네이티브 스토리지에 저장합니다.
   * 저장된 값은 다음 앱 실행 시 쿠키(provider_id, email, name)로 웹에 전달됩니다.
   *
   * 호출 시점: 웹에서 window.BarogagiApp.login(provider_id, email, name) 호출 시
   *
   * @param providerId - SNS 제공자 기준 고유 사용자 ID
   * @param email - 사용자 이메일
   * @param name - 사용자 이름
   */
  saveLoginInfo: async (
    providerId: string,
    email: string,
    name: string,
  ): Promise<void> => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.PROVIDER_ID, providerId],
      [STORAGE_KEYS.EMAIL, email],
      [STORAGE_KEYS.NAME, name],
    ]);
  },

  /**
   * 저장된 사용자 정보를 조회합니다.
   * 앱 시작 시 쿠키를 주입하기 전에 호출하여 초기 데이터를 가져옵니다.
   *
   * 호출 시점: WebViewScreen 마운트 시 초기 데이터 로딩
   *
   * @returns 저장된 사용자 정보. 로그인 이력 없으면 빈 문자열 반환.
   */
  getLoginInfo: async (): Promise<{
    providerId: string;
    email: string;
    name: string;
  }> => {
    const results = await AsyncStorage.multiGet([
      STORAGE_KEYS.PROVIDER_ID,
      STORAGE_KEYS.EMAIL,
      STORAGE_KEYS.NAME,
    ]);
    return {
      providerId: results[0][1] ?? '',
      email: results[1][1] ?? '',
      name: results[2][1] ?? '',
    };
  },

  /**
   * 저장된 사용자 정보를 모두 삭제합니다.
   * 로그아웃 또는 회원탈퇴 시 호출합니다.
   *
   * 호출 시점: 웹에서 window.BarogagiApp.logout() 호출 시
   */
  clearLoginInfo: async (): Promise<void> => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.PROVIDER_ID,
      STORAGE_KEYS.EMAIL,
      STORAGE_KEYS.NAME,
    ]);
  },

  // ─────────────────────────────────────────
  // 자동 로그인 설정
  // ─────────────────────────────────────────

  /**
   * 자동 로그인 활성화 여부를 조회합니다.
   * 앱 시작 시 쿠키(auto_login)로 웹에 전달하기 위해 사용합니다.
   *
   * @returns 자동 로그인 활성화 여부. 설정 이력 없으면 false 반환.
   */
  getAutoLogin: async (): Promise<boolean> => {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_LOGIN);
    return value === 'true';
  },

  /**
   * 자동 로그인 설정을 저장합니다.
   *
   * @param enabled - true: 자동 로그인 활성화, false: 비활성화
   */
  setAutoLogin: async (enabled: boolean): Promise<void> => {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTO_LOGIN, String(enabled));
  },

  // ─────────────────────────────────────────
  // 앱 테마 설정
  // 사용자가 선택한 테마를 저장합니다. 'system'이면 기기 설정을 따릅니다.
  // ─────────────────────────────────────────

  /**
   * 저장된 앱 테마를 조회합니다.
   * 설정 이력이 없으면 기기 설정을 따르는 'system'을 반환합니다.
   */
  getAppTheme: async (): Promise<AppTheme> => {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.APP_THEME);
    if (value === 'light' || value === 'dark') {
      return value;
    }
    return 'system';
  },

  /**
   * 앱 테마를 저장합니다.
   *
   * @param theme - 'light' | 'dark' | 'system'
   */
  setAppTheme: async (theme: AppTheme): Promise<void> => {
    await AsyncStorage.setItem(STORAGE_KEYS.APP_THEME, theme);
  },

  // ─────────────────────────────────────────
  // FCM 토큰
  // Firebase에서 발급받은 푸시 토큰을 네이티브에 저장합니다.
  // ─────────────────────────────────────────

  /**
   * 저장된 FCM 토큰을 조회합니다.
   * 토큰이 없으면 빈 문자열을 반환합니다.
   */
  getFcmToken: async (): Promise<string> => {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.FCM_TOKEN);
    return value ?? '';
  },

  /**
   * FCM 토큰을 저장합니다.
   *
   * @param token - Firebase에서 발급받은 FCM 토큰
   */
  setFcmToken: async (token: string): Promise<void> => {
    await AsyncStorage.setItem(STORAGE_KEYS.FCM_TOKEN, token);
  },

  // ─────────────────────────────────────────
  // 알림 설정
  // 사용자의 푸시 알림 수신 on/off 설정을 저장합니다.
  // ─────────────────────────────────────────

  /**
   * 알림 수신 설정을 조회합니다.
   * 설정 이력이 없으면 기본값 true(수신 허용)를 반환합니다.
   */
  getNotificationEnabled: async (): Promise<boolean> => {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_ENABLED);
    if (value === null) {
      return true;
    }
    return value === 'true';
  },

  /**
   * 알림 수신 설정을 저장합니다.
   *
   * @param enabled - true: 알림 수신, false: 알림 차단
   */
  setNotificationEnabled: async (enabled: boolean): Promise<void> => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.NOTIFICATION_ENABLED,
      String(enabled),
    );
  },

  // ─────────────────────────────────────────
  // 범용 key-value 스토리지 (웹 → 네이티브 saveData/getData/deleteData 브릿지용)
  // 웹에서 자유롭게 네이티브 스토리지를 활용할 수 있도록 제공하는 범용 API입니다.
  // 앱 내부 키와의 충돌 방지를 위해 'web_data_' 접두사를 붙여 저장합니다.
  // ─────────────────────────────────────────

  /**
   * 웹에서 전달한 key-value를 네이티브 스토리지에 저장합니다.
   *
   * 호출 시점: 웹에서 window.BarogagiApp.saveData(key, value) 호출 시
   *
   * @param key - 저장할 키 (실제 저장 키: 'web_data_{key}')
   * @param value - 저장할 값 (문자열만 가능; 객체는 JSON.stringify 후 전달)
   */
  saveWebData: (key: string, value: string): Promise<void> =>
    AsyncStorage.setItem(`${WEB_DATA_PREFIX}${key}`, value),

  /**
   * 웹에서 요청한 key에 해당하는 값을 조회합니다.
   * 결과는 WebViewScreen에서 window.getDataResult(key, data) 콜백으로 웹에 전달됩니다.
   *
   * 호출 시점: 웹에서 window.BarogagiApp.getData(key) 호출 시
   *
   * @param key - 조회할 키
   * @returns 저장된 값. 없으면 null 반환.
   */
  getWebData: (key: string): Promise<string | null> =>
    AsyncStorage.getItem(`${WEB_DATA_PREFIX}${key}`),

  /**
   * 웹에서 요청한 key에 해당하는 데이터를 삭제합니다.
   *
   * 호출 시점: 웹에서 window.BarogagiApp.deleteData(key) 호출 시
   *
   * @param key - 삭제할 키
   */
  deleteWebData: (key: string): Promise<void> =>
    AsyncStorage.removeItem(`${WEB_DATA_PREFIX}${key}`),
};
