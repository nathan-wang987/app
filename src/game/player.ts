import {
  GRAVITY,
  PLAYER_ATTACK_ACTIVE,
  PLAYER_ATTACK_COOLDOWN,
  PLAYER_BASE_ATTACK,
  PLAYER_BASE_HP,
  PLAYER_BASE_SPEED,
  PLAYER_H,
  PLAYER_INVULN_AFTER_HIT,
  PLAYER_JUMP_SPEED,
  PLAYER_MAX_AIR_JUMPS,
  PLAYER_START_X,
  PLAYER_W,
  SKILLS,
  xpForLevel
} from './constants';
import { moveBody } from './physics';
import { meleeHitbox, resolveHitbox, type CombatEnv } from './combat';
import { castSkill } from './skills';
import type { Effects } from './effects';
import type { Player, PlayerModifiers, SkillId } from './types';

export function createPlayer(): Player {
  return {
    x: PLAYER_START_X,
    y: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    grounded: false,
    state: 'idle',
    facing: 1,
    hp: PLAYER_BASE_HP,
    maxHp: PLAYER_BASE_HP,
    attack: PLAYER_BASE_ATTACK,
    moveSpeed: PLAYER_BASE_SPEED,
    jumpSpeed: PLAYER_JUMP_SPEED,
    airJumpsLeft: PLAYER_MAX_AIR_JUMPS,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    cooldowns: { spin: 0, dash: 0, heal: 0 },
    cooldownMax: { spin: SKILLS.spin.cooldown, dash: SKILLS.dash.cooldown, heal: SKILLS.heal.cooldown },
    stateTime: 0,
    invuln: 0,
    hitFlash: 0,
    attackCooldown: 0,
    hitThisSwing: new Set<number>(),
    animTime: 0,
    actionProgress: 0
  };
}

export interface PlayerInputLatch {
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  moveDir: number;
  skillRequests: SkillId[];
}

export interface PlayerUpdateContext {
  input: PlayerInputLatch;
  mods: PlayerModifiers;
  effects: Effects;
  env: CombatEnv;
  /** 是否允许出招（结算 / 升级 / 暂停时为 false）。 */
  canAct: boolean;
}

const IDLE_DAMP = 0.0006;
const AIR_CONTROL = 0.72;

/**
 * 玩家每帧更新：读输入 → 状态机 → 物理 → 攻击判定。
 * 只有 canAct 为 true 才会响应战斗输入（需求 6）。
 */
