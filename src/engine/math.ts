/** 纯数学工具，无副作用，方便复用与单测。 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 帧率无关的指数逼近，用于镜头、动画平滑。 */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const approach = (current: number, target: number, maxDelta: number): number => {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
};

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (px: number, py: number, r: Rect): boolean =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

export const rectCenter = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** 两个圆形的近似分离（用于横向物理里的软碰撞）。 */
export const circleSeparation = (
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number }
): Vec2 | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist) return null;
  // 完全重合时方向向量退化为零：给一个确定性的横向推力，
  // 否则两只怪会永远粘在同一个点上（贴墙被同一位置吸附的情况）。
  if (d2 < 1e-6) return { x: minDist, y: 0 };
  const d = Math.sqrt(d2) || 0.0001;
  const overlap = minDist - d;
  return { x: (dx / d) * overlap, y: (dy / d) * overlap };
};
