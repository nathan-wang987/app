import { clamp, rectCenterX, rectCenterY, overlaps } from '../engine/math';
import { collidesAny, moveBody } from '../engine/physics';
import type { Body, Facing } from '../engine/types';
import { makeBody } from '../engine/types';
import { WORLD } from './constants';
import { damagePlayer } from './combat';
import type { World } from './world';

export type MonsterKind = 'grunt' | 'berserker' | 'brute';
export type MonsterAi = 'chase' | 'windup' | 'attack' | 'recover' | 'hurt';

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  /** 特征描述（开始界面/图鉴展示） */
  trait: string;
  sprite: string;
  hp: number;
  damage: number;
  speed: number;
  w: number;
  h: number;
  exp: number;
  aggroRange: number;
  attackRange: number;
  /** 出手前的预警时间（秒） */
  windup: number;
  attackActive: number;
  attackRecover: number;
  attackCooldown: number;
  knockbackResist: number;
  jumpSpeed: number;
  /** melee = 原地挥击，lunge = 预警后向前突刺 */
  attackStyle: 'melee' | 'lunge';
  /** 攻击判定框（相对身体，facing 为右时的偏移） */
  hitbox: { x: number; y: number; w: number; h: number };
  bloodColor: string;
  /** 预警时头顶感叹号的大小 */
  alertLevel: 1 | 2 | 3;
}

export const MONSTER_DEFS: Record<MonsterKind, MonsterDef> = {
  grunt: {
    kind: 'grunt',
    name: '绿皮哥布林',
    trait: '普通怪：会一路追着你砍，中规中矩',
    sprite: 'grunt',
    hp: 44,
    damage: 9,
    speed: 112,
    w: 30,
    h: 42,
    exp: 12,
    aggroRange: 700,
    attackRange: 46,
    windup: 0.34,
    attackActive: 0.16,
    attackRecover: 0.26,
    attackCooldown: 0.85,
    knockbackResist: 0,
    jumpSpeed: 560,
    attackStyle: 'melee',
    hitbox: { x: 18, y: 6, w: 40, h: 32 },
    bloodColor: '#6fbf4a',
    alertLevel: 1,
  },
  berserker: {
    kind: 'berserker',
    name: '狂暴小鬼',
    trait: '脆皮高伤：出手前会站定、全身发红并顶出大感叹号，随后猛冲一刀',
    sprite: 'berserker',
    hp: 26,
    damage: 27,
    speed: 158,
    w: 26,
    h: 42,
    exp: 15,
    aggroRange: 980,
    attackRange: 74,
    windup: 0.78,
    attackActive: 0.42,
    attackRecover: 0.5,
    attackCooldown: 1.15,
    knockbackResist: 0,
    jumpSpeed: 580,
    attackStyle: 'lunge',
    hitbox: { x: 10, y: 4, w: 40, h: 36 },
    bloodColor: '#ef4444',
    alertLevel: 3,
  },
  brute: {
    kind: 'brute',
    name: '肥壮巨怪',
    trait: '肉盾：走得慢、打人不疼，但血厚得离谱',
    sprite: 'brute',
    hp: 96,
    damage: 7,
    speed: 62,
    w: 58,
    h: 58,
    exp: 26,
    aggroRange: 560,
    attackRange: 64,
    windup: 0.85,
    attackActive: 0.22,
    attackRecover: 0.55,
    attackCooldown: 1.5,
    knockbackResist: 0.78,
    jumpSpeed: 430,
    attackStyle: 'melee',
    hitbox: { x: 30, y: 10, w: 78, h: 48 },
    bloodColor: '#8b5cf6',
    alertLevel: 2,
  },
};

export interface Monster extends Body {
  id: number;
  kind: MonsterKind;
  def: MonsterDef;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  expReward: number;
  ai: MonsterAi;
  timer: number;
  facing: Facing;
  hitFlash: number;
  hurtTimer: number;
  cooldown: number;
  jumpCooldown: number;
  didHit: boolean;
  /** 0..1 预警进度，界面/渲染用它做提示 */
  telegraph: number;
  animTime: number;
  dead: boolean;
}

