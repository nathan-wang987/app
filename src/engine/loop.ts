export interface LoopCallbacks {
  /** 固定步长逻辑更新，dt 恒为 step 秒。 */
  update(dt: number): void;
  /** 渲染，alpha 为当前逻辑帧之间的插值系数。 */
  render(alpha: number): void;
}

/**
 * 固定步长主循环（默认 60Hz 逻辑）。
 * - 每帧最多补算 maxSubSteps 步，防止切回标签页时“一次性追帧”导致卡死；
 * - stop() 会彻底取消 rAF，不留下悬挂回调（需求 8 / 9）。
 */
export class GameLoop {
  private handle = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;
  private paused = false;

  readonly step: number;
  private readonly maxSubSteps: number;

  constructor(
    private readonly callbacks: LoopCallbacks,
    step = 1 / 60,
    maxSubSteps = 6
  ) {
    this.step = step;
    this.maxSubSteps = maxSubSteps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.handle = requestAnimationFrame(this.tick);
  }

  /** 暂停：时间完全冻结，且下一次恢复不会补算暂停期间的时间。 */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.accumulator = 0;
    this.last = performance.now();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.handle);
    this.handle = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.handle = requestAnimationFrame(this.tick);

    const rawDelta = (now - this.last) / 1000;
    this.last = now;
    // 掉帧或后台恢复时钳制最大增量，避免物理穿透 + 追帧雪崩。
    const frameDelta = Math.min(Math.max(rawDelta, 0), 0.25);

    if (this.paused) {
      this.accumulator = 0;
      this.callbacks.render(1);
      return;
    }

    this.accumulator += frameDelta;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      this.callbacks.update(this.step);
      this.accumulator -= this.step;
      steps += 1;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0;

    this.callbacks.render(this.accumulator / this.step);
  };
}
