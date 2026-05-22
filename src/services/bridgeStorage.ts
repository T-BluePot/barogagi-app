/**
 * @file bridgeStorage.ts
 * @description RN_BRIDGE.md §1 — 3종 namespace storage 백엔드.
 *
 * - secure:     EncryptedSharedPreferences (인증 토큰 4종)
 * - persistent: MMKV (최근 검색 등 영속 데이터)
 * - session:    in-memory Map (회원가입/일정 draft 등 — 앱 종료 시 사라져야 함)
 *
 * §1: session은 반드시 in-memory. 영속 저장소에 매핑하면 종료 시 잔존 draft가
 *     다음 실행에 나타나는 UX 버그가 발생.
 */

import EncryptedStorage from 'react-native-encrypted-storage';
import { MMKV } from 'react-native-mmkv';

export type BridgeNamespace = 'secure' | 'persistent' | 'session';

export const isBridgeNamespace = (v: unknown): v is BridgeNamespace =>
  v === 'secure' || v === 'persistent' || v === 'session';

const persistent = new MMKV({ id: 'barogagi-persistent' });
const session = new Map<string, string>();

export const storageGet = async (
  ns: BridgeNamespace,
  key: string,
): Promise<string | null> => {
  if (ns === 'secure') return (await EncryptedStorage.getItem(key)) ?? null;
  if (ns === 'persistent') return persistent.getString(key) ?? null;
  return session.get(key) ?? null;
};

export const storageSet = async (
  ns: BridgeNamespace,
  key: string,
  value: string,
): Promise<void> => {
  if (ns === 'secure') {
    await EncryptedStorage.setItem(key, value);
    return;
  }
  if (ns === 'persistent') {
    persistent.set(key, value);
    return;
  }
  session.set(key, value);
};

export const storageDelete = async (
  ns: BridgeNamespace,
  key: string,
): Promise<void> => {
  if (ns === 'secure') {
    await EncryptedStorage.removeItem(key);
    return;
  }
  if (ns === 'persistent') {
    persistent.delete(key);
    return;
  }
  session.delete(key);
};

/**
 * §2 부팅 시 EncryptedStorage 예열.
 *
 * 웹은 React 마운트 직전에 secure 토큰 4종(accessToken, refreshToken,
 * accessTokenExpiry, refreshTokenExpiry)을 동시 조회함. 첫 접근 시 발생하는
 * 키 derivation 비용을 앱 init 시점에 미리 발생시켜 white screen 시간을 단축.
 */
export const warmupSecureStorage = async (): Promise<void> => {
  try {
    await EncryptedStorage.getItem('__warmup__');
  } catch {
    // 첫 접근 자체가 목적이므로 결과/실패 모두 무시
  }
};