export interface SpawnStats {
  hpMul: number;
  dmgMul: number;
  speedMul: number;
  expMul: number;
}

export function createMonster(world: World, kind: MonsterKind, x: number, y: number, scale: SpawnStats): Monster {
  const def = MONSTER_DEFS[kind];
  const body = makeBody(x, y, def.w, def.h);
  const hp = Math.round(def.hp * scale.hpMul);
  return {
    ...body,
    id: world.nextMonsterId++,
    kind,
    def,
    hp,
    maxHp: hp,
    damage: def.damage * scale.dmgMul,
    speed: def.speed * scale.speedMul,
    expReward: Math.round(def.exp * scale.expMul),
    ai: 'chase',
    timer: 0,
    facing: -1,
    hitFlash: 0,
    hurtTimer: 0,
    cooldown: 0,
    jumpCooldown: 0,
    didHit: false,
    telegraph: 0,
    animTime: 0,
    dead: false,
  };
}

/** 怪物攻击判定框（世界坐标） */
export function monsterAttackHitbox(monster: Monster): { x: number; y: number; w: number; h: number } {
  const hb = monster.def.hitbox;
  const x = monster.facing === 1 ? monster.x + hb.x : monster.x + monster.w - hb.x - hb.w;
  return { x, y: monster.y + hb.y, w: hb.w, h: hb.h };
}

/**
 * 找出脚下支撑最近消失的方向（1 = 右边是平台边缘，-1 = 左边是平台边缘，0 = 附近都是实地）。
 * 用来让站在平台上的怪主动走到边缘跳下去追玩家。
 */
function findLedgeDirection(world: World, monster: Monster): number {
  const probeY = monster.y + monster.h + 4;
  for (let distance = 28; distance <= 152; distance += 28) {
    for (let index = 0; index < 2; index += 1) {
      const dir = index === 0 ? 1 : -1;
      const x = monster.x + dir * distance;
      if (x < 0 || x + monster.w > world.arena.bounds.w) return dir;
      const probe = { x, y: probeY, w: monster.w, h: 8 };
      if (!collidesAny(probe, world.arena.solids)) return dir;
    }
  }
  return 0;
}

