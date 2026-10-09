import { xpForLevel } from './constants';
import { PLAYER_BASE_ATTACK, PLAYER_BASE_HP } from './constants';
import type { Player, PlayerModifiers } from './types';

/** 增加经验并返回本次升了几级（1 级可能同时升多级）。 */
export function addExperience(player: Player, amount: number): number {
  player.xp += amount;
  let levels = 0;
  let guard = 0;
  while (player.xp >= player.xpToNext && guard < 50) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = xpForLevel(player.level);
    levels += 1;
    guard += 1;
  }
  return levels;
}

export const LEVEL_HP_GAIN = 12;
export const LEVEL_ATTACK_GAIN = 1.5;

/**
 * 由「基础值 + 等级成长 + 升级加成」重算最终属性。
 * 所有属性只在这一处汇聚，避免多个来源加减时出现漂移。
 */
export function recomputeStats(
  player: Player,
  mods: PlayerModifiers,
  levelHpBonus: number,
  levelAttackBonus: number
): { maxHp: number; attack: number } {
  player.maxHp = PLAYER_BASE_HP + levelHpBonus + mods.bonusMaxHp;
  player.attack = PLAYER_BASE_ATTACK + levelAttackBonus + mods.bonusAttack;
  if (player.hp > player.maxHp) player.hp = player.maxHp;
  return { maxHp: player.maxHp, attack: player.attack };
}
