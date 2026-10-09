/**
 * 像素精灵资源。
 * 每个精灵是一组等宽字符串行，字符查调色板得到颜色，'.' 表示透明。
 * 运行时会被烘焙到离屏 canvas（见 SpriteCache），画面上用 drawImage 放大绘制，
 * 既保证像素边缘锐利，又避免逐像素 fillRect 带来的开销。
 */

export interface SpriteDef {
  palette: Record<string, string>;
  frames: string[][];
}

const PLAYER_PALETTE: Record<string, string> = {
  x: '#111827',
  s: '#cbd5e1',
  d: '#1f2937',
  h: '#f0b18a',
  b: '#5b8def',
  g: '#f2c14e',
  a: '#34508f',
  S: '#e6edf7',
};

const PLAYER_IDLE: string[] = [
  '....xxxx....',
  '...xssssx...',
  '...xsddsx...',
  '...xssssx...',
  '....xhhx....',
  '..xxbbbbxx..',
  '.xbbbbbbbbx.',
  '.xbbggggbbx.',
  '.xbbbbbbbbx.',
  '.xbbbbbbbbx.',
  '..xbbbbbbx..',
  '..xaa..aax..',
  '..xaa..aax..',
  '..xaa..aax..',
  '..xdd..ddx..',
  '..xxxx.xxxx.',
];

const PLAYER_ATTACK: string[] = [
  '....xxxx....',
  '...xssssx...',
  '...xsddsx...',
  '...xssssx...',
  '....xhhx....',
  '..xxbbbbxx..',
  '.xbbbbbbbbxx',
  '.xbbggggbbSx',
  '.xbbbbbbbbx.',
  '.xbbbbbbbbx.',
  '..xbbbbbbx..',
  '..xaa..aax..',
  '..xaa..aax..',
  '..xaa..aax..',
  '..xdd..ddx..',
  '..xxxx.xxxx.',
];

const PLAYER_WALK1: string[] = [
  '....xxxx....',
  '...xssssx...',
  '...xsddsx...',
  '...xssssx...',
  '....xhhx....',
  '..xxbbbbxx..',
  '.xbbbbbbbbx.',
  '.xbbggggbbx.',
  '.xbbbbbbbbx.',
  '.xbbbbbbbbx.',
  '..xbbbbbbx..',
  '..xaa..aax..',
  '.xaa....aax.',
  '.xaa....aax.',
  '.xdd....ddx.',
  '.xxx....xxx.',
];

const PLAYER_WALK2: string[] = [
  '....xxxx....',
  '...xssssx...',
  '...xsddsx...',
  '...xssssx...',
  '....xhhx....',
  '..xxbbbbxx..',
  '.xbbbbbbbbx.',
  '.xbbggggbbx.',
  '.xbbbbbbbbx.',
  '.xbbbbbbbbx.',
  '..xbbbbbbx..',
  '..xaa..aax..',
  '..xaa..aax..',
  '..xaa..aax..',
  '..xdd..ddx..',
  '..xxx..xxx..',
];

const PLAYER_JUMP: string[] = [
  '....xxxx....',
  '...xssssx...',
  '...xsddsx...',
  '...xssssx...',
  '....xhhx....',
  '..xxbbbbxx..',
  '.xbbbbbbbbx.',
  '.xbbggggbbx.',
  '.xbbbbbbbbx.',
  '.xbbbbbbbbx.',
  '..xbbbbbbx..',
  '..xaa..aax..',
  '.xaa......x.',
  '.xaa........',
  '.xdd........',
  '.xxx........',
];

const GRUNT_PALETTE: Record<string, string> = {
  x: '#14210f',
  g: '#6fbf4a',
  G: '#4f8f36',
  w: '#f7fee7',
};

const GRUNT_WALK1: string[] = [
  '....xxxx....',
  '...xggggx...',
  '..xgwgwgwx..',
  '..xggggggx..',
  '...xggggx...',
  '..xGggggGx..',
  '..xggggggx..',
  '..xggggggx..',
  '...xggggx...',
  '...xgGGgx...',
  '...xg..gx...',
  '...xg..gx...',
  '..xxg..gxx..',
  '..xxx..xxx..',
];

const GRUNT_WALK2: string[] = [
  '....xxxx....',
  '...xggggx...',
  '..xgwgwgwx..',
  '..xggggggx..',
  '...xggggx...',
  '..xGggggGx..',
  '..xggggggx..',
  '..xggggggx..',
  '...xggggx...',
  '...xgGGgx...',
  '..xxg..gxx..',
  '..xxg..gxx..',
  '...xxxxxx...',
  '...xx..xx...',
];

const BERSERKER_PALETTE: Record<string, string> = {
  x: '#2b0b0b',
  r: '#ef4444',
  R: '#b91c1c',
  w: '#fff7ed',
};

