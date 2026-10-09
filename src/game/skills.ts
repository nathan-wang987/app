import {
  DASH_DAMAGE,
  DASH_KNOCKBACK,
  DASH_SPEED,
  HEAL_RATIO,
  SKILLS,
  SPIN_DAMAGE,
  SPIN_RADIUS
} from './constants';
import type { Effects } from './effects';
import type { Player, PlayerModifiers, SkillId } from './types';

export const SKILL_IDS: readonly SkillId[] = ['spin', 'dash', 'heal'];

export interface SkillCastContext {
  player: Player;
  mods: PlayerModifiers;
  effects: Effects;
}

export const resolveCooldown = (id: SkillId, mods: PlayerModifiers): number =>
  SKILLS[id].cooldown * (1 - mods.cooldownRate);

export const resolveSpinRadius = (mods: PlayerModifiers): number =>
  SPIN_RADIUS * (1 + mods.spinPower * 0.5);

export const resolveSpinDamage = (player: Player, mods: PlayerModifiers): number =>
  player.attack * SPIN_DAMAGE * (1 + mods.spinPower);

export const resolveDashDamage = (player: Player, mods: PlayerModifiers): number =>
  player.attack * DASH_DAMAGE * (1 + mods.dashPower);

export const resolveHealAmount = (player: Player, mods: PlayerModifiers): number =>
  Math.round(player.maxHp * HEAL_RATIO * (1 + mods.healPower));

/** 技能是否可用（冷却完毕）。 */
export const isSkillReady = (player: Player, id: SkillId): boolean => player.cooldowns[id] <= 0;

/**
 * 释放技能。返回 false 表示未释放（冷却未好 / 当前状态不允许），
 * 调用方（World）会据此决定是否播放失败反馈。
 */
export function castSkill(id: SkillId, ctx: SkillCastContext): boolean {
  const { player, mods, effects } = ctx;
  if (player.cooldowns[id] > 0 || player.state === 'dead') return false;

  const centerY = player.y + player.h * 0.42;
  switch (id) {
    case 'spin': {
      if (player.state === 'dash') return false;
      player.state = 'spin';
      player.stateTime = 0;
      player.actionProgress = 0;
      player.hitThisSwing.clear();
      player.vx *= 0.2;
      effects.slash(
        player.x + player.w / 2,
        centerY,
        resolveSpinRadius(mods),
        0,
        Math.PI * 2,
        SKILLS.spin.color,
        3,
        true,
        0.3
      );
      effects.ring(player.x + player.w / 2, player.y + player.h, 10, 12, SKILLS.spin.color, 0.15);
      break;
    }
    case 'dash': {
      if (player.state === 'dash') return false;
      player.state = 'dash';
      player.stateTime = 0;
      player.actionProgress = 0;
      player.hitThisSwing.clear();
      player.vx = DASH_SPEED * player.facing;
      player.vy = 0;
      // 冲刺无敌：覆盖冲刺时长 + 0.1s 缓冲（需求 2）。
      const duration = SKILLS.dash.duration;
      player.invuln = Math.max(player.invuln, duration + 0.1);
      effects.spray(
        player.x + player.w / 2 - player.facing * 6,
        player.y + player.h * 0.6,
        -player.facing,
        -0.25,
        10,
        SKILLS.dash.color,
        { speed: 90, size: 2, life: 0.35, gravity: 20 }
      );
      break;
    }
    case 'heal': {
      const amount = resolveHealAmount(player, mods);
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + amount);
      const healed = Math.round(player.hp - before);
      if (healed <= 0) {
        // 满血时不浪费冷却。
        effects.text(player.x + player.w / 2, player.y - 6, '满血', '#9fb0c4', 6);
        return false;
      }
      effects.ring(player.x + player.w / 2, player.y + player.h * 0.6, 12, 8, SKILLS.heal.color, 0.8);
      effects.text(player.x + player.w / 2, player.y - 8, `+${healed}`, SKILLS.heal.color, 7);
      break;
    }
    default:
      return false;
  }

  player.cooldowns[id] = resolveCooldown(id, mods);
  player.cooldownMax[id] = SKILLS[id].cooldown;
  return true;
}

/** 每帧推进冷却（暂停 / 结算时不会被调用，所以时间不会偷偷流逝）。 */
export function tickCooldowns(player: Player, dt: number): void {
  for (const id of SKILL_IDS) {
    if (player.cooldowns[id] > 0) {
      player.cooldowns[id] = Math.max(0, player.cooldowns[id] - dt);
    }
  }
}

export const spinHitbox = (player: Player, mods: PlayerModifiers) => {
  const r = resolveSpinRadius(mods);
  return {
    x: player.x + player.w / 2 - r,
    y: player.y + player.h / 2 - r,
    w: r * 2,
    h: r * 2
  };
};

export const dashHitbox = (player: Player) => ({
  x: player.x - 2,
  y: player.y + 2,
  w: player.w + 4,
  h: player.h - 2
});

export { DASH_KNOCKBACK };
