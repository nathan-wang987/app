/**
 * 键盘输入：把物理按键映射成动作，并提供「本帧刚按下」语义。
 * 只在最外层加一次监听，dispose 时全部摘掉，避免内存泄漏。
 */

export type Action =
  | 'left'
  | 'right'
  | 'jump'
  | 'attack'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'pause'
  | 'confirm'
  | 'choice1'
  | 'choice2'
  | 'choice3';

export const ACTION_BINDINGS: Record<Action, string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'KeyW', 'ArrowUp', 'KeyK'],
  attack: ['KeyJ', 'KeyX'],
  skill1: ['KeyU', 'Digit1', 'Numpad1'],
  skill2: ['KeyI', 'Digit2', 'Numpad2'],
  skill3: ['KeyO', 'Digit3', 'Numpad3'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
  choice1: ['Digit1', 'Numpad1'],
  choice2: ['Digit2', 'Numpad2'],
  choice3: ['Digit3', 'Numpad3'],
};

/** 展示给玩家看的按键提示 */
export const ACTION_HINTS: Record<Action, string> = {
  left: '← / A',
  right: '→ / D',
  jump: '空格 / W / K',
  attack: 'J / X',
  skill1: 'U / 1',
  skill2: 'I / 2',
  skill3: 'O / 3',
  pause: 'Esc / P',
  confirm: '回车',
  choice1: '1',
  choice2: '2',
  choice3: '3',
};

const PREVENT_DEFAULT_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'Tab',
]);

export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private codeToActions = new Map<string, Action[]>();
  private disposers: Array<() => void> = [];
  /** 外部可以临时禁用输入（例如界面弹窗接管键盘时） */
  enabled = true;

  constructor(private readonly target: Window = window) {
    (Object.keys(ACTION_BINDINGS) as Action[]).forEach((action) => {
      for (const code of ACTION_BINDINGS[action]) {
        const list = this.codeToActions.get(code);
        if (list) list.push(action);
        else this.codeToActions.set(code, [action]);
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
      if (!this.enabled) return;
      if (event.repeat) {
        this.down.add(event.code);
        return;
      }
      this.down.add(event.code);
      this.pressed.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      this.down.delete(event.code);
    };
    const onBlur = () => {
      this.down.clear();
      this.pressed.clear();
    };

    this.target.addEventListener('keydown', onKeyDown);
    this.target.addEventListener('keyup', onKeyUp);
    this.target.addEventListener('blur', onBlur);
    this.disposers.push(
      () => this.target.removeEventListener('keydown', onKeyDown),
      () => this.target.removeEventListener('keyup', onKeyUp),
      () => this.target.removeEventListener('blur', onBlur),
    );
  }

  isDown(action: Action): boolean {
    const codes = ACTION_BINDINGS[action];
    for (let i = 0; i < codes.length; i += 1) {
      if (this.down.has(codes[i])) return true;
    }
    return false;
  }

  /** 本帧刚按下（消费语义：同一个事件只会返回一次 true） */
  justPressed(action: Action): boolean {
    const codes = ACTION_BINDINGS[action];
    for (let i = 0; i < codes.length; i += 1) {
      if (this.pressed.has(codes[i])) {
        this.pressed.delete(codes[i]);
        return true;
      }
    }
    return false;
  }

  axisX(): number {
    const left = this.isDown('left') ? 1 : 0;
    const right = this.isDown('right') ? 1 : 0;
    return right - left;
  }

  /** 每帧末尾清理「刚按下」集合 */
  endFrame(): void {
    this.pressed.clear();
  }

  clear(): void {
    this.down.clear();
    this.pressed.clear();
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.clear();
    this.codeToActions.clear();
  }
}
