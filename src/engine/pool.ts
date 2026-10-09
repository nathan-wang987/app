/**
 * 通用对象池：粒子 / 伤害飘字这类高频创建的对象从这里复用，
 * 保证长时间游玩不会持续分配内存（见需求 9）。
 */
export class ObjectPool<T extends { active: boolean }> {
  private readonly items: T[] = [];
  private liveCount = 0;

  constructor(
    private readonly factory: () => T,
    private readonly onAcquire: (item: T) => void,
    readonly capacity: number,
    preallocate = 0
  ) {
    const initial = Math.min(preallocate, capacity);
    for (let i = 0; i < initial; i += 1) {
      const item = this.factory();
      item.active = false;
      this.items.push(item);
    }
  }

  /** 取出一个可用对象；池满且都在使用中时返回 null（调用方直接跳过本次特效）。 */
  acquire(): T | null {
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      if (!item.active) {
        item.active = true;
        this.liveCount += 1;
        this.onAcquire(item);
        return item;
      }
    }
    if (this.items.length >= this.capacity) return null;
    const created = this.factory();
    created.active = true;
    this.items.push(created);
    this.liveCount += 1;
    this.onAcquire(created);
    return created;
  }

  forEachActive(fn: (item: T) => void): void {
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      if (item.active) fn(item);
    }
  }

  /** 回收一个对象（幂等）。 */
  release(item: T): void {
    if (!item.active) return;
    item.active = false;
    this.liveCount -= 1;
  }

  get live(): number {
    return this.liveCount;
  }

  get size(): number {
    return this.items.length;
  }

  /** 回收全部并回到初始规模，避免扩容后的对象长期占用内存。 */
  reset(preallocate = 0): void {
    for (let i = 0; i < this.items.length; i += 1) this.items[i].active = false;
    this.liveCount = 0;
    const keep = Math.min(preallocate, this.capacity);
    if (this.items.length > keep) this.items.length = keep;
  }
}
