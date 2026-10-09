type Listener = () => void;

/**
 * React 用 useSyncExternalStore 订阅它。
 * 引擎按固定频率（或状态变化时）把一份不可变快照塞进来，界面只读快照，
 * 从而做到「游戏逻辑 60fps 跑，React 只按需重渲染」。
 */
export class SnapshotStore<T> {
  private listeners = new Set<Listener>();
  private value: T;

  constructor(initial: T) {
    this.value = initial;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): T => this.value;

  set(value: T): void {
    this.value = value;
    for (const listener of Array.from(this.listeners)) listener();
  }

  dispose(): void {
    this.listeners.clear();
  }
}
