import { VIEW_H, VIEW_W, WORLD_WIDTH } from '../game/constants';
import { clamp } from '../engine/math';

/**
 * 跟随镜头：带边界钳制与轻微的落点前瞻，外加受击震屏。
 * 视口固定为逻辑分辨率大小，保证像素对齐。
 */
export class Camera {
  x = 0;
  y = 0;
  private shakeTime = 0;
  private shakePower = 0;
  private offsetX = 0;
  private offsetY = 0;

  follow(targetX: number, targetY: number, vx: number, dt: number): void {
    const lookAhead = clamp(vx * 0.22, -34, 34);
    const desiredX = targetX + lookAhead - VIEW_W * 0.5;
    const desiredY = targetY - VIEW_H * 0.62;
    const k = Math.min(1, dt * 6);
    this.x += (desiredX - this.x) * k;
    this.y += (desiredY - this.y) * k;
    this.x = clamp(this.x, 0, Math.max(0, WORLD_WIDTH - VIEW_W));
    this.y = clamp(this.y, -60, 40);
  }

  shake(power: number, duration = 0.25): void {
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  update(dt: number): void {
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      this.offsetX = (Math.random() - 0.5) * this.shakePower * 2;
      this.offsetY = (Math.random() - 0.5) * this.shakePower;
      if (this.shakeTime === 0) {
        this.shakePower = 0;
        this.offsetX = 0;
        this.offsetY = 0;
      }
    }
  }

  /** 渲染时使用的整数化偏移，避免像素抖动。 */
  get renderX(): number {
    return Math.round(this.x + this.offsetX);
  }

  get renderY(): number {
    return Math.round(this.y + this.offsetY);
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.shakeTime = 0;
    this.shakePower = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }
}
