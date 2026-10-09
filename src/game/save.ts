import { SAVE_KEY, SAVE_VERSION } from './constants';

export interface SavedUpgrade {
  id: string;
  stacks: number;
}

export interface SaveStats {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  deaths: number;
  bestWave: number;
  totalExp: number;
  playTime: number;
}

export interface SaveData {
  version: number;
  wave: number;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  attack: number;
  upgrades: SavedUpgrade[];
  stats: SaveStats;
  seed: number;
  savedAt: number;
}

function isLocalStorageAvailable(): boolean {
  try {
    const probe = '__gsb_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

let storageAvailable: boolean | null = null;

function storage(): Storage | null {
  if (storageAvailable === null) storageAvailable = isLocalStorageAvailable();
  if (!storageAvailable) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const toNumber = (value: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return n < min ? min : n > max ? max : n;
};

/** 读取存档；数据损坏/无法访问时返回 null，绝不让坏数据把游戏带崩 */
export function readSave(): SaveData | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== SAVE_VERSION) return null;

    const upgrades: SavedUpgrade[] = Array.isArray(parsed.upgrades)
      ? parsed.upgrades
          .filter((u): u is SavedUpgrade => !!u && typeof u.id === 'string')
          .map((u) => ({ id: u.id, stacks: toNumber(u.stacks, 1, 1, 99) }))
      : [];

    const stats: SaveStats = {
      kills: toNumber(parsed.stats?.kills, 0, 0),
      damageDealt: toNumber(parsed.stats?.damageDealt, 0, 0),
      damageTaken: toNumber(parsed.stats?.damageTaken, 0, 0),
      deaths: toNumber(parsed.stats?.deaths, 0, 0),
      bestWave: toNumber(parsed.stats?.bestWave, 1, 1),
      totalExp: toNumber(parsed.stats?.totalExp, 0, 0),
      playTime: toNumber(parsed.stats?.playTime, 0, 0),
    };

    const maxHp = toNumber(parsed.maxHp, 110, 1, 100000);
    return {
      version: SAVE_VERSION,
      wave: Math.round(toNumber(parsed.wave, 1, 1, 9999)),
      level: Math.round(toNumber(parsed.level, 1, 1, 9999)),
      exp: Math.round(toNumber(parsed.exp, 0, 0)),
      hp: Math.round(toNumber(parsed.hp, maxHp, 1, maxHp)),
      maxHp: Math.round(maxHp),
      attack: toNumber(parsed.attack, 12, 1, 100000),
      upgrades,
      stats,
      seed: Math.round(toNumber(parsed.seed, Date.now() >>> 0, 1, 4294967295)),
      savedAt: toNumber(parsed.savedAt, Date.now(), 0),
    };
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    /* 忽略 */
  }
}

export function peekSaveSummary(): { wave: number; level: number; savedAt: number } | null {
  const save = readSave();
  if (!save) return null;
  return { wave: save.wave, level: save.level, savedAt: save.savedAt };
}
