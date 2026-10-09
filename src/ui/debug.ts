import type { InputManager } from '../engine/input';
import type { GameLoop } from '../engine/loop';
import type { HudSnapshot } from '../game/types';
import type { World } from '../game/world';
import { moveBody } from '../game/physics';
import { SOLIDS } from '../game/arena';

/**
 * 调试桥：把世界与输入实例挂到 window.__BLADE__，
 * 便于自动化冒烟测试（scripts/smoke-test.mjs）以及浏览器控制台手动调试。
 * 只暴露引用，不改变任何游戏逻辑。
 */
export interface DebugHandle {
  world: World;
  input: InputManager;
  loop: GameLoop;
  /** 直接调用物理步进，便于定位碰撞/穿透问题。 */
  physics: {
    moveBody: typeof moveBody;
    solids: typeof SOLIDS;
  };
  /** 手动推进固定逻辑帧，用于测试“长时间运行”这类场景。 */
  step(frames: number, dt?: number): void;
  /** 主循环停止时手动渲染一帧（自动化截图用）。 */
  renderOnce(): void;
  snapshot(): HudSnapshot;
}

declare global {
  interface Window {
    __BLADE__?: DebugHandle;
  }
}

export function installDebugHandle(
  world: World,
  input: InputManager,
  loop: GameLoop,
  renderOnce: () => void
): void {
  window.__BLADE__ = {
    world,
    input,
    loop,
    physics: { moveBody, solids: SOLIDS },
    renderOnce,
    step: (frames: number, dt = 1 / 60) => {
      for (let i = 0; i < frames; i += 1) world.update(dt);
    },
    snapshot: () => world.getSnapshot()
  };
}

export function removeDebugHandle(): void {
  delete window.__BLADE__;
}
