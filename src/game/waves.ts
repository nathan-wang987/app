import type { Rng } from '../engine/rng';
import type { MonsterKind } from './monsters';

export interface WavePlan {
  index: number;
  hpMul: number;
  dmgMul: number;
  speedMul: number;
  expMul: number;
  counts: Record<MonsterKind, number>;
  total: number;
  batchSize: number;
}

const COST: Record<MonsterKind, number> = {
  grunt: 1,
  berserker: 1.35,
  brute: 2.7,
};

/** 每波的强度曲线：数量、血量、伤害、速度、经验一起成长 */
export function planWave(index: number, rng: Rng): WavePlan {
  const counts: Record<MonsterKind, number> = { grunt: 0, berserker: 0, brute: 0 };
  const budget = Math.min(26, 3 + index * 1.35);
  let remaining = budget;

  const available: MonsterKind[] = ['grunt'];
  if (index >= 2) available.push('berserker');
  if (index >= 3) available.push('brute');

  const bruteCap = Math.max(0, Math.floor(index / 2));

  let guard = 0;
  while (remaining > 0.95 && guard < 200) {
    guard += 1;
    const pool = available.filter((kind) => kind !== 'brute' || counts.brute < bruteCap);
    const usable = pool.length > 0 ? pool : ['grunt' as MonsterKind];
    // 波次越高，越倾向于出更强的怪
    const weights: Array<{ kind: MonsterKind; weight: number }> = usable.map((kind) => {
      if (kind === 'grunt') return { kind, weight: Math.max(1, 5 - index * 0.22) };
      if (kind === 'berserker') return { kind, weight: 2.6 + index * 0.14 };
      return { kind, weight: 1.6 + index * 0.06 };
    });
    const pick = rng.pickWeighted(weights);
    if (COST[pick.kind] > remaining + 0.4) {
      if (COST.grunt <= remaining + 0.4) {
        counts.grunt += 1;
        remaining -= COST.grunt;
      }
      break;
    }
    counts[pick.kind] += 1;
    remaining -= COST[pick.kind];
  }

  if (counts.grunt + counts.berserker + counts.brute === 0) counts.grunt = 2;

  const total = counts.grunt + counts.berserker + counts.brute;
  const hpMul = 1 + 0.16 * (index - 1) + 0.008 * (index - 1) * (index - 1);
  const dmgMul = 1 + 0.09 * (index - 1);
  const speedMul = 1 + Math.min(0.45, 0.028 * (index - 1));
  const expMul = 1 + 0.06 * (index - 1);

  return {
    index,
    hpMul,
    dmgMul,
    speedMul,
    expMul,
    counts,
    total,
    batchSize: total > 8 ? 4 : total > 5 ? 3 : 2,
  };
}

export interface SpawnOrderEntry {
  kind: MonsterKind;
  delay: number;
}

/** 把这一波的怪拆成若干批，按时间依次进场，避免一次性全挤出来 */
export function buildSpawnOrder(plan: WavePlan, rng: Rng, batchInterval: number): SpawnOrderEntry[] {
  const queue: MonsterKind[] = [];
  (Object.keys(plan.counts) as MonsterKind[]).forEach((kind) => {
    for (let i = 0; i < plan.counts[kind]; i += 1) queue.push(kind);
  });
  rng.shuffle(queue);

  const order: SpawnOrderEntry[] = [];
  let batch = 0;
  for (let i = 0; i < queue.length; i += 1) {
    if (i > 0 && i % plan.batchSize === 0) batch += 1;
    order.push({ kind: queue[i], delay: batch * batchInterval });
  }
  return order;
}
