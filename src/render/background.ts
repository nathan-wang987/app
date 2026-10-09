import { GROUND_Y, VIEW_H, WORLD_WIDTH } from '../game/constants';

/**
 * 背景：三层视差 + 地面纹理。
 * 远景/中景各烘焙成一张可平铺的 canvas，绘制时只做两次 drawImage（循环滚动），
 * 不随关卡长度增加开销。
 */
export class Background {
  private far: HTMLCanvasElement | null = null;
  private mid: HTMLCanvasElement | null = null;
  private ground: HTMLCanvasElement | null = null;
  private readonly farW = 480;
  private readonly midW = 360;
  private readonly groundW = 240;

  private bake(): void {
    if (this.far) return;

    this.far = createCanvas(this.farW, VIEW_H);
    const fc = this.far.getContext('2d');
    if (fc) {
      // 夜空渐变（用色带模拟像素渐变）
      const bands = ['#101019', '#161629', '#1d1c33', '#252341', '#2e2a4d'];
      bands.forEach((color, i) => {
        fc.fillStyle = color;
        fc.fillRect(0, i * (VIEW_H / bands.length), this.farW, VIEW_H / bands.length + 1);
      });
      // 月亮
      fc.fillStyle = '#d9e6ff';
      circleRects(fc, 96, 52, 13);
      fc.fillStyle = '#1b1a2e';
      circleRects(fc, 91, 48, 11);
      // 星星
      fc.fillStyle = '#8ea2c8';
      const stars = [24, 58, 140, 176, 214, 260, 300, 342, 388, 430, 466];
      stars.forEach((x, i) => {
        fc.fillRect(x, 20 + ((i * 37) % 60), 1, 1);
        fc.fillRect((x + 90) % this.farW, 70 + ((i * 53) % 50), 1, 1);
      });
      // 远山
      fc.fillStyle = '#232a45';
      mountain(fc, 0, 180, 120, 70);
      mountain(fc, 110, 186, 150, 78);
      mountain(fc, 250, 178, 130, 74);
      mountain(fc, 360, 188, 120, 66);
      fc.fillStyle = '#2b3354';
      mountain(fc, 40, 200, 100, 52);
      mountain(fc, 200, 204, 110, 56);
      mountain(fc, 330, 198, 90, 50);
    }

    this.mid = createCanvas(this.midW, VIEW_H);
    const mc = this.mid.getContext('2d');
    if (mc) {
      // 废墟柱与灌木
      const pillars = [40, 150, 268];
      pillars.forEach((x) => {
        mc.fillStyle = '#39405f';
        mc.fillRect(x, 150, 16, GROUND_Y - 150);
        mc.fillStyle = '#4a5378';
        mc.fillRect(x, 150, 16, 4);
        mc.fillRect(x - 3, 146, 22, 4);
        mc.fillStyle = '#2f3650';
        for (let y = 160; y < GROUND_Y; y += 12) mc.fillRect(x + 2, y, 12, 1);
      });
      const bushes = [96, 214, 320];
      bushes.forEach((x) => {
        mc.fillStyle = '#2f4a44';
        mc.fillRect(x, GROUND_Y - 14, 34, 14);
        mc.fillRect(x + 6, GROUND_Y - 20, 22, 8);
        mc.fillStyle = '#3d5f56';
        mc.fillRect(x + 8, GROUND_Y - 18, 18, 5);
      });
    }

    this.ground = createCanvas(this.groundW, 64);
    const gc = this.ground.getContext('2d');
    if (gc) {
      gc.fillStyle = '#3b3550';
      gc.fillRect(0, 0, this.groundW, 64);
      gc.fillStyle = '#4d4666';
      gc.fillRect(0, 0, this.groundW, 6);
      gc.fillStyle = '#8f87b5';
      gc.fillRect(0, 0, this.groundW, 2);
      gc.fillStyle = '#332e46';
      for (let y = 10; y < 64; y += 10) {
        for (let x = ((y / 10) % 2) * 12; x < this.groundW; x += 24) {
          gc.fillRect(x, y, 22, 1);
        }
      }
      for (let x = 0; x < this.groundW; x += 24) {
        gc.fillRect(x, 6, 1, 58);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
    this.bake();
    const y = -cameraY;

    if (this.far) drawTiled(ctx, this.far, cameraX * 0.25, y);
    if (this.mid) drawTiled(ctx, this.mid, cameraX * 0.55, y);
    // 地面只画相机可见范围
    if (this.ground) {
      const start = Math.floor(cameraX / this.groundW) * this.groundW;
      for (let x = start - this.groundW; x < cameraX + 480 + this.groundW; x += this.groundW) {
        ctx.drawImage(this.ground, Math.round(x - cameraX), Math.round(GROUND_Y - cameraY));
      }
    }
    // 世界尽头的雾
    ctx.fillStyle = 'rgba(16,16,25,0.35)';
    const fadeX = WORLD_WIDTH - 60 - cameraX;
    if (fadeX < 480) ctx.fillRect(Math.round(fadeX), 0, 480, VIEW_H);
  }

  dispose(): void {
    this.far = null;
    this.mid = null;
    this.ground = null;
  }
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  return c;
}

function drawTiled(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  offset: number,
  y: number
): void {
  const w = layer.width;
  const start = Math.floor(offset / w) * w;
  for (let x = start - w; x < offset + 480 + w; x += w) {
    ctx.drawImage(layer, Math.round(x - offset), Math.round(y));
  }
}

function mountain(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  width: number,
  height: number
): void {
  for (let i = 0; i < width; i += 4) {
    const t = i / width;
    const h = Math.sin(Math.PI * t) * height;
    ctx.fillRect(x + i, baseY - h, 4, h);
  }
}

function circleRects(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= r; y += 1) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}
