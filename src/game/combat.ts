import { PLAYER_ATTACK_HEIGHT, PLAYER_ATTACK_RANGE } from './constants';
import { DASH_KNOCKBACK, dashHitbox, spinHitbox } from './skills';
import { rectsOverlap, type Rect } from '../engine/math';
import type { Effects } from './effects';
import type { Enemy, Player, PlayerModifiers } from './types';
import type { Rng } from '../engine/rng';

export interface CombatEnv {
  player: Player;
  enemies: Enemy[];
  effects: Effects;
  rng: Rng;
  mods: PlayerModifiers;
  onEnemyKilled(enemy: Enemy): void;
  onPlayerDied(): void;
}

export interface HitResult {
  hits: number;
  damage: number;
  killed: number;
}

/** 普通攻击的判定框：朝向前方的一块矩形。 */
export const meleeHitbox = (player: Player, mods: PlayerModifiers): Rect => {
  const reach = PLAYER_ATTACK_RANGE + mods.bonusReach;
  return player.facing === 1
    ? { x: player.x + player.w - 2, y: player.y - 2, w: reach, h: PLAYER_ATTACK_HEIGHT }
    : { x: player.x + 2 - reach, y: player.y - 2, w: reach, h: PLAYER_ATTACK_HEIGHT };
};

export const enemyHitbox = (enemy: Enemy): Rect => ({
  x: enemy.x,
  y: enemy.y,
  w: enemy.w,
  h: enemy.h
});

/**
 * 对单个敌人结算伤害：暴击、吸血、击退、飘字、死亡都在这里统一处理，
 * 保证所有伤害来源（普攻 / 旋风 / 冲锋 / 反击）表现一致。
 */
export function damageEnemy(
  enemy: Enemy,
  rawDamage: number,
  knockback: number,
  dirX: number,
  env: CombatEnv,
  options: { silent?: boolean } = {}
): { damage: number; killed: boolean; crit: boolean } {
  if (!enemy.active || enemy.state === 'dead' || enemy.spawnGrace > 0) {
    return { damage: 0, killed: false, crit: false };
  }

  const crit = env.rng.next() < env.mods.critChance;
  const damage = Math.max(1, Math.round(rawDamage * (crit ? 2 : 1)));
  enemy.hp -= damage;
  enemy.hitFlash = 0.14;
  enemy.invuln = Math.max(enemy.invuln, 0.06);

  const resist = 1 - enemy.knockbackResist;
  if (resist > 0.05) {
    enemy.vx += dirX * knockback * resist;
    enemy.vy -= knockback * 0.18 * resist;
  }

  const cx = enemy.x + enemy.w / 2;
  const cy = enemy.y + enemy.h * 0.35;
  env.effects.burst(cx, cy, crit ? 7 : 4, crit ? '#ffe066' : '#ff8f8f', {
    speed: 80,
    size: crit ? 3 : 2,
    life: 0.32
  });
  if (!options.silent) {
    env.effects.text(cx, cy - 4, crit ? `${damage}!` : `${damage}`, crit ? '#ffe066' : '#ffffff', crit ? 8 : 6);
  }

  // 吸血（需求外的可选加成，由升级提供）。
  if (env.mods.lifesteal > 0 && env.player.hp > 0) {
    const heal = crit ? env.mods.lifesteal * 3 : env.mods.lifesteal;
    const before = env.player.hp;
    env.player.hp = Math.min(env.player.maxHp, env.player.hp + heal);
    if (env.player.hp > before) {
      env.effects.text(env.player.x + env.player.w / 2, env.player.y - 10, `+${Math.round(env.player.hp - before)}`, '#8bf59a', 5);
    }
  }

  let killed = false;
  if (enemy.hp <= 0) {
    killed = true;
    killEnemy(enemy, dirX, env);
  }
  return { damage, killed, crit };
}

function killEnemy(enemy: Enemy, dirX: number, env: CombatEnv): void {
  enemy.hp = 0;
  enemy.state = 'dead';
  enemy.stateTime = 0;
  enemy.vx = dirX * 90;
  enemy.vy = -110;
  env.effects.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 10, '#ff9db1', {
    speed: 110,
    size: 2,
    life: 0.5
  });
  env.onEnemyKilled(enemy);
}

/** 用某个判定框命中一批敌人（每个来源每击只命中一次，靠 hitSet 去重）。 */
export function resolveHitbox(
  box: Rect,
  damage: number,
  knockback: number,
  env: CombatEnv,
  hitSet: Set<number>,
  dirFromX: number
): HitResult {
  const result: HitResult = { hits: 0, damage: 0, killed: 0 };
  for (let i = 0; i < env.enemies.length; i += 1) {
    const enemy = env.enemies[i];
    if (!enemy.active || enemy.state === 'dead' || hitSet.has(enemy.id)) continue;
    if (!rectsOverlap(box, enemyHitbox(enemy))) continue;
    hitSet.add(enemy.id);
    const dirX = enemy.x + enemy.w / 2 >= dirFromX ? 1 : -1;
    const res = damageEnemy(enemy, damage, knockback, dirX, env);
    result.hits += 1;
    result.damage += res.damage;
    if (res.killed) result.killed += 1;
  }
  return result;
}

/** 旋风斩 / 冲锋这类持续判定的技能在持续时间内的逐帧命中。 */
export function resolveSkillHitbox(
  player: Player,
  mods: PlayerModifiers,
  env: CombatEnv,
  damage: number,
  knockback: number
): HitResult {
  const box =
    player.state === 'spin' ? spinHitbox(player, mods) : dashHitbox(player);
  const centerX = player.x + player.w / 2;
  return resolveHitbox(box, damage, knockback, env, player.hitThisSwing, centerX);
}

/** 玩家受击：无敌帧、减伤、击退、死亡判定集中在这里。 */
export function damagePlayer(
  amount: number,
  sourceX: number,
  env: CombatEnv,
  knockback = 70
): boolean {
  const player = env.player;
  if (player.state === 'dead' || player.invuln > 0) return false;

  const reduced = Math.max(1, Math.round(amount * (1 - env.mods.damageReduction)));
  player.hp -= reduced;
  player.hitFlash = 0.16;
  player.invuln = 0.9;

  const dirX = player.x + player.w / 2 >= sourceX ? 1 : -1;
  player.vx = dirX * knockback;
  player.vy = Math.min(player.vy, -90);
  player.state = 'hurt';
  player.stateTime = 0;

  env.effects.burst(player.x + player.w / 2, player.y + player.h * 0.4, 8, '#ff6b6b', {
    speed: 100,
    size: 2,
    life: 0.35
  });
  env.effects.text(player.x + player.w / 2, player.y - 8, `-${reduced}`, '#ff6b6b', 7);

  if (player.hp <= 0) {
    player.hp = 0;
    player.state = 'dead';
    player.stateTime = 0;
    env.effects.burst(player.x + player.w / 2, player.y + player.h / 2, 16, '#ffd479', {
      speed: 130,
      size: 2,
      life: 0.7
    });
    env.onPlayerDied();
  }
  return true;
}

export { DASH_KNOCKBACK };