export function updateMonster(world: World, monster: Monster, dt: number): void {
  const player = world.player;
  monster.animTime += dt;
  if (monster.hitFlash > 0) monster.hitFlash = Math.max(0, monster.hitFlash - dt);
  if (monster.hurtTimer > 0) monster.hurtTimer = Math.max(0, monster.hurtTimer - dt);
  if (monster.cooldown > 0) monster.cooldown = Math.max(0, monster.cooldown - dt);
  if (monster.jumpCooldown > 0) monster.jumpCooldown = Math.max(0, monster.jumpCooldown - dt);

  const def = monster.def;
  const playerCx = rectCenterX(player);
  const monsterCx = rectCenterX(monster);
  const dx = playerCx - monsterCx;
  const dy = rectCenterY(player) - rectCenterY(monster);
  const distX = Math.abs(dx);
  const distY = Math.abs(dy);

  if (monster.ai === 'chase' || monster.ai === 'hurt') {
    if (monster.ai === 'hurt') {
      monster.timer -= dt;
      if (monster.timer <= 0) monster.ai = 'chase';
    }

    if (monster.ai === 'chase') {
      monster.facing = dx >= 0 ? 1 : -1;
      const inRange = distX <= def.attackRange && distY < 52;
      if (inRange && monster.cooldown <= 0) {
        monster.ai = 'windup';
        monster.timer = def.windup;
        monster.telegraph = 0;
        monster.didHit = false;
        monster.vx = 0;
      } else if (distX < def.aggroRange) {
        const playerBelow = player.y - monster.y > 40;
        if (playerBelow && monster.onGround && distX < 260) {
          // 玩家在下方：走到平台边缘掉下去追，别站在平台上干等
          const ledgeDir = findLedgeDirection(world, monster);
          if (ledgeDir !== 0) monster.vx = ledgeDir * def.speed;
          else monster.vx = clamp(dx * 3, -def.speed, def.speed);
        } else {
          monster.vx = clamp(dx * 3, -def.speed, def.speed);
        }
      } else {
        monster.vx *= 0.9;
      }
    }
  } else if (monster.ai === 'windup') {
    monster.vx *= 0.82;
    monster.facing = dx >= 0 ? 1 : -1;
    monster.timer -= dt;
    monster.telegraph = clamp(1 - monster.timer / def.windup, 0, 1);
    if (monster.timer <= 0) {
      monster.ai = 'attack';
      monster.timer = def.attackActive;
      monster.telegraph = 1;
      monster.didHit = false;
    }
  } else if (monster.ai === 'attack') {
    if (def.attackStyle === 'lunge') {
      monster.vx = monster.facing * def.speed * 3.1;
      // 突刺期间持续判定（碰到就掉血，一次攻击只结算一次）
      if (!monster.didHit && overlaps(monster, player)) {
        monster.didHit = true;
        damagePlayer(world, monster.damage, { sourceX: monsterCx, attacker: monster });
      }
    } else if (!monster.didHit) {
      monster.didHit = true;
      const box = monsterAttackHitbox(monster);
      if (overlaps(box, player)) {
        damagePlayer(world, monster.damage, { sourceX: monsterCx, attacker: monster });
      }
      world.fx.spawnBurst(rectCenterX(box), rectCenterY(box), 6, monster.def.bloodColor, {
        speed: 140,
        size: 3,
        gravity: 380,
        life: 0.3,
      });
    }
    monster.timer -= dt;
    monster.telegraph = clamp(monster.timer / Math.max(def.attackActive, 0.001), 0, 1);
    if (monster.timer <= 0) {
      monster.ai = 'recover';
      monster.timer = def.attackRecover;
    }
  } else if (monster.ai === 'recover') {
    monster.vx *= 0.8;
    monster.telegraph = 0;
    monster.timer -= dt;
    if (monster.timer <= 0) {
      monster.ai = 'chase';
      monster.cooldown = def.attackCooldown;
    }
  }

  // 重力与地形碰撞
  monster.vy = Math.min(monster.vy + WORLD.gravity * dt, WORLD.maxFallSpeed);
  const flags = moveBody(monster, world.arena.solids, monster.vx * dt, monster.vy * dt);

  const canJump = monster.onGround && monster.jumpCooldown <= 0 && monster.ai !== 'windup' && monster.ai !== 'attack';
  if (canJump) {
    // 玩家在高处时按需要的高度起跳，避免站在平台上就再也打不到
    const needRise = monster.y + monster.h - (player.y + player.h);
    const playerAbove = needRise > 55 && Math.abs(dx) < 280;
    if (playerAbove) {
      const velocity = Math.sqrt(2 * WORLD.gravity * (needRise + 40));
      monster.vy = -Math.min(velocity, 1250);
      monster.jumpCooldown = 0.9;
      monster.onGround = false;
    } else if (flags.hitX) {
      // 被石块/木箱挡住就翻过去
      monster.vy = -def.jumpSpeed;
      monster.jumpCooldown = 0.75;
      monster.onGround = false;
    }
  }
  if (monster.onGround) monster.jumpCooldown = 0;

  monster.x = clamp(monster.x, 0, world.arena.bounds.w - monster.w);
  if (monster.y > WORLD.killPlaneY) {
    // 掉出世界的兜底（正常情况下不会发生）
    monster.hp = 0;
    monster.dead = true;
    world.monstersDropped += 1;
  }
}

/**
 * 防止怪物叠在同一个位置：两两检测，水平方向互相推开。
 * 数量被波次限制在几十只以内，O(n²) 完全够用。
 */
