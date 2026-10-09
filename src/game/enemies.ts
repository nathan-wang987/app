import {
  ENEMY_CONFIGS,
  ENEMY_STAGGER,
  GRAVITY,
  GROUND_Y,
  MAX_ALIVE_ENEMIES
} from './constants';
import { SPAWN_ANCHORS, isStandingSpotFree } from './arena';
import { moveBody, positionBlocked } from './physics';
import { damagePlayer, type CombatEnv } from './combat';
import { SpatialHash } from '../engine/spatial';
import { circleSeparation, distSq, type Rect } from '../engine/math';
import type { Effects } from './effects';
import type { Enemy, EnemyKind, Player } from './types';
import type { Rng } from '../engine/rng';

const DEATH_LINGER = 0.45;
const ATTACK_WINDOW = 0.18;

function createEnemyShell(): Enemy {
  return {
    id: 0,
    active: false,
    kind: 'chaser',
    x: 0,
    y: 0,
    w: 14,
    h: 16,
    vx: 0,
    vy: 0,
    grounded: false,
    state: 'idle',
    stateTime: 0,
    facing: 1,
    hp: 1,
    maxHp: 1,
    damage: 1,
    speed: 50,
    xp: 1,
    attackRange: 16,
    attackCooldown: 0,
    windup: 0.3,
    attackDone: false,
    knockbackResist: 0,
    invuln: 0,
    hitFlash: 0,
    animTime: 0,
    bobPhase: 0,
    spawnGrace: 0,
    hopCooldown: 0
  };
}

/**
 * 怪物管理器：
 * - 统一对象复用（死亡后回收，避免长局 GC 抖动）
 * - 波次内生成点校验（不生成在墙里 / 不重叠 / 不贴着玩家）
 * - 通过空间哈希做同帧的怪物软分离（需求 10）
 */
export class EnemyManager {
  readonly enemies: Enemy[] = [];
  private readonly pool: Enemy[] = [];
  private readonly grid = new SpatialHash<Enemy>(40, 0, 0);
  private readonly scratch: Enemy[] = [];
  private nextId = 1;

