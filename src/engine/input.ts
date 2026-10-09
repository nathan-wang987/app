import { Emitter } from './emitter';

export type ActionName =
  | 'left'
  | 'right'
  | 'jump'
  | 'attack'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'pause'
  | 'confirm';

/** 默认按键绑定：方向键移动、空格跳、J 攻击、K/L/U 技能，也可用鼠标点技能栏。 */
export const DEFAULT_BINDINGS: Record<string, ActionName> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  Space: 'jump',
  KeyJ: 'attack',
  KeyK: 'skill1',
  KeyL: 'skill2',
  KeyU: 'skill3',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm'
};

const PREVENT_DEFAULT = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space'
]);

interface InputEvents {
  /** 任意输入事件（用于“玩家已操作”提示）。 */
  any: ActionName;
}

/**
 * 键盘输入采集：held 表示持续按下，pressed 表示本帧刚按下（边缘触发）。
 * 定时由 GameLoop 每帧调用 endFrame() 清理边缘状态。
 */
export class InputManager {
  private readonly held = new Set<ActionName>();
  private readonly pressed = new Set<ActionName>();
  private readonly released = new Set<ActionName>();
  private readonly bindings: Record<string, ActionName>;
  private readonly programmatic = new Map<ActionName, number>();
  readonly events = new Emitter<InputEvents>();
  private disposed = false;

  constructor(bindings: Record<string, ActionName> = DEFAULT_BINDINGS) {
    this.bindings = { ...bindings };
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const action = this.bindings[event.code];
    if (!action) return;
    if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.held.add(action);
    this.pressed.add(action);
    this.events.emit('any', action);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const action = this.bindings[event.code];
    if (!action) return;
    this.held.delete(action);
    this.released.add(action);
  };

  /** 失焦时清空按键，防止“卡住一直往右跑”。 */
  private handleBlur = (): void => {
    this.releaseAll();
  };

  /** UI 按钮（技能栏 / 触屏）走这条通道注入输入。 */
  push(action: ActionName): void {
    this.held.add(action);
    this.pressed.add(action);
    this.programmatic.set(action, 0.08);
    this.events.emit('any', action);
  }

  isHeld(action: ActionName): boolean {
    return this.held.has(action);
  }

  wasPressed(action: ActionName): boolean {
    return this.pressed.has(action);
  }

  wasReleased(action: ActionName): boolean {
    return this.released.has(action);
  }

  releaseAll(): void {
    this.held.clear();
    this.pressed.clear();
    this.released.clear();
    this.programmatic.clear();
  }

  /** 每个逻辑帧末尾调用：清掉边缘触发与到期的手动输入。 */
  endFrame(dt: number): void {
    this.pressed.clear();
    this.released.clear();
    for (const [action, ttl] of this.programmatic) {
      const next = ttl - dt;
      if (next <= 0) {
        this.programmatic.delete(action);
        this.held.delete(action);
      } else {
        this.programmatic.set(action, next);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.events.clear();
    this.releaseAll();
  }
}
