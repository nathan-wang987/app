import { collidesAny } from '../engine/physics';
import type { Rect } from '../engine/types';
import { overlapX, overlaps } from '../engine/math';
import { WORLD } from './constants';

export type PlatformKind = 'ground' | 'rock' | 'crate';

export interface Platform extends Rect {
  kind: PlatformKind;
  /** 边界墙不参与怪物刷新点采样 */
  noSpawn?: boolean;
}

export interface Arena {
  bounds: Rect;
  solids: Rect[];
  platforms: Platform[];
  /** 可行走的表面（角色/怪物可以站上去），由 solids 的顶面推导 */
  surfaces: Rect[];
}

/**
 * 关卡几何：地面 + 柱子 + 浮空平台。
 * solids 用于物理阻挡，surfaces 用于生成点采样。
 */
export function buildArena(): Arena {
  const platforms: Platform[] = [
    // 地面
    { x: 0, y: WORLD.groundTop, w: WORLD.width, h: WORLD.height - WORLD.groundTop, kind: 'ground' },
    // 左边界 / 右边界（不可见的厚墙，防止跑出场景）
    { x: -60, y: 0, w: 60, h: WORLD.height, kind: 'rock', noSpawn: true },
    { x: WORLD.width, y: 0, w: 60, h: WORLD.height, kind: 'rock', noSpawn: true },
    // 木箱：矮，一跳就能上去，也不会挡住视线
    { x: 880, y: 568, w: 76, h: 52, kind: 'crate' },
    { x: 1420, y: 568, w: 76, h: 52, kind: 'crate' },
    // 浮空平台：低台一跳可达，高台需要二段跳
    { x: 300, y: 510, w: 200, h: 26, kind: 'rock' },
    { x: 740, y: 440, w: 190, h: 26, kind: 'rock' },
    { x: 1180, y: 510, w: 200, h: 26, kind: 'rock' },
    { x: 1620, y: 440, w: 190, h: 26, kind: 'rock' },
  ];

  const bounds: Rect = { x: 0, y: 0, w: WORLD.width, h: WORLD.height };
  const solids = platforms;
  const surfaces = platforms.filter((p) => !p.noSpawn);

  return { bounds, solids, platforms, surfaces };
}

export interface SpawnQuery {
  w: number;
  h: number;
  /** 尽量远离的点（通常是玩家位置） */
  avoidX?: number;
  avoidY?: number;
  /** 与 avoid 点的最小水平距离（低于这个距离的候选直接丢弃） */
  minDistanceFromAvoid?: number;
  /** 理想刷新距离：越接近得分越高，避免怪刷在地图另一头让玩家干等 */
  preferredDistance?: number;
  /** 与已有怪物位置的最小水平距离 */
  minDistanceFromOthers?: number;
  others?: readonly Rect[];
}

/**
 * 在关卡里找一个合法生成点：
 * 1. 站在某个表面（地面/平台）上方；
 * 2. 与所有静态实体不重叠（不会生成在墙里）；
 * 3. 与玩家和已有怪物保持最小距离（不会叠在一起）。
 * 采样若干次后取「离其他怪最远」的候选，保证一定能返回结果。
 */
export function findSpawnPoint(arena: Arena, random: () => number, query: SpawnQuery): { x: number; y: number } | null {
  const { w, h } = query;
  const minFromOthers = query.minDistanceFromOthers ?? 74;
  const minFromAvoid = query.minDistanceFromAvoid ?? 300;
  const preferred = query.preferredDistance ?? Math.max(minFromAvoid, 620);

  let best: { x: number; y: number; score: number } | null = null;
  const attempts = 26;

  for (let i = 0; i < attempts; i += 1) {
    const surface = arena.surfaces[Math.floor(random() * arena.surfaces.length)];
    if (!surface) break;
    // 表面可站立范围（稍微向内收，避免半只脚悬空）
    const padding = Math.min(24, surface.w * 0.15);
    const minX = surface.x + padding;
    const maxX = surface.x + surface.w - padding - w;
    if (maxX < minX) continue;

    const x = minX + random() * (maxX - minX);
    const y = surface.y - h - 1;
    const candidate: Rect = { x, y, w, h };

    // 不生成在墙里
    if (collidesAny(candidate, arena.solids)) continue;
    // 头顶要留出空间
    const headroom: Rect = { x, y: y - 18, w, h: 18 };
    if (collidesAny(headroom, arena.solids)) continue;

    let score = 0;
    if (query.avoidX !== undefined) {
      const dist = Math.abs(x + w / 2 - query.avoidX);
      if (dist < minFromAvoid) continue; // 太贴脸，直接丢弃
      // 越接近理想距离越好：太近危险，太远让玩家干等
      score += 260 - Math.min(260, Math.abs(dist - preferred) * 0.26);
    }
    if (query.others && query.others.length > 0) {
      let tooClose = false;
      for (const other of query.others) {
        const dx = Math.abs(x + w / 2 - (other.x + other.w / 2));
        if (dx < minFromOthers && overlapX(other, candidate) > 0) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      let nearest = Infinity;
      for (const other of query.others) {
        nearest = Math.min(nearest, Math.abs(x + w / 2 - (other.x + other.w / 2)));
      }
      score += Math.min(nearest, 900) * 0.35;
    }

    if (!best || score > best.score) best = { x, y, score };
  }

  if (best) return { x: best.x, y: best.y };

  // 兜底：在地面上找一个离其他怪最远的空位
  const ground = arena.platforms.find((p) => p.kind === 'ground');
  if (!ground) return null;
  let fallbackX = ground.x + 60 + random() * (ground.w - 120 - w);
  if (query.others && query.others.length > 0) {
    let bestGap = -1;
    for (let i = 0; i < 24; i += 1) {
      const x = ground.x + 40 + random() * (ground.w - 80 - w);
      const rect: Rect = { x, y: ground.y - h - 1, w, h };
      if (collidesAny(rect, arena.solids)) continue;
      let nearest = Infinity;
      for (const other of query.others) {
        nearest = Math.min(nearest, Math.abs(x - other.x));
      }
      if (nearest > bestGap) {
        bestGap = nearest;
        fallbackX = x;
      }
    }
  }
  const y = ground.y - h - 1;
  const rect: Rect = { x: fallbackX, y, w, h };
  if (overlaps(rect, ground) && y + h > ground.y) return { x: fallbackX, y: ground.y - h - 1 };
  return { x: fallbackX, y };
}
