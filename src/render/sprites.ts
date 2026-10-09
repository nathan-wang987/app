import type { EnemyKind } from '../game/types';

/**
 * 像素美术烘焙层。
 *
 * 每帧用 fillRect 逐个像素画角色会非常耗 CPU，所以这里在首次使用时
 * 把每个动作帧“烘焙”成一张小 canvas 并缓存，运行时只做 drawImage。
 * 缓存数量固定（约 50 张小图），不会随游戏时长增长（需求 9）。
 */

export type SpriteAnim =
  | 'idle'
  | 'run'
  | 'rise'
  | 'fall'
  | 'attack'
  | 'spin'
  | 'dash'
  | 'hurt'
  | 'dead'
  | 'walk'
  | 'windup';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** 锚点：脚底中心，绘制时用实体的底部中心对齐到这里。 */
  anchorX: number;
  anchorY: number;
}

const FLASH = '#ffffff';

class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    private readonly tint: boolean
  ) {}

  private color(c: string): string {
    return this.tint ? FLASH : c;
  }

  r(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = this.color(color);
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  px(x: number, y: number, color: string): void {
    this.r(x, y, 1, 1, color);
  }

  /** 像素直线（用方块沿方向铺），用于刀身、法杖这类需要旋转的部件。 */
  line(x: number, y: number, dirX: number, dirY: number, length: number, thickness: number, color: string): void {
    for (let i = 0; i <= length; i += 1) {
      const px = x + dirX * i;
      const py = y + dirY * i;
      this.r(px - thickness * 0.5 + 0.5, py - thickness * 0.5 + 0.5, thickness, thickness, color);
    }
  }
}

interface Palette {
  armor: string;
  armorDark: string;
  armorLight: string;
  skin: string;
  hair: string;
  accent: string;
  metal: string;
  metalLight: string;
}

const PLAYER_PALETTE: Palette = {
  armor: '#4a7fd4',
  armorDark: '#27427e',
  armorLight: '#8fc0ff',
  skin: '#f4c9a4',
  hair: '#3a3550',
  accent: '#e2564c',
  metal: '#dfe9f5',
  metalLight: '#ffffff'
};

interface Pose {
  bob: number;
  legSwing: number;
  armAngle: number;
  swordLength: number;
  lean: number;
  dead?: boolean;
}

function drawPlayer(p: Painter, pose: Pose): void {
  const pal = PLAYER_PALETTE;
  const bob = pose.bob;
  const baseY = 29 + bob;
  const legLift = Math.max(0, -pose.legSwing) * 2;
  const legLiftR = Math.max(0, pose.legSwing) * 2;

  // 披风（先画，位于身体后方）
  p.r(9, 15 + bob, 2, 8, pal.armorDark);
  p.r(10, 22 + bob, 3, 2, pal.armorDark);

  // 腿
  p.r(11, baseY - 7 + legLift, 3, 7 - legLift, pal.armorDark);
  p.r(14, baseY - 7 + legLiftR, 3, 7 - legLiftR, pal.armorDark);
  p.r(10, baseY - 2, 4, 2, pal.hair);
  p.r(14, baseY - 2, 4, 2, pal.hair);

  // 躯干
  p.r(11, 14 + bob, 6, 8, pal.armor);
  p.r(12, 15 + bob, 2, 6, pal.armorLight);
  p.r(11, 21 + bob, 6, 1, pal.armorDark);
  p.r(10, 14 + bob, 1, 5, pal.armorDark);

  // 头 + 发带
  p.r(11, 7 + bob, 6, 7, pal.skin);
  p.r(10, 6 + bob, 8, 3, pal.hair);
  p.r(10, 9 + bob, 8, 1, pal.accent);
  p.r(10, 10 + bob, 2, 2, pal.accent);
  p.px(15, 11 + bob, '#2b2233');
  p.px(15, 12 + bob, '#2b2233');

  // 持刀手臂 + 刀（按角度旋转）
  const handX = 17 + Math.cos(pose.armAngle) * 2;
  const handY = 18 + bob + Math.sin(pose.armAngle) * 2;
  p.r(16, 16 + bob, 2, 4, pal.skin);
  p.r(handX - 1, handY - 1, 3, 3, pal.accent);
  p.line(
    handX,
    handY,
    Math.cos(pose.armAngle),
    Math.sin(pose.armAngle),
    pose.swordLength,
    2,
    pal.metal
  );
  p.line(
    handX + Math.cos(pose.armAngle) * 2,
    handY + Math.sin(pose.armAngle) * 2,
    Math.cos(pose.armAngle),
    Math.sin(pose.armAngle),
    pose.swordLength - 2,
    1,
    pal.metalLight
  );
  p.r(handX - Math.cos(pose.armAngle) * 1 - 1, handY - Math.sin(pose.armAngle) * 1 - 1, 2, 2, pal.armorDark);
}

