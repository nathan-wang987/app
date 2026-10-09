/**
 * 冷却计时器：技能/普攻统一用它，界面直接读 remaining / progress。
 */
export class Cooldown {
  duration: number;
  remaining = 0;

  constructor(duration: number) {
    this.duration = duration;
  }

  get ready(): boolean {
    return this.remaining <= 0;
  }

  /** 0 = 刚触发，1 = 冷却结束 */
  get progress(): number {
    if (this.duration <= 0) return 1;
    return 1 - Math.max(0, this.remaining) / this.duration;
  }

  tick(dt: number): void {
    if (this.remaining > 0) this.remaining = Math.max(0, this.remaining - dt);
  }

  trigger(duration = this.duration): void {
    this.duration = duration;
    this.remaining = duration;
  }

  /** 冷却缩减类加成的统一入口 */
  reduceBy(factor: number): void {
    this.remaining = Math.max(0, this.remaining * factor);
    this.duration = Math.max(0.05, this.duration * factor);
  }

  reset(): void {
    this.remaining = 0;
  }
}

/** 简单的倒计时器 */
export class Timer {
  remaining = 0;
  constructor(public duration = 0) {
    this.remaining = duration;
  }

  get done(): boolean {
    return this.remaining <= 0;
  }

  get progress(): number {
    if (this.duration <= 0) return 1;
    return 1 - Math.max(0, this.remaining) / this.duration;
  }

  tick(dt: number): void {
    if (this.remaining > 0) this.remaining = Math.max(0, this.remaining - dt);
  }

  start(duration: number): void {
    this.duration = duration;
    this.remaining = duration;
  }

  cancel(): void {
    this.remaining = 0;
  }
}
