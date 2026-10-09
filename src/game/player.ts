import { Cooldown } from '../engine/time';
import { clamp, overlaps, rectCenterX, rectCenterY } from '../engine/math';
import { moveBody } from '../engine/physics';
import type { Body, Facing } from '../engine/types';
import { makeBody } from '../engine/types';
import { PLAYER, SKILL_TUNING, WORLD } from './constants';
import { damageInRadius, damageInRect, damageMonster, healPlayer } from './combat';
import { SKILL_DEFS, SKILL_ORDER, type SkillId } from './skills';
import type { World } from './world';

export type PlayerActionState = 'idle' | 'attack' | 'spin' | 'dash';

export interface PlayerStats {
  /** 普攻间隔倍率（<1 更快） */
  attackSpeedMul: number;
  /** 技能冷却倍率（<1 更短） */
  cooldownMul: number;
  lifesteal: number;
  thorns: number;
  damageReduction: number;
  lowHpBonus: number;
  dashDamageMul: number;
  spinRadiusMul: number;
  spinDamageMul: number;
  jumpBlastDamage: number;
  executioner: number;
  healMul: number;
  moveSpeedMul: number;
}

export interface Player extends Body {
  hp: number;
  maxHp: number;
  attack: number;
  facing: Facing;
  invuln: number;
  hurtFlash: number;
  action: PlayerActionState;
  /** 当前动作剩余时间 */
  actionTimer: number;
  /** 当前动作总时长 */
  actionDuration: number;
  attackHits: Set<number>;
  attackHitDone: boolean;
  spinHits: Set<number>;
  dashHits: Set<number>;
  dashDir: number;
  healTimer: number;
  jumpCount: number;
  coyote: number;
  jumpBuffer: number;
  /** 普攻预输入：动作播完立刻接下一刀，避免连打把动作无限重置 */
  attackBuffered: boolean;
  jumpBlastReady: boolean;
  wasOnGround: boolean;
  animTime: number;
  attackCooldown: Cooldown;
  cooldowns: Record<SkillId, Cooldown>;
  stats: PlayerStats;
  /** 升级加成堆叠数量 */
  upgrades: Record<string, number>;
}

export function createPlayerStats(): PlayerStats {
  return {
    attackSpeedMul: 1,
    cooldownMul: 1,
    lifesteal: 0,
    thorns: 0,
    damageReduction: 0,
    lowHpBonus: 0,
    dashDamageMul: 1,
    spinRadiusMul: 1,
    spinDamageMul: 1,
    jumpBlastDamage: 0,
    executioner: 0,
    healMul: 1,
    moveSpeedMul: 1,
  };
}

export function createPlayer(): Player {
  const player: Player = {
    ...makeBody(PLAYER.spawnX, 0, PLAYER.bodyW, PLAYER.bodyH),
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    attack: PLAYER.attack,
    facing: 1,
    invuln: 0,
    hurtFlash: 0,
    action: 'idle',
    actionTimer: 0,
    actionDuration: 0,
    attackHits: new Set<number>(),
    attackHitDone: false,
    spinHits: new Set<number>(),
    dashHits: new Set<number>(),
    dashDir: 1,
    healTimer: 0,
    jumpCount: 0,
    coyote: 0,
    jumpBuffer: 0,
    attackBuffered: false,
    jumpBlastReady: true,
    wasOnGround: true,
    animTime: 0,
    attackCooldown: new Cooldown(PLAYER.attackCooldown),
    cooldowns: {
      spin: new Cooldown(SKILL_DEFS.spin.cooldown),
      dash: new Cooldown(SKILL_DEFS.dash.cooldown),
      heal: new Cooldown(SKILL_DEFS.heal.cooldown),
    },
    stats: createPlayerStats(),
    upgrades: {},
  };
  player.y = 0;
  return player;
}

/** 玩家当前的普攻判定框 */
export function playerAttackHitbox(player: Player): { x: number; y: number; w: number; h: number } {
  const w = 46;
  const h = 38;
  const x = player.facing === 1 ? player.x + player.w - 6 : player.x - w + 6;
  const y = player.y + 4;
  return { x, y, w, h };
}

function attackDamage(player: Player): number {
  return player.attack;
}

