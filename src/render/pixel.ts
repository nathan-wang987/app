/** 像素风绘制小工具（所有绘制都对齐整数，避免糊边） */

export const PIXEL_FONT = 'bold 12px "Courier New", Consolas, monospace';

export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size = 12,
  align: CanvasTextAlign = 'center',
  shadow = true,
): void {
  ctx.save();
  ctx.font = `bold ${size}px "Courier New", Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const px = Math.round(x);
  const py = Math.round(y);
  if (shadow) {
    ctx.fillStyle = 'rgba(6, 8, 16, 0.85)';
    ctx.fillText(text, px + 1, py + 1);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, px, py);
  ctx.restore();
}

export function drawPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  border?: string,
): void {
  const px = Math.round(x);
  const py = Math.round(y);
  const pw = Math.max(1, Math.round(w));
  const ph = Math.max(1, Math.round(h));
  ctx.fillStyle = fill;
  ctx.fillRect(px, py, pw, ph);
  if (border) {
    ctx.fillStyle = border;
    ctx.fillRect(px, py, pw, 1);
    ctx.fillRect(px, py + ph - 1, pw, 1);
    ctx.fillRect(px, py, 1, ph);
    ctx.fillRect(px + pw - 1, py, 1, ph);
  }
}

/** 简易的确定性噪声（用来做地面杂点，不会每帧闪） */
export function hash2d(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
