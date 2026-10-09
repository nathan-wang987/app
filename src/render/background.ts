import { Rng } from '../engine/rng';

/**
 * 像素风视差背景。
 * 所有图案在模块初始化时用固定种子生成一次，运行时只做绘制，
 * 既不产生垃圾对象，也保证画面稳定不闪烁。
 */

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

const STAR_FIELD_WIDTH = 1400;
const stars: Star[] = (() => {
  const rng = new Rng(1337);
  const list: Star[] = [];
  for (let i = 0; i < 110; i += 1) {
    list.push({
      x: rng.range(0, STAR_FIELD_WIDTH),
      y: rng.range(10, 300),
      size: rng.next() < 0.75 ? 2 : 3,
      phase: rng.range(0, Math.PI * 2),
    });
  }
  return list;
})();

const MOUNTAIN_TILE = 900;
const mountainFar: number[][] = (() => {
  const rng = new Rng(90210);
  const points: number[][] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    points.push([(i / steps) * MOUNTAIN_TILE, rng.range(120, 260)]);
  }
  points[steps][1] = points[0][1];
  return points;
})();

const HILL_TILE = 620;
const hills: number[][] = (() => {
  const rng = new Rng(4242);
  const points: number[][] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    points.push([(i / steps) * HILL_TILE, rng.range(300, 360)]);
  }
  points[steps][1] = points[0][1];
  return points;
})();

const TREE_TILE = 220;
interface TreeSpec {
  offset: number;
  height: number;
  width: number;
}
const trees: TreeSpec[] = (() => {
  const rng = new Rng(777);
  const list: TreeSpec[] = [];
  for (let i = 0; i < 6; i += 1) {
    list.push({
      offset: i * (TREE_TILE / 6) + rng.range(0, 18),
      height: rng.range(90, 150),
      width: rng.range(26, 40),
    });
  }
  return list;
})();

export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#0b1024');
  gradient.addColorStop(0.45, '#1b2450');
  gradient.addColorStop(0.78, '#3b3a6b');
  gradient.addColorStop(1, '#6b5b7b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

export function drawStars(ctx: CanvasRenderingContext2D, cameraX: number, time: number): void {
  const offset = (cameraX * 0.06) % STAR_FIELD_WIDTH;
  ctx.save();
  for (const star of stars) {
    const baseX = star.x - offset;
    const x = ((baseX % STAR_FIELD_WIDTH) + STAR_FIELD_WIDTH) % STAR_FIELD_WIDTH;
    const alpha = 0.45 + 0.35 * Math.sin(time * 1.6 + star.phase);
    ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(star.y), star.size, star.size);
  }
  ctx.restore();
}

export function drawMoon(ctx: CanvasRenderingContext2D, cameraX: number, viewW: number): void {
  const x = Math.round(viewW * 0.66 - ((cameraX * 0.03) % 200));
  const y = 78;
  ctx.save();
  ctx.fillStyle = 'rgba(253, 230, 138, 0.16)';
  ctx.beginPath();
  ctx.arc(x, y, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 96, 60, 0.25)';
  ctx.fillRect(x - 12, y - 14, 8, 8);
  ctx.fillRect(x + 4, y - 2, 10, 9);
  ctx.fillRect(x - 6, y + 10, 7, 6);
  ctx.restore();
}

export function drawMountains(ctx: CanvasRenderingContext2D, cameraX: number, viewW: number, viewH: number): void {
  const factor = 0.18;
  const baseY = viewH * 0.62;
  const offset = (cameraX * factor) % MOUNTAIN_TILE;
  const tiles = Math.ceil(viewW / MOUNTAIN_TILE) + 2;
  ctx.save();
  for (let t = -1; t < tiles; t += 1) {
    const originX = t * MOUNTAIN_TILE - offset;
    ctx.beginPath();
    ctx.moveTo(originX, baseY + 40);
    for (const [x, y] of mountainFar) {
      ctx.lineTo(originX + x, baseY + y * 0.55);
    }
    ctx.lineTo(originX + MOUNTAIN_TILE, baseY + 40);
    ctx.closePath();
    ctx.fillStyle = '#252c52';
    ctx.fill();
    // 山顶亮边
    ctx.beginPath();
    ctx.moveTo(originX, baseY + 40);
    for (const [x, y] of mountainFar) {
      ctx.lineTo(originX + x, baseY + y * 0.55);
    }
    ctx.strokeStyle = '#3a4374';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawHills(ctx: CanvasRenderingContext2D, cameraX: number, viewW: number, viewH: number): void {
  const factor = 0.34;
  const baseY = viewH * 0.82;
  const offset = (cameraX * factor) % HILL_TILE;
  const tiles = Math.ceil(viewW / HILL_TILE) + 2;
  ctx.save();
  for (let t = -1; t < tiles; t += 1) {
    const originX = t * HILL_TILE - offset;
    ctx.beginPath();
    ctx.moveTo(originX, baseY + 60);
    for (const [x, y] of hills) {
      ctx.lineTo(originX + x, baseY + (y - 300) * 0.4);
    }
    ctx.lineTo(originX + HILL_TILE, baseY + 60);
    ctx.closePath();
    ctx.fillStyle = '#1d2440';
    ctx.fill();
    // 树干剪影
    ctx.fillStyle = '#151a30';
    for (const tree of trees) {
      const tx = originX + tree.offset;
      const ty = baseY - 6;
      ctx.fillRect(Math.round(tx), Math.round(ty - tree.height), 6, tree.height);
      ctx.fillRect(Math.round(tx - tree.width * 0.5), Math.round(ty - tree.height - 22), tree.width, 26);
      ctx.fillRect(Math.round(tx - tree.width * 0.35), Math.round(ty - tree.height - 40), tree.width * 0.7, 22);
    }
  }
  ctx.restore();
}

/** 地面附近的地雾，让画面有纵深，也压住背景与地面的接缝 */
export function drawFog(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, cameraY: number, groundScreenY: number): void {
  const top = Math.min(viewH, groundScreenY - 90 - cameraY * 0.1);
  const gradient = ctx.createLinearGradient(0, top, 0, Math.min(viewH, groundScreenY + 40 - cameraY * 0.1));
  gradient.addColorStop(0, 'rgba(30, 34, 60, 0)');
  gradient.addColorStop(1, 'rgba(18, 20, 38, 0.85)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, Math.max(0, top), viewW, Math.max(0, viewH - Math.max(0, top)));
}