/** 玩家每个固定步的逻辑 */
export function updatePlayer(world: World, dt: number): void {
  const player = world.player;
  const input = world.input;
  const canAct = world.canPlayerAct();
  const canMove = world.canPlayerMove();

  player.animTime += dt;
  player.attackCooldown.tick(dt);
  for (const id of SKILL_ORDER) player.cooldowns[id].tick(dt);
  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
  if (player.hurtFlash > 0) player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  if (player.healTimer > 0) player.healTimer = Math.max(0, player.healTimer - dt);
  if (player.jumpBuffer > 0) player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  if (player.coyote > 0) player.coyote = Math.max(0, player.coyote - dt);

  const axis = canMove ? input.axisX() : 0;
  if (axis !== 0 && player.action !== 'dash') player.facing = axis > 0 ? 1 : -1;

  // ---- 输入：跳跃（含二段跳） ----
  if (canMove && input.justPressed('jump')) player.jumpBuffer = PLAYER.jumpBufferTime;
  const canGroundJump = player.onGround || player.coyote > 0;
  if (player.jumpBuffer > 0 && canGroundJump && player.action !== 'dash') {
    player.vy = -PLAYER.jumpSpeed;
    player.jumpCount = 1;
    player.jumpBuffer = 0;
    player.coyote = 0;
    player.onGround = false;
    player.jumpBlastReady = true;
    world.fx.spawnDust(rectCenterX(player), player.y + player.h, 5, '#9c8f76');
  } else if (player.jumpBuffer > 0 && player.jumpCount < 2 && player.action !== 'dash') {
    player.vy = -PLAYER.doubleJumpSpeed;
    player.jumpCount = 2;
    player.jumpBuffer = 0;
    player.jumpBlastReady = false;
    world.fx.spawnBurst(rectCenterX(player), player.y + player.h, 8, '#a5d8ff', {
      speed: 120,
      size: 3,
      gravity: 320,
      life: 0.35,
    });
    if (player.stats.jumpBlastDamage > 0) {
      const hits = new Set<number>();
      damageInRadius(world, rectCenterX(player), rectCenterY(player), 92, player.stats.jumpBlastDamage, hits, {
        source: 'jumpBlast',
        color: '#a5d8ff',
        knockX: 120,
      });
      if (hits.size > 0) world.addShake(3);
    }
  }

  // ---- 输入：普攻（预输入，动作播完才接下一刀） ----
  if (canAct && input.justPressed('attack')) player.attackBuffered = true;
  if (!canAct) player.attackBuffered = false;
  if (player.attackBuffered && player.attackCooldown.ready && player.action === 'idle') startAttack(world);

  // ---- 输入：技能 ----
  if (canAct) {
    if (input.justPressed('skill1')) useSkill(world, 'spin');
    if (input.justPressed('skill2')) useSkill(world, 'dash');
    if (input.justPressed('skill3')) useSkill(world, 'heal');
  }

  // ---- 动作状态机 ----
  if (player.actionTimer > 0) {
    player.actionTimer = Math.max(0, player.actionTimer - dt);
    const elapsed = player.actionDuration - player.actionTimer;

    if (player.action === 'attack') {
      if (!player.attackHitDone && elapsed >= PLAYER.attackHitStart) {
        player.attackHitDone = true;
        damageInRect(world, playerAttackHitbox(player), attackDamage(player), player.attackHits, {
          source: 'melee',
          color: '#ffd166',
          knockX: 180 * player.facing,
          knockY: -60,
        });
      }
    } else if (player.action === 'spin') {
      if (elapsed >= SKILL_TUNING.spin.hitStart && elapsed <= SKILL_TUNING.spin.hitEnd) {
        const radius = SKILL_TUNING.spin.radius * player.stats.spinRadiusMul;
        damageInRadius(
          world,
          rectCenterX(player),
          rectCenterY(player),
          radius,
          player.attack * SKILL_TUNING.spin.damageMul * player.stats.spinDamageMul,
          player.spinHits,
          { source: 'spin', color: '#6ee7b7', knockX: 200 * player.facing, knockY: -80 },
        );
      }
    } else if (player.action === 'dash') {
      player.vx = player.dashDir * SKILL_TUNING.dash.speed;
      player.vy = 0;
      for (const monster of world.monsters) {
        if (monster.dead || player.dashHits.has(monster.id)) continue;
        if (!overlaps(player, monster)) continue;
        player.dashHits.add(monster.id);
        damageMonster(world, monster, player.attack * SKILL_TUNING.dash.damageMul * player.stats.dashDamageMul, {
          source: 'dash',
          color: '#7dd3fc',
          knockX: 260 * player.dashDir,
          knockY: -120,
        });
        world.addShake(3.5);
      }
      world.fx.spawnBurst(rectCenterX(player), rectCenterY(player), 2, '#7dd3fc', {
        speed: 70,
        size: 3,
        gravity: 0,
        life: 0.25,
      });
    }
  }

  if (player.actionTimer <= 0 && player.action !== 'idle') {
    if (player.action === 'attack') player.attackCooldown.trigger(PLAYER.attackCooldown * player.stats.attackSpeedMul);
    player.action = 'idle';
    player.actionDuration = 0;
  }

  // 动作播完、冷却也好了，就把连打时预输入的那一刀放出去
  if (canAct && player.attackBuffered && player.attackCooldown.ready && player.action === 'idle') {
    startAttack(world);
  }

  // ---- 水平移动 ----
  if (player.action !== 'dash') {
    const maxSpeed = PLAYER.moveSpeed * player.stats.moveSpeedMul * (player.action === 'spin' ? 0.35 : 1);
    const accel = (player.onGround ? PLAYER.accel : PLAYER.airAccel) * (player.action === 'spin' ? 0.5 : 1);
    if (axis !== 0) {
      player.vx = clamp(player.vx + axis * accel * dt, -maxSpeed * 1.4, maxSpeed * 1.4);
      if (Math.abs(player.vx) > maxSpeed) player.vx = Math.sign(player.vx) * maxSpeed;
    } else if (player.onGround) {
      const drop = PLAYER.friction * dt;
      player.vx = Math.abs(player.vx) <= drop ? 0 : player.vx - Math.sign(player.vx) * drop;
    } else {
      player.vx *= Math.max(0, 1 - PLAYER.airAccel * 0.00035 * dt * 60);
    }
  }

  // ---- 重力与物理 ----
  player.vy = Math.min(player.vy + WORLD.gravity * dt, WORLD.maxFallSpeed);
  const flags = moveBody(player, world.arena.solids, player.vx * dt, player.vy * dt);

  if (player.onGround) {
    if (!player.wasOnGround) {
      world.fx.spawnDust(rectCenterX(player), player.y + player.h, 6, '#9c8f76');
    }
    player.jumpCount = 0;
    player.coyote = PLAYER.coyoteTime;
    player.jumpBlastReady = true;
  } else if (player.wasOnGround) {
    player.coyote = PLAYER.coyoteTime;
  }
  player.wasOnGround = player.onGround;
  if (flags.ceiling) player.vy = 0;

  // 世界边界
  player.x = clamp(player.x, 0, world.arena.bounds.w - player.w);
  if (player.y > world.arena.bounds.h) {
    player.y = world.arena.bounds.h;
    player.hp = 0;
    world.onPlayerDeath();
  }
}