export function updatePlayer(player: Player, dt: number, ctx: PlayerUpdateContext): void {
  const { input, mods, effects, env, canAct } = ctx;
  player.animTime += dt;
  player.stateTime += dt;
  player.actionProgress = 0;

  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
  if (player.hitFlash > 0) player.hitFlash = Math.max(0, player.hitFlash - dt);
  if (player.attackCooldown > 0) player.attackCooldown = Math.max(0, player.attackCooldown - dt);

  // --- 移动 ---
  if (player.state !== 'dead' && player.state !== 'dash' && player.state !== 'hurt') {
    const control = player.grounded ? 1 : AIR_CONTROL;
    const speed = player.moveSpeed * (1 + mods.bonusMoveSpeed) * control;
    if (input.moveDir !== 0) {
      player.vx += (input.moveDir * speed - player.vx) * (player.grounded ? 0.4 : 0.18);
      player.facing = input.moveDir > 0 ? 1 : -1;
    } else if (player.grounded) {
      player.vx *= 1 - Math.min(0.9, IDLE_DAMP * 2400 * dt * 60 * 0.0167);
      if (Math.abs(player.vx) < 2) player.vx = 0;
    }
    if (player.state === 'attack' || player.state === 'spin') {
      // 出招期间锁住脚步，只能微调朝向。
      player.vx *= 1 - Math.min(0.9, dt * 12);
    }
  }

  // --- 跳跃：地面跳 + 一次空中跳（需求 1） ---
  if (canAct && player.state !== 'dead' && player.state !== 'hurt') {
    if (input.jumpPressed) {
      if (player.grounded) {
        player.vy = -player.jumpSpeed;
        player.grounded = false;
        player.airJumpsLeft = PLAYER_MAX_AIR_JUMPS;
        effects.burst(player.x + player.w / 2, player.y + player.h, 4, '#b9c6d6', {
          speed: 42,
          size: 1,
          life: 0.25,
          gravity: 120
        });
      } else if (player.airJumpsLeft > 0) {
        player.airJumpsLeft -= 1;
        player.vy = -player.jumpSpeed * 0.92;
        player.state = 'rise';
        player.stateTime = 0;
        effects.ring(player.x + player.w / 2, player.y + player.h * 0.75, 8, 7, '#8fd7ff', 0.5);
      }
    }
    // 松开跳跃键立刻减速上升 → 可变跳跃高度，手感更好。
    if (!input.jumpHeld && player.vy < -60) player.vy = Math.max(player.vy, -60);
  }

  // --- 攻击 ---
  if (canAct && input.attackPressed && player.attackCooldown <= 0 && (player.state === 'idle' || player.state === 'run' || player.state === 'rise' || player.state === 'fall')) {
    player.state = 'attack';
    player.stateTime = 0;
    player.attackCooldown = PLAYER_ATTACK_COOLDOWN / (1 + mods.cooldownRate * 0.3);
    player.hitThisSwing.clear();
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h * 0.45;
    const base = player.facing === 1 ? -0.9 : Math.PI + 0.9;
    const end = player.facing === 1 ? 0.8 : Math.PI - 0.8;
    effects.slash(cx, cy, 16 + mods.bonusReach, base, end, '#e8f4ff', 2, false, 0.16);
  }

  // --- 技能（冷却由 skills.ts 管理，界面读取同一份数据） ---
  if (canAct) {
    for (const id of input.skillRequests) {
      castSkill(id, { player, mods, effects });
    }
  }

  // --- 状态机推进 ---
  advanceState(player, dt);

  // --- 重力与物理 ---
  if (player.state !== 'dash') {
    player.vy += GRAVITY * dt;
  }
  const move = moveBody(player, dt);
  if (move.landed) {
    player.airJumpsLeft = PLAYER_MAX_AIR_JUMPS;
    if (player.state === 'rise' || player.state === 'fall') {
      player.state = 'idle';
      player.stateTime = 0;
    }
    effects.burst(player.x + player.w / 2, player.y + player.h, 3, '#9aa7b8', {
      speed: 34,
      size: 1,
      life: 0.22,
      gravity: 200
    });
  }

  // --- 攻击判定 ---
  if (player.state === 'attack') {
    const active = player.stateTime <= PLAYER_ATTACK_ACTIVE;
    if (active) {
      const box = meleeHitbox(player, mods);
      resolveHitbox(box, player.attack, 108, env, player.hitThisSwing, player.x + player.w / 2);
    }
  }

  if (player.state !== 'hurt' && player.state !== 'dead' && player.state !== 'attack' && player.state !== 'spin' && player.state !== 'dash') {
    if (!player.grounded) {
      if (player.state !== 'rise' && player.state !== 'fall') {
        player.state = player.vy < 0 ? 'rise' : 'fall';
        player.stateTime = 0;
      } else if (player.state === 'rise' && player.vy >= 0) {
        player.state = 'fall';
        player.stateTime = 0;
      }
    } else {
      const moving = Math.abs(player.vx) > 12;
      const next = moving ? 'run' : 'idle';
      if (next !== player.state) {
        player.state = next;
        player.stateTime = 0;
      }
    }
  }
}

function advanceState(player: Player, dt: number): void {
  switch (player.state) {
    case 'attack':
      if (player.stateTime >= 0.28) {
        player.state = player.grounded ? 'idle' : 'fall';
        player.stateTime = 0;
      }
      break;
    case 'spin':
      player.actionProgress = Math.min(1, player.stateTime / SKILLS.spin.duration);
      if (player.stateTime >= SKILLS.spin.duration) {
        player.state = player.grounded ? 'idle' : 'fall';
        player.stateTime = 0;
      }
      break;
    case 'dash':
      player.actionProgress = Math.min(1, player.stateTime / SKILLS.dash.duration);
      if (player.stateTime >= SKILLS.dash.duration) {
        player.vx *= 0.35;
        player.state = player.grounded ? 'idle' : 'fall';
        player.stateTime = 0;
      }
      break;
    case 'hurt':
      if (player.stateTime >= 0.26) {
        player.state = player.grounded ? 'idle' : 'fall';
        player.stateTime = 0;
        player.invuln = Math.max(player.invuln, PLAYER_INVULN_AFTER_HIT * 0.6);
      }
      break;
    default:
      break;
  }
  if (player.state === 'dead') player.actionProgress = Math.min(1, player.stateTime / 0.6);
  void dt;
}
