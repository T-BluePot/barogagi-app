import AsyncStorage from '@react-native-async-storage/async-storage';

// 앱 내부에서 관리하는 저장 키
const STORAGE_KEYS = {
  PROVIDER_ID: 'provider_id',
  EMAIL: 'email',
  NAME: 'name',
  AUTO_LOGIN: 'auto_login',
} as const;

// 웹에서 saveData/getData로 저장하는 키는 충돌 방지를 위해 네임스페이스 분리
const WEB_DATA_PREFIX = 'web_data_';

export const StorageService = {
  // 로그인 정보 저장 (login 브릿지 호출 시)
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

  // 로그인 정보 조회 (쿠키 주입 시 사용)
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

  // 로그아웃 시 로그인 정보 초기화
  clearLoginInfo: async (): Promise<void> => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.PROVIDER_ID,
      STORAGE_KEYS.EMAIL,
      STORAGE_KEYS.NAME,
    ]);
  },

  // 자동 로그인 설정 조회
  getAutoLogin: async (): Promise<boolean> => {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_LOGIN);
    return value === 'true';
  },

  // 자동 로그인 설정 저장
  setAutoLogin: async (enabled: boolean): Promise<void> => {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTO_LOGIN, String(enabled));
  },

  // 웹에서 호출하는 범용 key-value 저장소
  saveWebData: (key: string, value: string): Promise<void> =>
    AsyncStorage.setItem(`${WEB_DATA_PREFIX}${key}`, value),

  getWebData: (key: string): Promise<string | null> =>
    AsyncStorage.getItem(`${WEB_DATA_PREFIX}${key}`),

  deleteWebData: (key: string): Promise<void> =>
    AsyncStorage.removeItem(`${WEB_DATA_PREFIX}${key}`),
};