function startAttack(world: World): void {
  const player = world.player;
  player.attackBuffered = false;
  player.action = 'attack';
  player.actionDuration = PLAYER.attackDuration * player.stats.attackSpeedMul;
  player.actionTimer = player.actionDuration;
  player.attackHitDone = false;
  player.attackHits.clear();
}

/**
 * 释放技能：统一处理冷却、暂停/结算状态下禁止释放、
 * 以及冷却缩减加成。
 */
export function useSkill(world: World, id: SkillId): boolean {
  const player = world.player;
  if (!world.canPlayerAct()) return false;
  if (player.action === 'dash') return false;
  const cooldown = player.cooldowns[id];
  if (!cooldown.ready) return false;

  switch (id) {
    case 'spin': {
      player.action = 'spin';
      player.actionDuration = SKILL_TUNING.spin.duration;
      player.actionTimer = player.actionDuration;
      player.spinHits.clear();
      player.vx *= 0.2;
      world.fx.spawnBurst(rectCenterX(player), rectCenterY(player), 14, '#6ee7b7', {
        speed: 240,
        size: 3,
        gravity: 120,
        life: 0.5,
      });
      world.addShake(3);
      break;
    }
    case 'dash': {
      const dir = world.input.axisX();
      player.facing = dir !== 0 ? (dir > 0 ? 1 : -1) : player.facing;
      player.action = 'dash';
      player.actionDuration = SKILL_TUNING.dash.duration;
      player.actionTimer = player.actionDuration;
      player.dashDir = player.facing;
      player.dashHits.clear();
      player.invuln = Math.max(player.invuln, player.actionDuration + 0.08);
      world.fx.spawnBurst(rectCenterX(player), rectCenterY(player), 16, '#7dd3fc', {
        speed: 200,
        size: 3,
        gravity: 0,
        life: 0.4,
      });
      world.addShake(3);
      break;
    }
    case 'heal': {
      if (player.hp >= player.maxHp) {
        world.showToast('生命已满，先别浪费治疗', 'info', 1.2);
        return false;
      }
      const amount = player.maxHp * SKILL_TUNING.heal.ratio * player.stats.healMul;
      healPlayer(world, amount);
      player.healTimer = SKILL_TUNING.heal.castTime;
      break;
    }
    default:
      return false;
  }

  cooldown.trigger(SKILL_DEFS[id].cooldown * player.stats.cooldownMul);
  world.emitEvent('skill', { id });
  return true;
}