function playerPose(anim: SpriteAnim, frame: number): Pose {
  switch (anim) {
    case 'idle':
      return {
        bob: frame % 2 === 0 ? 0 : 1,
        legSwing: 0,
        armAngle: 0.35,
        swordLength: 10,
        lean: 0
      };
    case 'run': {
      const swing = [1.5, 0, -1.5, 0][frame % 4];
      return { bob: frame % 2, legSwing: swing, armAngle: 0.2 + swing * 0.2, swordLength: 10, lean: 1 };
    }
    case 'rise':
      return { bob: -1, legSwing: 1, armAngle: -0.5, swordLength: 10, lean: 1 };
    case 'fall':
      return { bob: 0, legSwing: -1, armAngle: 0.8, swordLength: 10, lean: 0 };
    case 'attack':
      // 0 抬手 / 1 挥砍 / 2 收势
      return [
        { bob: 0, legSwing: 1, armAngle: -1.2, swordLength: 11, lean: 1 },
        { bob: 0, legSwing: -1, armAngle: 0.35, swordLength: 13, lean: 3 },
        { bob: 1, legSwing: 0, armAngle: 0.9, swordLength: 11, lean: 1 }
      ][Math.min(frame, 2)];
    case 'spin': {
      const angle = (Math.PI * 2 * frame) / 4 - Math.PI * 0.5;
      return { bob: frame % 2, legSwing: 0, armAngle: angle, swordLength: 12, lean: 0 };
    }
    case 'dash':
      return { bob: 0, legSwing: 2, armAngle: 0.05, swordLength: 13, lean: 4 };
    case 'hurt':
      return { bob: 1, legSwing: -1, armAngle: 1.4, swordLength: 9, lean: -2 };
    case 'dead':
      return { bob: 0, legSwing: 2, armAngle: 1.6, swordLength: 7, lean: -1, dead: true };
    default:
      return { bob: 0, legSwing: 0, armAngle: 0.35, swordLength: 10, lean: 0 };
  }
}

interface SpriteSpec {
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  count: number;
  draw(p: Painter, anim: SpriteAnim, frame: number): void;
}

const IMP = { body: '#e45b52', bodyDark: '#a6332f', belly: '#f2a08c', horn: '#f3d9a8', eye: '#ffe066', claw: '#f7f0e0' };
const MAGE = { robe: '#ffc44d', robeDark: '#c98a21', trim: '#fff3cf', face: '#2c2338', glow: '#7ff0ff', staff: '#7a5230' };
const TANK = { body: '#8ab46a', bodyDark: '#557041', plate: '#c3d3a8', metal: '#9aa3ad', metalDark: '#5d6570', eye: '#ffe066' };

const SPECS: Record<'player' | EnemyKind, SpriteSpec> = {
  player: {
    w: 34,
    h: 32,
    anchorX: 17,
    anchorY: 30,
    count: 4,
    draw: (p, anim, frame) => drawPlayer(p, playerPose(anim, frame))
  },
  chaser: {
    w: 24,
    h: 24,
    anchorX: 12,
    anchorY: 21,
    count: 4,
    draw: (p, anim, frame) => drawImp(p, anim, frame)
  },
  glass: {
    w: 28,
    h: 26,
    anchorX: 14,
    anchorY: 24,
    count: 4,
    draw: (p, anim, frame) => drawMage(p, anim, frame)
  },
  tank: {
    w: 34,
    h: 28,
    anchorX: 17,
    anchorY: 25,
    count: 4,
    draw: (p, anim, frame) => drawTank(p, anim, frame)
  }
};

