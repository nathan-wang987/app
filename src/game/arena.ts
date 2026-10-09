import { GROUND_Y, WALL_THICK, WORLD_WIDTH } from './constants';
import type { Rect } from '../engine/math';

/**
 * 竞技场几何：地面、左右实心墙、几块浮空平台。
 * 这些矩形同时用于：物理碰撞、怪物出生点合法性校验（需求 10）、背景绘制。
 */
export const SOLIDS: readonly Rect[] = [
  { x: 0, y: GROUND_Y, w: WORLD_WIDTH, h: 64 },
  { x: -WALL_THICK, y: 0, w: WALL_THICK, h: GROUND_Y + 64 },
  { x: WORLD_WIDTH, y: 0, w: WALL_THICK, h: GROUND_Y + 64 },
  { x: 360, y: 176, w: 84, h: 10 },
  { x: 700, y: 150, w: 84, h: 10 },
  { x: 1040, y: 178, w: 84, h: 10 },
  { x: 1380, y: 148, w: 84, h: 10 },
  { x: 826, y: 216, w: 56, h: 20 }
];

export const WORLD_BOUNDS = {
  minX: 0,
  maxX: WORLD_WIDTH,
  minY: -80,
  maxY: GROUND_Y + 64
};

/** 出生点候选：地面上的若干位置，逐个校验后再使用。 */
export const SPAWN_ANCHORS: readonly number[] = [
  60, 130, 210, 290, 370, 450, 530, 620, 700, 790, 870, 960,
  1050, 1140, 1230, 1320, 1410, 1500, 1590, 1680, 1770, 1860
];

export function rectHitsSolid(rect: Rect): boolean {
  for (const solid of SOLIDS) {
    if (
      rect.x < solid.x + solid.w &&
      rect.x + rect.w > solid.x &&
      rect.y < solid.y + solid.h &&
      rect.y + rect.h > solid.y
    ) {
      return true;
    }
  }
  return false;
}

export function isStandingSpotFree(x: number, w: number, h: number): boolean {
  // 脚底刚好贴地：把身体抬到地面上方，再判断是否与任何实体块重叠。
  const rect: Rect = { x, y: GROUND_Y - h, w, h };
  return !rectHitsSolid(rect);
}