const BERSERKER_WALK1: string[] = [
  '.x......x.',
  '.x.xxxx.x.',
  '.xxrrrrxx.',
  '..xrwwrx..',
  '..xrrrrx..',
  '..xRrrRx..',
  '...xrrx...',
  '..xrrrrx..',
  '..xrrrrx..',
  '..xrrrrx..',
  '...xrrx...',
  '...x..x...',
  '..xx..xx..',
  '..xx..xx..',
];

const BERSERKER_WALK2: string[] = [
  '.x......x.',
  '.x.xxxx.x.',
  '.xxrrrrxx.',
  '..xrwwrx..',
  '..xrrrrx..',
  '..xRrrRx..',
  '...xrrx...',
  '..xrrrrx..',
  '..xrrrrx..',
  '..xrrrrx..',
  '...xrrx...',
  '..x....x..',
  '..xx..xx..',
  '..xx..xx..',
];

const BRUTE_PALETTE: Record<string, string> = {
  x: '#221a33',
  p: '#8f7bd6',
  d: '#5f4fa0',
  q: '#4a3c86',
  w: '#ffe9a8',
};

const BRUTE_WALK1: string[] = [
  '.....xxxxxx.....',
  '....xppppppx....',
  '...xppppppppx...',
  '...xpwwppwwpx...',
  '...xppppppppx...',
  '....xppppppx....',
  '..xxppppppppxx..',
  '.xppppppppppppx.',
  '.xpppddddddpppx.',
  '.xpppddddddpppx.',
  '.xpppddddddpppx.',
  '..xppppppppppx..',
  '...xppppppppx...',
  '...xqq....qqx...',
  '...xqq....qqx...',
  '..xxxx....xxxx..',
];

const BRUTE_WALK2: string[] = [
  '.....xxxxxx.....',
  '....xppppppx....',
  '...xppppppppx...',
  '...xpwwppwwpx...',
  '...xppppppppx...',
  '....xppppppx....',
  '...xppppppppx...',
  '..xppppppppppx..',
  '.xppppppppppppx.',
  '.xpppddddddpppx.',
  '.xpppddddddpppx.',
  '.xpppddddddpppx.',
  '..xppppppppppx..',
  '..xqq......qqx..',
  '..xqq......qqx..',
  '..xxxx....xxxx..',
];

export const SPRITES: Record<string, SpriteDef> = {
  player: {
    palette: PLAYER_PALETTE,
    frames: [PLAYER_IDLE, PLAYER_WALK1, PLAYER_WALK2, PLAYER_JUMP, PLAYER_ATTACK],
  },
  grunt: {
    palette: GRUNT_PALETTE,
    frames: [GRUNT_WALK1, GRUNT_WALK2],
  },
  berserker: {
    palette: BERSERKER_PALETTE,
    frames: [BERSERKER_WALK1, BERSERKER_WALK2],
  },
  brute: {
    palette: BRUTE_PALETTE,
    frames: [BRUTE_WALK1, BRUTE_WALK2],
  },
};

export const PLAYER_FRAME = {
  idle: 0,
  walk1: 1,
  walk2: 2,
  jump: 3,
  attack: 4,
} as const;

export const MONSTER_FRAME = {
  walk1: 0,
  walk2: 1,
} as const;

/** 精灵相对碰撞盒的绘制参数（scale 为整数倍放大，保持像素锐利） */
export const SPRITE_META: Record<string, { scale: number; offsetX: number; offsetY: number }> = {
  player: { scale: 3, offsetX: -4, offsetY: -2 },
  grunt: { scale: 3, offsetX: -3, offsetY: 0 },
  berserker: { scale: 3, offsetX: -2, offsetY: 0 },
  brute: { scale: 4, offsetX: -3, offsetY: -6 },
};

/**
 * 精灵缓存：把像素图烘焙成离屏 canvas（含着色版本），只创建一次。
 * 缓存大小只和精灵种类/帧数/着色种类有关，与游玩时长无关。
 */
export class SpriteCache {
  private cache = new Map<string, HTMLCanvasElement>();

  private bake(name: string, frame: number, tint: string | null): HTMLCanvasElement | null {
    const def = SPRITES[name];
    if (!def) return null;
    const rows = def.frames[frame];
    if (!rows) return null;

    const w = rows[0].length;
    const h = rows.length;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < h; y += 1) {
      const row = rows[y];
      for (let x = 0; x < row.length; x += 1) {
        const code = row[x];
        if (code === '.' || code === ' ') continue;
        const color = def.palette[code];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    return canvas;
  }

  get(name: string, frame: number, tint: string | null = null): HTMLCanvasElement | null {
    const key = `${name}|${frame}|${tint ?? '-'}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const baked = this.bake(name, frame, tint);
    if (baked) this.cache.set(key, baked);
    return baked;
  }

  dispose(): void {
    // 主动断开 canvas 引用，方便 GC
    this.cache.forEach((canvas) => {
      canvas.width = 1;
      canvas.height = 1;
    });
    this.cache.clear();
  }
}