function drawImp(p: Painter, anim: SpriteAnim, frame: number): void {
  const c = IMP;
  const bob = anim === 'walk' ? frame % 2 : 0;
  const windup = anim === 'windup';
  const lean = windup ? -2 : anim === 'attack' ? 2 : 0;
  const y0 = bob;

  // 腿
  const stride = anim === 'walk' ? [1, 0, -1, 0][frame % 4] : 0;
  p.r(8 + stride, 17 + y0, 3, 4, c.bodyDark);
  p.r(13 - stride, 17 + y0, 3, 4, c.bodyDark);
  p.r(7 + stride, 20 + y0, 4, 1, c.claw);
  p.r(13 - stride, 20 + y0, 4, 1, c.claw);

  // 身体
  p.r(8 + lean, 9 + y0, 8, 9, c.body);
  p.r(10 + lean, 12 + y0, 4, 6, c.belly);
  p.r(8 + lean, 16 + y0, 8, 2, c.bodyDark);

  // 手臂与爪
  const armSwing = windup ? -3 : 0;
  p.r(6 + lean + armSwing, 11 + y0, 2, 5, c.bodyDark);
  p.r(16 + lean - armSwing, 11 + y0, 2, 5, c.bodyDark);
  p.r(5 + lean + armSwing, 15 + y0, 3, 2, c.claw);
  p.r(16 + lean - armSwing, 15 + y0, 3, 2, c.claw);

  // 头 / 角 / 眼睛 / 牙
  p.r(9 + lean, 4 + y0, 6, 6, c.body);
  p.r(7 + lean, 3 + y0, 2, 3, c.horn);
  p.r(15 + lean, 3 + y0, 2, 3, c.horn);
  p.r(10 + lean, 6 + y0, 2, 2, c.eye);
  p.r(13 + lean, 6 + y0, 2, 2, c.eye);
  p.px(11 + lean, 7 + y0, '#2b1020');
  p.px(14 + lean, 7 + y0, '#2b1020');
  p.r(10 + lean, 10 + y0, 4, 1, c.claw);
  if (windup) {
    // 前摇时张大嘴 + 冒火的提示
    p.r(10 + lean, 9 + y0, 4, 3, '#3a0d16');
    p.px(11 + lean, 8 + y0, '#fff1a8');
    p.px(13 + lean, 8 + y0, '#fff1a8');
  }
}

function drawMage(p: Painter, anim: SpriteAnim, frame: number): void {
  const c = MAGE;
  const windup = anim === 'windup';
  const attack = anim === 'attack';
  const bob = anim === 'walk' ? frame % 2 : 0;
  const lean = windup ? -2 : attack ? 3 : 0;
  const y0 = bob;

  // 长袍
  p.r(9 + lean, 10 + y0, 8, 12, c.robe);
  p.r(8 + lean, 20 + y0, 10, 2, c.robeDark);
  p.r(10 + lean, 12 + y0, 2, 9, c.trim);
  p.r(7 + lean, 9 + y0, 12, 2, c.robeDark);

  // 帽兜 + 阴影里的脸
  p.r(9 + lean, 4 + y0, 8, 6, c.robe);
  p.r(8 + lean, 8 + y0, 10, 2, c.robeDark);
  p.r(11 + lean, 6 + y0, 4, 3, c.face);
  p.px(11 + lean, 7 + y0, c.glow);
  p.px(13 + lean, 7 + y0, c.glow);
  p.r(12 + lean, 3 + y0, 2, 2, c.robeDark);

  // 大水晶镰刀：前摇时长高并变亮（一眼看出要放大招）
  const staffX = windup ? 20 : 19;
  const crystalSize = windup ? 6 : 4;
  const crystalY = windup ? 1 : 3;
  p.r(staffX, 6, 1, 15, c.staff);
  p.r(staffX - 1, 15, 3, 1, c.staff);
  p.r(staffX - crystalSize / 2, crystalY + (windup ? 2 : 4), crystalSize, crystalSize, windup ? '#ffffff' : c.glow);
  p.r(staffX - 1, crystalY + (windup ? 3 : 5), 2, 2, '#ffffff');
  if (windup) {
    p.px(staffX - 4, crystalY + 5, c.glow);
    p.px(staffX + 3, crystalY + 4, c.glow);
  }
}

