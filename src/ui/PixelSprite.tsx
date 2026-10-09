import { useEffect, useRef } from 'react';
import { SPRITES, SpriteCache } from '../render/sprites';

const uiSpriteCache = new SpriteCache();

interface PixelSpriteProps {
  name: string;
  frame?: number;
  scale?: number;
  flip?: boolean;
  className?: string;
}

/** 界面上直接展示游戏里的像素精灵（开始界面的怪物图鉴就用它） */
export function PixelSprite({ name, frame = 0, scale = 3, flip = false, className }: PixelSpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = SPRITES[name];
  const rows = def?.frames[frame];
  const width = rows?.[0]?.length ?? 1;
  const height = rows?.length ?? 1;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !def || !rows) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const source = uiSpriteCache.get(name, frame);
    if (!source) return;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (flip) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    }
  }, [name, frame, scale, flip, width, height, def, rows]);

  return <canvas ref={ref} className={className} style={{ imageRendering: 'pixelated', display: 'block' }} />;
}
