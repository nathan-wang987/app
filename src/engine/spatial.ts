/**
 * 均匀网格空间哈希：用于怪物之间的软分离与出生点校验。
 * 每帧复用同一批数组（clear 而非重建），避免持续分配。
 */
export class SpatialHash<T extends { x: number; y: number }> {
  private readonly cells = new Map<number, T[]>();

  constructor(
    private readonly cellSize: number,
    private readonly originX = 0,
    private readonly originY = 0
  ) {}

  private key(cx: number, cy: number): number {
    // 坐标系不大（约 2000x600，格子 48px），用位运算打包即可避免字符串分配。
    return ((cx + 1024) << 12) | ((cy + 1024) & 0xfff);
  }

  clear(): void {
    for (const bucket of this.cells.values()) bucket.length = 0;
  }

  /** x / y 默认取 item 自身坐标，也可以显式传入（例如用实体中心点）。 */
  insert(item: T, radius = 0, x = item.x, y = item.y): void {
    const minX = Math.floor((x - radius - this.originX) / this.cellSize);
    const maxX = Math.floor((x + radius - this.originX) / this.cellSize);
    const minY = Math.floor((y - radius - this.originY) / this.cellSize);
    const maxY = Math.floor((y + radius - this.originY) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        const k = this.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(item);
      }
    }
  }

  /** 收集邻近对象到 out（out 由调用方复用）。 */
  query(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    const minX = Math.floor((x - radius - this.originX) / this.cellSize);
    const maxX = Math.floor((x + radius - this.originX) / this.cellSize);
    const minY = Math.floor((y - radius - this.originY) / this.cellSize);
    const maxY = Math.floor((y + radius - this.originY) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) {
          const item = bucket[i];
          if (out.indexOf(item) === -1) out.push(item);
        }
      }
    }
    return out;
  }

  /** 释放不再需要的格子数组（场景切换时调用）。 */
  dispose(): void {
    this.cells.clear();
  }
}