function drawTank(p: Painter, anim: SpriteAnim, frame: number): void {
  const c = TANK;
  const windup = anim === 'windup';
  const attack = anim === 'attack';
  const bob = anim === 'walk' ? frame % 2 : 0;
  const y0 = bob;
  const armLift = windup ? -4 : attack ? 1 : 0;

  // 粗腿
  const stride = anim === 'walk' ? [1, 0, -1, 0][frame % 4] : 0;
  p.r(9 + stride, 19 + y0, 6, 6, c.metalDark);
  p.r(18 - stride, 19 + y0, 6, 6, c.metalDark);
  p.r(8 + stride, 24 + y0, 8, 2, c.metal);
  p.r(17 - stride, 24 + y0, 8, 2, c.metal);

  // 巨大的身体
  p.r(7, 9 + y0, 20, 12, c.body);
  p.r(9, 11 + y0, 16, 4, c.plate);
  p.r(7, 18 + y0, 20, 3, c.bodyDark);
  p.r(7, 9 + y0, 2, 12, c.bodyDark);

  // 肩甲与手臂
  p.r(2, 9 + y0 + armLift, 6, 9, c.metal);
  p.r(26, 9 + y0 + armLift, 6, 9, c.metal);
  p.r(3, 17 + y0 + armLift, 5, 4, c.metalDark);
  p.r(26, 17 + y0 + armLift, 5, 4, c.metalDark);

  // 头盔 + 眼睛
  p.r(10, 4 + y0, 14, 6, c.metal);
  p.r(10, 9 + y0, 14, 2, c.metalDark);
  p.r(12, 6 + y0, 10, 2, '#2f3540');
  p.r(13, 6 + y0, 2, 2, c.eye);
  p.r(19, 6 + y0, 2, 2, c.eye);
  if (windup) {
    p.r(12, 5 + y0, 10, 1, '#ffd479');
  }
}

const cache = new Map<string, Sprite>();

/**
 * 取一张烘焙好的精灵。
 * frame 会先按动画长度取模，越界或未定义的动画自动回落到 idle。
 */
export function getSprite(
  kind: 'player' | EnemyKind,
  anim: SpriteAnim,
  frame: number,
  tint = false
): Sprite {
  const total = frameCount(kind, anim);
  const idx = ((frame % total) + total) % total;
  const key = `${kind}:${anim}:${idx}:${tint ? 1 : 0}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const spec = SPECS[kind];
  const canvas = document.createElement('canvas');
  canvas.width = spec.w;
  canvas.height = spec.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { canvas, anchorX: spec.anchorX, anchorY: spec.anchorY };
  }
  ctx.imageSmoothingEnabled = false;
  spec.draw(new Painter(ctx, tint), anim, idx);

  const sprite: Sprite = { canvas, anchorX: spec.anchorX, anchorY: spec.anchorY };
  cache.set(key, sprite);
  return sprite;
}

const FRAME_COUNTS: Partial<Record<'player' | EnemyKind, Partial<Record<SpriteAnim, number>>>> = {
  player: {
    idle: 2,
    run: 4,
    rise: 1,
    fall: 1,
    attack: 3,
    spin: 4,
    dash: 1,
    hurt: 1,
    dead: 1
  },
  chaser: { idle: 2, walk: 4, windup: 1, attack: 1, hurt: 1, dead: 1 },
  glass: { idle: 2, walk: 4, windup: 2, attack: 1, hurt: 1, dead: 1 },
  tank: { idle: 2, walk: 4, windup: 2, attack: 1, hurt: 1, dead: 1 }
};

export function frameCount(kind: 'player' | EnemyKind, anim: SpriteAnim): number {
  return FRAME_COUNTS[kind]?.[anim] ?? FRAME_COUNTS[kind]?.idle ?? 2;
}

/** 预热常用帧，避免第一次出现敌人时卡一帧。 */
export function warmupSprites(): void {
  const kinds: ('player' | EnemyKind)[] = ['player', 'chaser', 'glass', 'tank'];
  const anims: SpriteAnim[] = ['idle', 'run', 'walk', 'windup', 'attack', 'hurt', 'spin', 'dash', 'rise', 'fall', 'dead'];
  for (const kind of kinds) {
    for (const anim of anims) {
      if (!FRAME_COUNTS[kind]?.[anim]) continue;
      getSprite(kind, anim, 0, false);
      getSprite(kind, anim, 0, true);
    }
  }
}
