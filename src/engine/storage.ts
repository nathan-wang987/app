/** 带版本号与容错的 localStorage 存档层。 */

const PREFIX = 'blade-loop';

export interface SaveEnvelope<T> {
  version: number;
  savedAt: number;
  data: T;
}

export const SAVE_VERSION = 1;

export function saveGame<T>(slot: string, data: T, version = SAVE_VERSION): boolean {
  try {
    const envelope: SaveEnvelope<T> = { version, savedAt: Date.now(), data };
    window.localStorage.setItem(`${PREFIX}:${slot}`, JSON.stringify(envelope));
    return true;
  } catch {
    // 隐私模式或配额不足时静默降级：游戏仍可正常游玩，只是不落盘。
    return false;
  }
}

export function loadGame<T>(slot: string, version = SAVE_VERSION): T | null {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}:${slot}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveEnvelope<T>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== version) return null; // 版本不匹配时丢弃旧档而不是崩溃
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function clearGame(slot: string): void {
  try {
    window.localStorage.removeItem(`${PREFIX}:${slot}`);
  } catch {
    /* 忽略 */
  }
}

export function hasGame(slot: string): boolean {
  try {
    return window.localStorage.getItem(`${PREFIX}:${slot}`) !== null;
  } catch {
    return false;
  }
}
