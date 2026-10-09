type Listener<T> = (payload: T) => void;

/**
 * 极简类型化事件总线。用来把引擎/玩法里的离散事件（升级、波次结束、死亡）
 * 通知给界面层，避免界面每帧轮询。
 */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(key: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set?.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof Events>(key: K, payload: Events[K]): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const listener of Array.from(set)) {
      (listener as Listener<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
