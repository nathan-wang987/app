import { clearGame, loadGame, saveGame } from '../engine/storage';
import { createModifiers } from './upgrades';
import type { PlayerModifiers, UpgradeId } from './types';

export interface RunSave {
  /** 存档格式版本，与 storage 的版本号配合使用。 */
  format: number;
  wave: number;
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  levelHpBonus: number;
  levelAttackBonus: number;
  kills: number;
  elapsed: number;
  mods: PlayerModifiers;
}

export interface MetaSave {
  bestWave: number;
  totalKills: number;
  runs: number;
}

const RUN_SLOT = 'run';
const META_SLOT = 'meta';
const FORMAT = 1;

export function saveRun(data: Omit<RunSave, 'format'>): void {
  saveGame<RunSave>(RUN_SLOT, { ...data, format: FORMAT });
}

export function loadRun(): RunSave | null {
  const data = loadGame<RunSave>(RUN_SLOT);
  if (!data || data.format !== FORMAT) return null;
  // 字段级容错：缺字段时给出安全默认值，坏档不炸游戏。
  return {
    format: FORMAT,
    wave: Math.max(1, Math.floor(data.wave ?? 1)),
    level: Math.max(1, Math.floor(data.level ?? 1)),
    xp: Math.max(0, data.xp ?? 0),
    xpToNext: Math.max(1, data.xpToNext ?? 18),
    hp: Math.max(1, data.hp ?? 100),
    levelHpBonus: data.levelHpBonus ?? 0,
    levelAttackBonus: data.levelAttackBonus ?? 0,
    kills: Math.max(0, data.kills ?? 0),
    elapsed: Math.max(0, data.elapsed ?? 0),
    mods: normalizeMods(data.mods)
  };
}

export function clearRun(): void {
  clearGame(RUN_SLOT);
}

export function saveMeta(meta: MetaSave): void {
  saveGame<MetaSave>(META_SLOT, meta);
}

export function loadMeta(): MetaSave {
  const data = loadGame<MetaSave>(META_SLOT);
  return {
    bestWave: Math.max(1, data?.bestWave ?? 1),
    totalKills: Math.max(0, data?.totalKills ?? 0),
    runs: Math.max(0, data?.runs ?? 0)
  };
}

function normalizeMods(mods: Partial<PlayerModifiers> | undefined): PlayerModifiers {
  const base = createModifiers();
  if (!mods) return base;
  const taken: Partial<Record<UpgradeId, number>> = {};
  if (mods.taken) {
    for (const [key, value] of Object.entries(mods.taken)) {
      if (typeof value === 'number' && value > 0) taken[key as UpgradeId] = value;
    }
  }
  return {
    bonusMaxHp: mods.bonusMaxHp ?? base.bonusMaxHp,
    bonusAttack: mods.bonusAttack ?? base.bonusAttack,
    bonusMoveSpeed: mods.bonusMoveSpeed ?? base.bonusMoveSpeed,
    bonusReach: mods.bonusReach ?? base.bonusReach,
    cooldownRate: mods.cooldownRate ?? base.cooldownRate,
    lifesteal: mods.lifesteal ?? base.lifesteal,
    critChance: mods.critChance ?? base.critChance,
    damageReduction: mods.damageReduction ?? base.damageReduction,
    xpGain: mods.xpGain ?? base.xpGain,
    dashPower: mods.dashPower ?? base.dashPower,
    spinPower: mods.spinPower ?? base.spinPower,
    healPower: mods.healPower ?? base.healPower,
    taken
  };
}
