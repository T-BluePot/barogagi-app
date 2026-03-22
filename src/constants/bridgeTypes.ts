// 웹 → 네이티브 브릿지 메시지 타입 상수
export const BRIDGE_TYPES = {
  // 인증
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  SNS_LOGIN: 'SNS_LOGIN',

  // FCM
  UPDATE_FCM_TOKEN: 'UPDATE_FCM_TOKEN',
  SUBSCRIBE_TOPIC: 'SUBSCRIBE_TOPIC',
  UNSUBSCRIBE_TOPIC: 'UNSUBSCRIBE_TOPIC',

  // 스토리지
  SAVE_DATA: 'SAVE_DATA',
  GET_DATA: 'GET_DATA',
  DELETE_DATA: 'DELETE_DATA',

  // 시스템
  NAVIGATE: 'NAVIGATE',
  SHARE: 'SHARE',
  HAPTIC: 'HAPTIC',
} as const;

export type BridgeType = (typeof BRIDGE_TYPES)[keyof typeof BRIDGE_TYPES];