export function separateMonsters(world: World): void {
  const monsters = world.monsters;
  for (let i = 0; i < monsters.length; i += 1) {
    const a = monsters[i];
    if (a.dead) continue;
    for (let j = i + 1; j < monsters.length; j += 1) {
      const b = monsters[j];
      if (b.dead) continue;
      if (!overlaps(a, b)) continue;
      const ac = rectCenterX(a);
      const bc = rectCenterX(b);
      const dir = ac === bc ? (a.id % 2 === 0 ? 1 : -1) : ac < bc ? -1 : 1;
      const push = 26;
      a.x += dir * push * 0.5;
      b.x -= dir * push * 0.5;
    }
  }

  // 互相推开后可能被挤进石块里，逐只推回来
  for (let i = 0; i < monsters.length; i += 1) {
    const monster = monsters[i];
    if (monster.dead) continue;
    resolveSolidOverlap(monster, world.arena.solids);
    monster.x = clamp(monster.x, 0, world.arena.bounds.w - monster.w);
  }

  // 还有挤在一起的（例如被墙夹住），在附近找一个既不进墙也不压到别人的落点
  for (let i = 0; i < monsters.length; i += 1) {
    const monster = monsters[i];
    if (monster.dead) continue;
    nudgeToFreeSpot(world, monster);
  }
}

function overlapsAnyMonster(monsters: readonly Monster[], self: Monster, x: number): boolean {
  for (let i = 0; i < monsters.length; i += 1) {
    const other = monsters[i];
    if (other === self || other.dead) continue;
    if (x < other.x + other.w && x + self.w > other.x && self.y < other.y + other.h && self.y + self.h > other.y) {
      return true;
    }
  }
  return false;
}

function nudgeToFreeSpot(world: World, monster: Monster): void {
  const monsters = world.monsters;
  let blocked = false;
  for (let i = 0; i < monsters.length; i += 1) {
    const other = monsters[i];
    if (other === monster || other.dead) continue;
    if (overlaps(monster, other)) {
      blocked = true;
      break;
    }
  }
  if (!blocked) return;

  const originX = monster.x;
  const step = 8;
  for (let distance = step; distance <= 200; distance += step) {
    for (let dirIndex = 0; dirIndex < 2; dirIndex += 1) {
      const dir = dirIndex === 0 ? 1 : -1;
      const x = originX + dir * distance;
      if (x < 0 || x + monster.w > world.arena.bounds.w) continue;
      const candidate = { x, y: monster.y + 1, w: monster.w - 2, h: monster.h - 2 };
      if (collidesAny(candidate, world.arena.solids)) continue;
      if (overlapsAnyMonster(monsters, monster, x)) continue;
      monster.x = x;
      return;
    }
  }

  // 实在没地方站（例如被墙夹住）：踩到对方头上，至少不会完全重合
  for (let i = 0; i < monsters.length; i += 1) {
    const other = monsters[i];
    if (other === monster || other.dead) continue;
    if (!overlaps(monster, other)) continue;
    monster.y = Math.max(0, other.y - monster.h);
    monster.vy = 0;
    return;
  }
}

/** 把陷进静态实体里的体块按“位移最小”的方向推出来 */
export function resolveSolidOverlap(body: Body, solids: readonly { x: number; y: number; w: number; h: number }[]): void {
  for (let i = 0; i < solids.length; i += 1) {
    const solid = solids[i];
    if (!overlaps(body, solid)) continue;
    const pushRight = solid.x + solid.w - body.x;
    const pushLeft = body.x + body.w - solid.x;
    const pushDown = solid.y + solid.h - body.y;
    const pushUp = body.y + body.h - solid.y;
    const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
    if (min === pushLeft) body.x = solid.x - body.w;
    else if (min === pushRight) body.x = solid.x + solid.w;
    else if (min === pushUp) body.y = solid.y - body.h;
    else body.y = solid.y + solid.h;
  }
}
