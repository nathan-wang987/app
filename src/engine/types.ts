/**
 * 引擎层通用数据类型。
 * 这一层不包含任何具体玩法（角色/怪物/技能）的概念，方便被游戏内容层复用。
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** 左上角为原点的轴对齐矩形（世界坐标） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 参与物理的有速度的矩形体 */
export interface Body extends Rect {
  vx: number;
  vy: number;
  onGround: boolean;
}

/** 朝向：1 = 面向右，-1 = 面向左 */
export type Facing = 1 | -1;

export interface CollisionFlags {
  hitX: boolean;
  hitY: boolean;
  onGround: boolean;
  ceiling: boolean;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false };
}

export function makeRect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

export function cloneRect(r: Rect): Rect {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}
