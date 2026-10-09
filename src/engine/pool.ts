/**
 * 通用对象池：粒子、飘字这类高频短生命周期对象复用同一批实例，
 * 避免长时间游玩时不断 new/GC 造成卡顿与内存增长。
 */
export interface Poolable {
  active: boolean;
}

export class Pool<T extends Poolable> {
  private items: T[] = [];
  private cursor = 0;

  constructor(
    private readonly factory: () => T,
    private readonly capacity: number,
  ) {}

  get size(): number {
    return this.items.length;
  }

  get activeCount(): number {
    let n = 0;
    for (const item of this.items) if (item.active) n += 1;
    return n;
  }

  /** 取一个空闲实例；池满则返回 null（宁可丢特效，也不要无限增长） */
  spawn(): T | null {
    const len = this.items.length;
    for (let i = 0; i < len; i += 1) {
      const index = (this.cursor + i) % len;
      const item = this.items[index];
      if (!item.active) {
        this.cursor = (index + 1) % len;
        item.active = true;
        return item;
      }
    }
    if (len < this.capacity) {
      const item = this.factory();
      item.active = true;
      this.items.push(item);
      this.cursor = this.items.length % this.capacity;
      return item;
    }
    return null;
  }

  forEachActive(fn: (item: T) => void): void {
    for (const item of this.items) {
      if (item.active) fn(item);
    }
  }

  /** 紧凑遍历 + 自动回收（更新逻辑里用这个） */
  update(fn: (item: T) => boolean): void {
    for (const item of this.items) {
      if (!item.active) continue;
      const keep = fn(item);
      if (!keep) item.active = false;
    }
  }

  clear(): void {
    for (const item of this.items) item.active = false;
  }

  /** 彻底释放（离开游戏时调用，防止残留引用） */
  dispose(): void {
    this.items.length = 0;
    this.cursor = 0;
  }
}
