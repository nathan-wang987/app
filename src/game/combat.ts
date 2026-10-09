import { clamp, overlaps, rectCenterX, rectCenterY, distance } from '../engine/math';
import type { Rect } from '../engine/types';
import type { Monster } from './monsters';
import type { Player } from './player';
import type { World } from './world';

export type DamageSource = 'melee' | 'spin' | 'dash' | 'jumpBlast' | 'thorns';

export interface DamageOptions {
  knockX?: number;
  knockY?: number;
  source: DamageSource;
  /** 命中特效颜色 */
  color?: string;
  /** 是否显示伤害数字 */
  showNumber?: boolean;
}

/** 玩家攻击力的动态倍率（低血狂暴等加成） */
export function playerAttackMultiplier(player: Player): number {
  let multiplier = 1;
  const ratio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
  if (player.stats.lowHpBonus > 0 && ratio <= 0.3) multiplier += player.stats.lowHpBonus;
  return multiplier;
}

function executionerMultiplier(player: Player, monster: Monster): number {
  if (player.stats.executioner <= 0) return 1;
  const ratio = monster.maxHp > 0 ? monster.hp / monster.maxHp : 1;
  return ratio <= 0.3 ? 1 + player.stats.executioner : 1;
}

/** 对单个怪物结算一次伤害，含击杀处理 */
export function damageMonster(world: World, monster: Monster, baseAmount: number, options: DamageOptions): void {
  if (monster.dead) return;
  const player = world.player;
  const amount = Math.max(1, Math.round(baseAmount * playerAttackMultiplier(player) * executionerMultiplier(player, monster)));

  monster.hp -= amount;
  monster.hitFlash = 0.12;
  world.stats.damageDealt += amount;

  const knockResist = clamp(monster.def.knockbackResist, 0, 0.95);
  if (options.knockX) monster.vx += options.knockX * (1 - knockResist);
  if (options.knockY) monster.vy = Math.min(monster.vy, options.knockY * (1 - knockResist));

  if (options.showNumber !== false) {
    world.fx.spawnText(rectCenterX(monster), monster.y - 6, `${amount}`, options.color ?? '#ffe08a', amount >= 30 ? 16 : 12);
  }
  world.fx.spawnBurst(rectCenterX(monster), rectCenterY(monster), 6, options.color ?? '#ffd166', {
    speed: 190,
    size: 3,
    gravity: 520,
    life: 0.34,
  });

  if (monster.hp <= 0) {
    killMonster(world, monster);
  }
}

function killMonster(world: World, monster: Monster): void {
  if (monster.dead) return;
  monster.dead = true;
  world.stats.kills += 1;
  world.waveKills += 1;
  world.fx.spawnBurst(rectCenterX(monster), rectCenterY(monster), 16, monster.def.bloodColor, {
    speed: 300,
    size: 4,
    gravity: 700,
    life: 0.6,
  });
  world.addShake(monster.kind === 'brute' ? 5 : 2.5);

  const player = world.player;
  if (player.stats.lifesteal > 0) {
    healPlayer(world, player.stats.lifesteal, false);
  }
  world.grantExp(monster.expReward, monster);
}

/** 矩形范围伤害（普攻、重击、冲锋等） */
export function damageInRect(world: World, rect: Rect, amount: number, hitSet: Set<number>, options: DamageOptions): number {
  let hits = 0;
  const monsters = world.monsters;
  for (let i = 0; i < monsters.length; i += 1) {
    const monster = monsters[i];
    if (monster.dead || hitSet.has(monster.id)) continue;
    if (!overlaps(rect, monster)) continue;
    hitSet.add(monster.id);
    hits += 1;
    damageMonster(world, monster, amount, options);
  }
  return hits;
}

/** 圆形范围伤害（回旋斩、二段跳冲击波） */
export function damageInRadius(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  amount: number,
  hitSet: Set<number>,
  options: DamageOptions,
): number {
  let hits = 0;
  const monsters = world.monsters;
  for (let i = 0; i < monsters.length; i += 1) {
    const monster = monsters[i];
    if (monster.dead || hitSet.has(monster.id)) continue;
    const nearestX = clamp(cx, monster.x, monster.x + monster.w);
    const nearestY = clamp(cy, monster.y, monster.y + monster.h);
    if (distance(cx, cy, nearestX, nearestY) > radius) continue;
    hitSet.add(monster.id);
    hits += 1;
    damageMonster(world, monster, amount, options);
  }
  return hits;
}

export interface PlayerDamageOptions {
  sourceX?: number;
  knockX?: number;
  attacker?: Monster;
}

/** 玩家受伤结算，返回是否真的掉血 */
export function damagePlayer(world: World, rawAmount: number, options: PlayerDamageOptions = {}): boolean {
  const player = world.player;
  if (player.action === 'dash') return false; // 冲锋期间无敌
  if (player.invuln > 0 || world.state !== 'playing') return false;

  const amount = Math.max(1, Math.round(rawAmount * (1 - clamp(player.stats.damageReduction, 0, 0.7))));
  player.hp -= amount;
  player.invuln = 0.75;
  player.hurtFlash = 0.35;
  world.stats.damageTaken += amount;
  world.addShake(6);

  const dir = options.sourceX !== undefined ? Math.sign(rectCenterX(player) - options.sourceX) || 1 : -player.facing;
  player.vx = dir * 240;
  player.vy = Math.min(player.vy, -260);

  world.fx.spawnText(rectCenterX(player), player.y - 4, `-${amount}`, '#ff8080', 14);
  world.fx.spawnBurst(rectCenterX(player), rectCenterY(player), 10, '#ff5a5a', {
    speed: 220,
    size: 3,
    gravity: 500,
    life: 0.4,
  });

  if (player.stats.thorns > 0 && options.attacker && !options.attacker.dead) {
    const attacker = options.attacker;
    attacker.hp -= player.stats.thorns;
    attacker.hitFlash = 0.12;
    world.fx.spawnText(rectCenterX(attacker), attacker.y - 4, `${player.stats.thorns}`, '#c4b5fd', 12);
    if (attacker.hp <= 0) killMonster(world, attacker);
  }

  if (player.hp <= 0) {
    player.hp = 0;
    world.onPlayerDeath();
  }
  return true;
}

export function healPlayer(world: World, amount: number, withFx = true): void {
  const player = world.player;
  const before = player.hp;
  player.hp = clamp(player.hp + amount, 0, player.maxHp);
  const healed = Math.round(player.hp - before);
  if (healed <= 0) return;
  if (withFx) {
    world.fx.spawnText(rectCenterX(player), player.y - 8, `+${healed}`, '#86efac', 14);
    world.fx.spawnBurst(rectCenterX(player), rectCenterY(player), 12, '#6ee7b7', {
      speed: 130,
      size: 3,
      gravity: -80,
      life: 0.6,
    });
  }
}
