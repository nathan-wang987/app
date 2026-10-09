/**
 * 固定步长游戏循环。
 * - 逻辑固定 60Hz，物理/判定稳定可复现；
 * - 画面每帧渲染一次（带插值参数 alpha，这里主要给摄像机/特效使用）；
 * - 单帧最大补偿步数受限，防止切回来时一次性追帧卡死。
 */
export class GameLoop {
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;

  /** 每帧最多补的逻辑步数 */
  maxStepsPerFrame = 5;
  /** 单帧最大时间片（秒），超过就丢弃，避免长时间卡顿后追帧 */
  maxFrameDelta = 0.25;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
    readonly fixedDt = 1 / 60,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    let delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    if (delta > this.maxFrameDelta) delta = this.maxFrameDelta;

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxStepsPerFrame) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps += 1;
    }
    if (steps === this.maxStepsPerFrame) this.accumulator = 0;

    this.render(this.accumulator / this.fixedDt);
  };

  dispose(): void {
    this.stop();
  }
}
