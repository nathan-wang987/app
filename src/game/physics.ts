import { MAX_FALL_SPEED } from './constants';
import { SOLIDS, WORLD_BOUNDS } from './arena';
import type { Rect } from '../engine/math';
import type { Body } from './types';

interface MoveResult {
  hitWall: boolean;
  landed: boolean;
  hitCeiling: boolean;
}

interface Push {
  axis: 'x' | 'y';
  delta: number;
}

/**
 * 最小平移向量（MTV）：把两个矩形的重叠按“穿透更浅的轴”推出去。
 * 这是本案的关键——地面矩形横跨整张地图，如果按“是否重叠”直接判定水平碰撞，
 * 稍微陷入地面的角色会被当成撞墙并瞬间传送到地图边缘。
 */
function minimalPush(rect: Rect, solid: Rect): Push {
  const toLeft = rect.x + rect.w - solid.x; // 向左推出所需距离
  const toRight = solid.x + solid.w - rect.x; // 向右推出所需距离
  const toUp = rect.y + rect.h - solid.y; // 向上推出所需距离
  const toDown = solid.y + solid.h - rect.y; // 向下推出所需距离
  const minX = Math.min(toLeft, toRight);
  const minY = Math.min(toUp, toDown);
  if (minX <= minY) return { axis: 'x', delta: toLeft < toRight ? -toLeft : toRight };
  return { axis: 'y', delta: toUp < toDown ? -toUp : toDown };
}

/**
 * 处理“已经嵌进方块内部”的异常情况（主要来自怪物之间的分离推挤）。
 * 优先把角色当“踩到了地板”抬出来：横向穿透比身体还宽、且向上穿透不深时，
 * 一律向上推出，避免在地图边缘或贴着台阶时被横向弹飞。
 */
function resolveEmbedded(rect: Rect, solid: Rect, body: Body): Push {
  const push = minimalPush(rect, solid);
  if (push.axis !== 'x') return push;

  const toUp = rect.y + rect.h - solid.y;
  const minX = Math.min(rect.x + rect.w - solid.x, solid.x + solid.w - rect.x);
  const deepHorizontally = minX > body.w * 0.95;
  const shallowVertically = toUp > 0 && toUp <= body.h + 8;
  if (deepHorizontally && shallowVertically) return { axis: 'y', delta: -toUp };
  return push;
}

/**
 * 轴分离 AABB 扫掠：先水平再垂直，逐轴解决碰撞。
 * 逻辑步长固定为 1/60 s，最大位移 400*1/60 ≈ 6.7px，远小于最小平台厚度 10px，
 * 因此不会出现穿透。
 */
export function moveBody(body: Body, dt: number, solids: readonly Rect[] = SOLIDS): MoveResult {
  const result: MoveResult = { hitWall: false, landed: false, hitCeiling: false };

  // --- 水平 ---
  const dx = body.vx * dt;
  if (dx !== 0) {
    const before = toRect(body);
    body.x += dx;
    for (const solid of solids) {
      const rect = toRect(body);
      if (!overlaps(rect, solid)) continue;
      // 本帧移动前就已经嵌在这个方块里（例如被分离推挤过）→ 不当成撞墙，
      // 留给垂直轴或最后的 MTV 兜底处理，避免把角色传送出地图。
      if (overlaps(before, solid)) continue;
      if (dx > 0) {
        body.x = solid.x - body.w;
      } else {
        body.x = solid.x + solid.w;
      }
      body.vx = 0;
      result.hitWall = true;
    }
  }

  // --- 垂直 ---
  if (body.vy > MAX_FALL_SPEED) body.vy = MAX_FALL_SPEED;
  const dy = body.vy * dt;
  const wasGrounded = body.grounded;
  body.grounded = false;
  if (dy !== 0) {
    const before = toRect(body);
    body.y += dy;
    for (const solid of solids) {
      const rect = toRect(body);
      if (!overlaps(rect, solid)) continue;
      if (overlaps(before, solid)) continue; // 已嵌入 → 交给 MTV 兜底
      if (dy > 0) {
        body.y = solid.y - body.h;
        body.grounded = true;
        result.landed = !wasGrounded;
      } else {
        body.y = solid.y + solid.h;
        result.hitCeiling = true;
      }
      body.vy = 0;
    }
  }

  // 兜底：如果因为分离推挤等原因仍然嵌在方块里，用 MTV 直接推出来，
  // 保证任何时刻角色/怪物都不会停留在墙体内（需求 10）。
  for (let pass = 0; pass < 2; pass += 1) {
    const rect = toRect(body);
    let fixed = false;
    for (const solid of solids) {
      if (!overlaps(rect, solid)) continue;
      const push = resolveEmbedded(rect, solid, body);
      if (push.axis === 'x') {
        body.x += push.delta;
        rect.x = body.x;
        if (push.delta < 0) body.vx = Math.min(0, body.vx);
        else body.vx = Math.max(0, body.vx);
      } else {
        body.y += push.delta;
        rect.y = body.y;
        if (push.delta < 0) {
          body.grounded = true;
          body.vy = Math.min(0, body.vy);
        } else {
          body.vy = Math.max(0, body.vy);
        }
      }
      fixed = true;
    }
    if (!fixed) break;
  }

  // --- 世界边界 ---
  if (body.x < WORLD_BOUNDS.minX) {
    body.x = WORLD_BOUNDS.minX;
    body.vx = 0;
  }
  if (body.x + body.w > WORLD_BOUNDS.maxX) {
    body.x = WORLD_BOUNDS.maxX - body.w;
    body.vx = 0;
  }
  if (body.y + body.h > WORLD_BOUNDS.maxY) {
    body.y = WORLD_BOUNDS.maxY - body.h;
    body.vy = 0;
    body.grounded = true;
  }

  return result;
}

export function toRect(body: Body): Rect {
  return { x: body.x, y: body.y, w: body.w, h: body.h };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function bodyOverlapsSolid(body: Body): boolean {
  const rect = toRect(body);
  for (const solid of SOLIDS) if (overlaps(rect, solid)) return true;
  return false;
}

/** 判断一个候选位置是否与地形重叠（用于“不要把怪物挤进墙里”的分离逻辑）。 */
export function positionBlocked(
  x: number,
  y: number,
  w: number,
  h: number,
  solids: readonly Rect[] = SOLIDS
): boolean {
  const rect: Rect = { x, y, w, h };
  for (const solid of solids) if (overlaps(rect, solid)) return true;
  return false;
}