  get aliveCount(): number {
    let count = 0;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      if (e.active && e.state !== 'dead') count += 1;
    }
    return count;
  }

  get totalActive(): number {
    return this.enemies.length;
  }

  /** 池化取出一个怪物实体，并应用波次强度缩放。 */
  spawn(kind: EnemyKind, wave: number, x: number, rng: Rng): Enemy | null {
    if (this.enemies.length >= MAX_ALIVE_ENEMIES + 8) return null;
    const enemy = this.pool.pop() ?? createEnemyShell();
    const config = ENEMY_CONFIGS[kind];
    const tier = Math.max(0, wave - 1);
    const hpScale = 1 + Math.min(0.9, tier * 0.035);

    enemy.id = this.nextId++;
    enemy.active = true;
    enemy.kind = kind;
    enemy.w = config.w;
    enemy.h = config.h;
    enemy.x = x;
    enemy.y = GROUND_Y - config.h;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.grounded = true;
    enemy.state = 'idle';
    enemy.stateTime = 0;
    enemy.facing = 1;
    enemy.maxHp = Math.round((config.baseHp + config.hpPerWave * tier) * hpScale);
    enemy.hp = enemy.maxHp;
    enemy.damage = config.baseDamage + config.damagePerWave * tier;
    enemy.speed = config.speed * (1 + Math.min(0.35, tier * 0.02));
    enemy.xp = config.xp;
    enemy.attackRange = config.attackRange;
    enemy.attackCooldown = rng.range(0.2, 0.8);
    enemy.windup = config.windup;
    enemy.attackDone = false;
    enemy.knockbackResist = config.knockbackResist;
    enemy.invuln = 0;
    enemy.hitFlash = 0;
    enemy.animTime = rng.range(0, 2);
    enemy.bobPhase = rng.range(0, Math.PI * 2);
    enemy.spawnGrace = 0.25;
    enemy.hopCooldown = 0;

    this.enemies.push(enemy);
    return enemy;
  }

  /**
   * 寻找合法出生点：不在实体方块内、与其它怪物保持最小间隔、与玩家保持距离。
   * 返回 null 表示本次找不到合适位置，由波次管理器稍后重试。
   */
  findSpawnX(kind: EnemyKind, player: Player, rng: Rng): number | null {
    const config = ENEMY_CONFIGS[kind];
    const anchors = SPAWN_ANCHORS;
    const playerCenter = player.x + player.w / 2;
    let fallback: number | null = null;
    let fallbackScore = -1;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const anchor = anchors[Math.floor(rng.next() * anchors.length)];
      const x = anchor + rng.range(-10, 10);
      if (x < 24 || x > 1920 - config.w - 24) continue;
      if (!isStandingSpotFree(x, config.w, config.h)) continue;

      const centerX = x + config.w / 2;
      const distToPlayer = Math.abs(centerX - playerCenter);
      // 与最近的同伴保持间隔，避免一堆怪叠在同一个位置（需求 10）。
      let nearestPeer = Number.POSITIVE_INFINITY;
      for (let i = 0; i < this.enemies.length; i += 1) {
        const other = this.enemies[i];
        if (!other.active || other.state === 'dead') continue;
        nearestPeer = Math.min(nearestPeer, Math.abs(other.x - x));
      }

      const score = distToPlayer + Math.min(nearestPeer, 200) * 2;
      if (score > fallbackScore) {
        fallbackScore = score;
        fallback = x;
      }
      // 不要贴着玩家刷（给反应时间），也不要和同伴挤在一起。
      if (distToPlayer < 110) continue;
      if (nearestPeer < ENEMY_STAGGER * 1.2) continue;
      return x;
    }

    // 兜底点也要求基本间隔：宁可晚一点生成，也不要叠怪。
    if (fallback !== null) {
      let nearestPeer = Number.POSITIVE_INFINITY;
      for (let i = 0; i < this.enemies.length; i += 1) {
        const other = this.enemies[i];
        if (!other.active || other.state === 'dead') continue;
        nearestPeer = Math.min(nearestPeer, Math.abs(other.x - fallback));
      }
      if (nearestPeer >= ENEMY_STAGGER * 0.75) return fallback;
    }
    return null;
  }

  update(dt: number, player: Player, env: CombatEnv, canAct: boolean, effects: Effects): void {
    // 分四个阶段：思考 → 分离 → 物理 → 清理。
    // 分离放在物理之前，被推开的怪会在同一帧与地形重新求交，不会嵌进墙里（需求 10）。
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (!enemy.active) {
        this.swapRemove(i);
        continue;
      }
      enemy.animTime += dt;
      if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      if (enemy.invuln > 0) enemy.invuln = Math.max(0, enemy.invuln - dt);
      if (enemy.spawnGrace > 0) enemy.spawnGrace = Math.max(0, enemy.spawnGrace - dt);
      if (enemy.hopCooldown > 0) enemy.hopCooldown = Math.max(0, enemy.hopCooldown - dt);

      if (enemy.state === 'dead') {
        enemy.stateTime += dt;
        continue;
      }
      if (!canAct) continue; // 冻结时只推进动画，不移动也不出招
      this.updateBrain(enemy, dt, player, env, effects);
    }

    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      const dying = enemy.state === 'dead';
      enemy.vy += GRAVITY * dt * (dying ? 0.6 : 1);
      const move = moveBody(enemy, dt);
      // 撞到障碍时主动起跳翻过去，避免被小台阶/矮墙永久卡住。
      if (
        !dying &&
        move.hitWall &&
        enemy.grounded &&
        enemy.hopCooldown <= 0 &&
        enemy.state === 'walk'
      ) {
        enemy.vy = -ENEMY_CONFIGS[enemy.kind].hopPower;
        enemy.grounded = false;
        enemy.hopCooldown = 0.7 + Math.random() * 0.6;
      }
      if (dying) {
        enemy.vx *= 1 - Math.min(0.9, dt * 4);
        if (enemy.stateTime >= DEATH_LINGER) this.swapRemove(i);
      } else if (enemy.grounded && enemy.knockbackResist > 0.5) {
        enemy.vx *= 1 - Math.min(0.9, dt * 3);
      }
    }

    // 分离放在物理之后：位置修正不再被地形解算覆盖，
    // 同时分离过程本身不会把怪物挤进墙里（需求 10）。
    this.separate(dt);
  }

  private updateBrain(enemy: Enemy, dt: number, player: Player, env: CombatEnv, effects: Effects): void {
    const config = ENEMY_CONFIGS[enemy.kind];
    const px = player.x + player.w / 2;
    const ex = enemy.x + enemy.w / 2;
    const dx = px - ex;
    const adx = Math.abs(dx);
    const verticalOverlap =
      player.y < enemy.y + enemy.h && player.y + player.h > enemy.y;
    enemy.stateTime += dt;

    if (enemy.state === 'windup') {
      // 前摇：站住不动，配合明显的动作提示（需求 4）。
      enemy.vx *= 1 - Math.min(0.9, dt * 8);
      if (enemy.stateTime >= enemy.windup) {
        enemy.state = 'attack';
        enemy.stateTime = 0;
        enemy.attackDone = false;
        const dir = dx >= 0 ? 1 : -1;
        enemy.facing = dir as 1 | -1;
        if (enemy.kind === 'chaser') {
          enemy.vx = dir * 140;
          enemy.vy = enemy.grounded ? -80 : enemy.vy;
        } else if (enemy.kind === 'glass') {
          enemy.vx = dir * 260;
        } else {
          enemy.vx = dir * 70;
          effects.ring(ex, GROUND_Y, 8, 10, '#c8d2a0', 0);
        }
      }
      return;
    }

    if (enemy.state === 'attack') {
      if (!enemy.attackDone && enemy.stateTime <= ATTACK_WINDOW) {
        enemy.attackDone = true;
        const box: Rect = {
          x: enemy.facing === 1 ? enemy.x + enemy.w - 3 : enemy.x - enemy.attackRange,
          y: enemy.y - 2,
          w: enemy.attackRange + 3,
          h: enemy.h + 4
        };
        if (rectsTouch(box, player)) {
          damagePlayer(enemy.damage, ex, env, enemy.kind === 'tank' ? 120 : 70);
        }
      }
      if (enemy.stateTime >= ATTACK_WINDOW + 0.22) {
        enemy.state = 'idle';
        enemy.stateTime = 0;
        enemy.attackCooldown = config.attackCooldown;
      }
      return;
    }

    if (enemy.state === 'hurt') {
      if (enemy.stateTime >= 0.2) {
        enemy.state = 'idle';
        enemy.stateTime = 0;
      }
      return;
    }

    if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

    enemy.facing = (dx >= 0 ? 1 : -1) as 1 | -1;

    if (verticalOverlap && adx <= enemy.attackRange && enemy.attackCooldown <= 0) {
      enemy.state = 'windup';
      enemy.stateTime = 0;
      enemy.vx = 0;
      if (enemy.kind === 'glass') {
        // 术士抬手蓄力：给玩家 0.6s 反应窗口。
        effects.text(ex, enemy.y - 12, '!', '#ffc44d', 8);
      }
      return;
    }

    // 追着玩家走；玩家在平台上时尝试跳上去，避免站着不动被无脑风筝。
    const walkSpeed = enemy.speed;
    const targetDir = dx >= 0 ? 1 : -1;
    if (enemy.grounded && !verticalOverlap && player.y + player.h < enemy.y - 6 && adx < 70) {
      // 玩家在平台上：跳上去继续追（jump 高度由每种怪的体重决定）
      enemy.vy = -config.hopPower;
      enemy.grounded = false;
      enemy.state = 'walk';
      enemy.vx = targetDir * walkSpeed;
      return;
    }

    enemy.vx += (targetDir * walkSpeed - enemy.vx) * Math.min(1, dt * (enemy.grounded ? 6 : 2));
    enemy.state = 'walk';
    enemy.stateTime = Math.min(enemy.stateTime, 0.5);
  }

  /** 同帧软分离：让怪物自然散开，不会全部叠在同一个点上。 */
  private separate(dt: number): void {
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      if (e.active && e.state !== 'dead') {
        this.grid.insert(e, ENEMY_STAGGER, e.x + e.w / 2, e.y + e.h / 2);
      }
    }

    for (let i = 0; i < this.enemies.length; i += 1) {
      const a = this.enemies[i];
      if (!a.active || a.state === 'dead') continue;
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;
      this.grid.query(ax, ay, ENEMY_STAGGER, this.scratch);
      for (let j = 0; j < this.scratch.length; j += 1) {
        const b = this.scratch[j];
        if (b === a || !b.active || b.state === 'dead') continue;
        const bx = b.x + b.w / 2;
        const by = b.y + b.h / 2;
        if (distSq(ax, ay, bx, by) > ENEMY_STAGGER * ENEMY_STAGGER) continue;
        const sep = circleSeparation(
          { x: ax, y: ay, r: ENEMY_STAGGER * 0.5 },
          { x: bx, y: by, r: (a.h + b.h) * 0.5 }
        );
        if (!sep) continue;

        // 大个子推小个子，双方各承担一部分，视觉上更自然。
        const weightA = 1 - a.knockbackResist * 0.5;
        const weightB = 1 - b.knockbackResist * 0.5;
        const total = weightA + weightB || 1;
        // 重叠越深修正越强，避免怪物长时间粘在一起。
        const depth = Math.hypot(sep.x, sep.y);
        const strength = Math.min(1, dt * 18 + (depth > 5 ? 0.45 : 0));
        const pushX = sep.x * strength;
        const pushY = sep.y * strength;

        // 被墙挡住的一方会让出自己那份，由另一侧补齐，避免贴着墙时长期重叠。
        const movedA = pushBody(a, (-pushX * weightA) / total, (-pushY * weightA) / total);
        const movedB = pushBody(b, (pushX * weightB) / total, (pushY * weightB) / total);
        if (movedA && !movedB) pushBody(a, (-pushX * weightA) / total, (-pushY * weightA) / total);
        if (movedB && !movedA) pushBody(b, (pushX * weightB) / total, (pushY * weightB) / total);
      }
    }
  }

  private swapRemove(index: number): void {
    const removed = this.enemies[index];
    const last = this.enemies.pop();
    // 用尾部元素填补空位；注意回收的是被移除的那个，而不是尾部元素，
    // 否则同一个对象会同时留在数组里和被池复用（导致实体重复、互相重叠）。
    if (last && last !== removed) this.enemies[index] = last;
    if (removed) {
      removed.active = false;
      this.pool.push(removed);
    }
  }

  reset(): void {
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      e.active = false;
      this.pool.push(e);
    }
    this.enemies.length = 0;
    this.grid.dispose();
    this.scratch.length = 0;
  }

  /** 只保留池上限，防止极端情况下池无限增长（需求 9）。 */
  trimPool(max = 24): void {
    if (this.pool.length > max) this.pool.length = max;
  }
}

const rectsTouch = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * 尝试把怪物平移到新位置。只有当“现在自由、移过去会撞墙”时才拒绝，
 * 已经嵌在墙里的情况交给物理层解决（否则怪物会被永久冻结）。
 */
function pushBody(body: Enemy, dx: number, dy: number): boolean {
  const nx = body.x + dx;
  const ny = body.y + dy;
  const blockedNow = positionBlocked(body.x, body.y, body.w, body.h);
  if (!blockedNow && positionBlocked(nx, ny, body.w, body.h)) return false;
  body.x = nx;
  body.y = ny;
  return true;
}
