import { overlaps } from './math';
import type { Body, CollisionFlags, Rect } from './types';

const NO_COLLISION: CollisionFlags = {
  hitX: false,
  hitY: false,
  onGround: false,
  ceiling: false,
};

/**
 * 分轴移动 + 与静态实体（地面/石块）的 AABB 求解。
 * 先走 X 再走 Y，是横版平台游戏里最稳、最省事的做法。
 */
export function moveBody(body: Body, solids: readonly Rect[], dx: number, dy: number): CollisionFlags {
  const flags: CollisionFlags = { ...NO_COLLISION };
  let hitWallDir = 0;

  body.x += dx;
  for (const solid of solids) {
    if (!overlaps(body, solid)) continue;
    if (dx > 0) {
      body.x = solid.x - body.w;
      hitWallDir = 1;
    } else if (dx < 0) {
      body.x = solid.x + solid.w;
      hitWallDir = -1;
    } else {
      // 没有水平位移但发生了重叠（例如被别的实体推进墙里），推出去
      const pushRight = solid.x + solid.w - body.x;
      const pushLeft = body.x + body.w - solid.x;
      if (pushRight < pushLeft) {
        body.x = solid.x + solid.w;
        hitWallDir = -1;
      } else {
        body.x = solid.x - body.w;
        hitWallDir = 1;
      }
    }
    body.vx = 0;
    flags.hitX = true;
  }
  (flags as CollisionFlags & { wallDir?: number }).wallDir = hitWallDir;

  body.y += dy;
  body.onGround = false;
  for (const solid of solids) {
    if (!overlaps(body, solid)) continue;
    if (dy > 0) {
      body.y = solid.y - body.h;
      body.onGround = true;
    } else if (dy < 0) {
      body.y = solid.y + solid.h;
      flags.ceiling = true;
    } else {
      // 垂直方向没动却重叠：往上推（站在物体上）
      body.y = solid.y - body.h;
      body.onGround = true;
    }
    body.vy = 0;
    flags.hitY = true;
  }
  flags.onGround = body.onGround;

  return flags;
}

/** 矩形是否和任意静态实体相交（生成点检测用） */
export function collidesAny(rect: Rect, solids: readonly Rect[]): boolean {
  for (const solid of solids) {
    if (overlaps(rect, solid)) return true;
  }
  return false;
}

/** 严格检测：允许正好贴着（用于地面接触点的宽容判定） */
export function fitsInWorld(rect: Rect, bounds: Rect): boolean {
  return rect.x >= bounds.x && rect.x + rect.w <= bounds.x + bounds.w;
}
