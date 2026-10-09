import { ENEMY_STAGGER, MAX_ALIVE_ENEMIES } from './constants';
import type { EnemyKind } from './types';
import type { Rng } from '../engine/rng';

export interface WavePlan {
  /** 本波要生成的怪物序列（已打乱）。 */
  kinds: EnemyKind[];
  /** 同时在场上限。 */
  concurrent: number;
  /** 生成间隔（秒）。 */
  interval: number;
}

/**
 * 波次编成：数量与强度随波数上升（需求 5）。
 * 前期只有普通怪 → 中期加入高伤脆皮 → 后期加入肉盾，让玩家逐层学习应对。
 */
export function planWave(wave: number, rng: Rng): WavePlan {
  const chasers = 3 + Math.ceil(wave * 1.15);
  const glass = wave >= 2 ? 1 + Math.floor((wave - 2) * 0.8) : 0;
  const tanks = wave >= 3 ? 1 + Math.floor((wave - 3) * 0.65) : 0;

  const kinds: EnemyKind[] = [];
  for (let i = 0; i < chasers; i += 1) kinds.push('chaser');
  for (let i = 0; i < glass; i += 1) kinds.push('glass');
  for (let i = 0; i < tanks; i += 1) kinds.push('tank');

  // 限制单波总量，避免后期一波打太久导致疲劳。
  const cap = 22;
  while (kinds.length > cap) kinds.pop();
  shuffle(kinds, rng);

  return {
    kinds,
    concurrent: Math.min(MAX_ALIVE_ENEMIES - 2, 4 + Math.floor(wave / 2)),
    interval: Math.max(0.4, 1.05 - wave * 0.045)
  };
}

function shuffle<T>(list: T[], rng: Rng): void {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
}

/**
 * 波次推进器：只负责“什么时候生成什么”，
 * 生成位置与实体生命周期交给 EnemyManager / World。
 */
export class WaveManager {
  wave = 0;
  private queue: EnemyKind[] = [];
  private timer = 0;
  private interval = 1;
  private concurrent = 4;
  private spawned = 0;
  private killed = 0;
  cleared = false;

  begin(wave: number, rng: Rng): void {
    const plan = planWave(wave, rng);
    this.wave = wave;
    this.queue = plan.kinds;
    this.timer = 0.6; // 波次开始时留一点呼吸时间
    this.interval = plan.interval;
    this.concurrent = plan.concurrent;
    this.spawned = 0;
    this.killed = 0;
    this.cleared = false;
  }

  registerKill(): void {
    this.killed += 1;
  }

  get remaining(): number {
    return this.queue.length;
  }

  get killCount(): number {
    return this.killed;
  }

  get spawnCount(): number {
    return this.spawned;
  }

  get totalInWave(): number {
    return this.spawned + this.queue.length;
  }

  /**
   * 推进生成节奏。trySpawn 返回 false 表示当前找不到合法出生点，
   * 这时不消耗队列元素，稍后重试（需求 10）。
   */
  update(dt: number, aliveCount: number, trySpawn: (kind: EnemyKind) => boolean): void {
    if (this.queue.length === 0) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (aliveCount >= this.concurrent) {
      this.timer = 0.25;
      return;
    }

    const kind = this.queue[0];
    if (trySpawn(kind)) {
      this.queue.shift();
      this.spawned += 1;
      this.timer = this.interval * (0.85 + Math.random() * 0.4);
    } else {
      this.timer = 0.4;
    }
  }

  reset(): void {
    this.queue.length = 0;
    this.wave = 0;
    this.timer = 0;
    this.spawned = 0;
    this.killed = 0;
    this.cleared = false;
  }

  get stagger(): number {
    return ENEMY_STAGGER;
  }
}
