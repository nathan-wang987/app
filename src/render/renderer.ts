import { VIEW_H, VIEW_W, ENEMY_CONFIGS, WORLD_WIDTH } from '../game/constants';
import { SOLIDS } from '../game/arena';
import { Background } from './background';
import { Camera } from './camera';
import { frameCount, getSprite, warmupSprites, type Sprite, type SpriteAnim } from './sprites';
import type { Effects } from '../game/effects';
import type { Enemy, EnemyKind, GamePhase, Player } from '../game/types';

export interface RenderView {
  player: Player;
  enemies: Enemy[];
  effects: Effects;
  phase: GamePhase;
  camera: Camera;
}

/**
 * Canvas 渲染层：只读取世界状态，不修改任何游戏数据。
 * 内部一次性 translate 到世界坐标，所有绘制使用整数坐标，保证像素风干净。
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background = new Background();
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('无法获取 Canvas 2D 上下文');
    this.ctx = ctx;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx.imageSmoothingEnabled = false;
    warmupSprites();
  }

  render(view: RenderView, dt: number, alpha: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const camera = view.camera;
    const player = view.player;

    camera.follow(player.x + player.w / 2, player.y + player.h / 2, player.vx, dt);
    camera.update(dt);
    const camX = camera.renderX;
    const camY = camera.renderY;

    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    this.background.draw(ctx, camX, camY);

    ctx.save();
    ctx.translate(-camX, -camY);

    this.drawSolids();
    this.drawEnemies(view.enemies);
    this.drawPlayer(player);
    this.drawSlashes(view.effects);
    this.drawParticles(view.effects);
    this.drawTexts(view.effects);

    ctx.restore();

    this.drawVignette(player);
    void alpha;
  }

  /** 平台与墙体：只画浮空平台与侧墙，地面由背景层负责。 */
  private drawSolids(): void {
    const ctx = this.ctx;
    for (let i = 1; i < SOLIDS.length; i += 1) {
      const s = SOLIDS[i];
      if (s.h > 100) {
        // 侧墙：画成石柱
        ctx.fillStyle = '#453f5e';
        ctx.fillRect(Math.round(s.x) + 2, Math.round(s.y), Math.round(s.w) - 4, Math.round(s.h));
        ctx.fillStyle = '#5b5379';
        for (let y = s.y + 8; y < s.y + s.h; y += 16) {
          ctx.fillRect(Math.round(s.x) + 2, Math.round(y), Math.round(s.w) - 4, 2);
        }
        continue;
      }
      ctx.fillStyle = '#3a3450';
      ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.round(s.w), Math.round(s.h));
      ctx.fillStyle = '#8f87b5';
      ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.round(s.w), 2);
      ctx.fillStyle = '#6a628c';
      for (let x = s.x; x < s.x + s.w; x += 8) {
        ctx.fillRect(Math.round(x), Math.round(s.y + 2), 1, Math.round(s.h - 2));
      }
    }
  }

  private drawEnemies(enemies: Enemy[]): void {
    const ctx = this.ctx;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy.active) continue;
      const { anim, frame } = pickEnemyAnim(enemy);
      const sprite = getSprite(enemy.kind, anim, frame, enemy.hitFlash > 0.07);

      // 影子
      this.drawShadow(enemy.x + enemy.w / 2, enemy.y + enemy.h, enemy.w * 0.9, 0.28);

      // 前摇提示：地面脉冲圈 + 感叹号 + 攻击范围预警
      if (anim === 'windup') {
        const t = Math.min(1, enemy.stateTime / Math.max(0.01, enemy.windup));
        this.drawTelegraph(enemy, t);
      }

      const dying = enemy.state === 'dead';
      const fade = dying ? Math.max(0, 1 - enemy.stateTime / 0.45) : 1;
      const spawnAlpha = enemy.spawnGrace > 0 ? 0.45 + Math.sin(enemy.animTime * 30) * 0.25 : 1;

      this.drawSprite(
        sprite,
        enemy.x + enemy.w / 2,
        enemy.y + enemy.h,
        enemy.facing === -1,
        Math.max(0, fade * spawnAlpha),
        dying ? enemy.stateTime / 0.45 : 0
      );

      // 血条（只有受伤后才显示，减少画面噪音）
      if (!dying && enemy.hp < enemy.maxHp) {
        const width = Math.max(12, enemy.w + 4);
        const x = Math.round(enemy.x + enemy.w / 2 - width / 2);
        const y = Math.round(enemy.y - 7);
        ctx.fillStyle = '#1a1726';
        ctx.fillRect(x - 1, y - 1, width + 2, 5);
        ctx.fillStyle = '#4a2230';
        ctx.fillRect(x, y, width, 3);
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.fillStyle = ratio > 0.5 ? '#71dd8b' : ratio > 0.25 ? '#ffd479' : '#ff6b6b';
        ctx.fillRect(x, y, Math.round(width * ratio), 3);
      }
    }
  }

  private drawTelegraph(enemy: Enemy, t: number): void {
    const ctx = this.ctx;
    const config = ENEMY_CONFIGS[enemy.kind];
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h;
    const color = enemy.kind === 'glass' ? '#ffb03a' : enemy.kind === 'tank' ? '#c9e07a' : '#ff7b7b';

    ctx.save();
    ctx.globalAlpha = 0.35 + 0.4 * t;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const radius = 6 + t * 10;
    ctx.beginPath();
    ctx.arc(Math.round(cx - enemy.w / 2), Math.round(cy - 3), radius, 0, Math.PI * 2);
    ctx.stroke();

    // 攻击范围预警（越接近出手越亮）
    ctx.globalAlpha = 0.12 + 0.25 * t;
    ctx.fillStyle = color;
    const rangeX = enemy.facing === 1 ? enemy.x + enemy.w - 2 : enemy.x - config.attackRange;
    ctx.fillRect(Math.round(rangeX), Math.round(enemy.y - 1), Math.round(config.attackRange + 2), Math.round(enemy.h + 2));

    // 感叹号
    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 12));
    ctx.fillStyle = color;
    const markX = Math.round(cx);
    const markY = Math.round(enemy.y - 16 + Math.sin(t * 8) * 1);
    ctx.fillRect(markX, markY, 1, 5);
    ctx.fillRect(markX, markY + 6, 1, 1);
    ctx.restore();
  }

  private drawPlayer(player: Player): void {
    const ctx = this.ctx;
    const feetX = player.x + player.w / 2;
    const feetY = player.y + player.h;

    this.drawShadow(feetX, feetY, player.w, 0.32);

    // 冲锋残影
    if (player.state === 'dash') {
      for (let i = 1; i <= 2; i += 1) {
        ctx.save();
        ctx.globalAlpha = 0.18 * (3 - i);
        const sprite = getSprite('player', 'dash', 0, false);
        this.drawSprite(sprite, feetX - player.facing * i * 7, feetY, player.facing === -1, 0.4, 0);
        ctx.restore();
      }
    }

    const { anim, frame } = pickPlayerAnim(player);
    const sprite = getSprite('player', anim, frame, player.hitFlash > 0.08);
    const blink = player.invuln > 0 && player.state !== 'dash' && Math.floor(player.invuln * 20) % 2 === 0;
    const alpha = blink ? 0.45 : 1;
    this.drawSprite(
      sprite,
      feetX,
      feetY,
      player.facing === -1,
      alpha,
      player.state === 'dead' ? Math.min(1, player.stateTime / 0.7) : 0
    );

    // 冲锋无敌时给一圈护盾提示
    if (player.state === 'dash') {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffd479';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(feetX), Math.round(player.y + player.h / 2), 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawShadow(x: number, y: number, width: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0d0b16';
    const w = Math.max(6, width);
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - 2), Math.round(w), 2);
    ctx.fillRect(Math.round(x - w / 2 + 2), Math.round(y), Math.round(w - 4), 1);
    ctx.restore();
  }

  private drawSprite(
    sprite: Sprite,
    feetX: number,
    feetY: number,
    flip: boolean,
    alpha: number,
    deathProgress: number
  ): void {
    const ctx = this.ctx;
    const dying = deathProgress > 0;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const x = Math.round(feetX);
    const y = Math.round(feetY);
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    if (dying) {
      const squash = 1 - deathProgress * 0.55;
      ctx.scale(1 + deathProgress * 0.25, squash);
      ctx.translate(0, deathProgress * 4);
    }
    ctx.drawImage(sprite.canvas, -sprite.anchorX, -sprite.anchorY);
    ctx.restore();
  }

  private drawSlashes(effects: Effects): void {
    const ctx = this.ctx;
    effects.eachSlash((slash) => {
      const t = slash.life / slash.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, t);
      ctx.strokeStyle = slash.color;
      ctx.lineWidth = slash.thickness;
      ctx.beginPath();
      if (slash.spin) {
        const progress = 1 - t;
        const start = slash.arcStart + progress * Math.PI * 2;
        ctx.arc(Math.round(slash.x), Math.round(slash.y), slash.radius * (0.7 + progress * 0.3), start, start + Math.PI * 1.1);
      } else {
        ctx.arc(Math.round(slash.x), Math.round(slash.y), slash.radius, slash.arcStart, slash.arcEnd);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  private drawParticles(effects: Effects): void {
    const ctx = this.ctx;
    effects.eachParticle((p) => {
      const t = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  private drawTexts(effects: Effects): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    effects.eachText((t) => {
      const ratio = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = Math.min(1, ratio * 1.6);
      ctx.font = `${t.size}px "Courier New", "MS Gothic", monospace`;
      ctx.lineWidth = 2;
      ctx.strokeStyle = t.outline;
      ctx.strokeText(t.text, Math.round(t.x), Math.round(t.y) - (1 - ratio) * 8);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, Math.round(t.x), Math.round(t.y) - (1 - ratio) * 8);
    });
    ctx.globalAlpha = 1;
  }

  /** 低血量红色暗角，纯 UI 反馈，不参与游戏逻辑。 */
  private drawVignette(player: Player): void {
    const ratio = player.hp / Math.max(1, player.maxHp);
    if (ratio > 0.35) return;
    const ctx = this.ctx;
    const strength = (0.35 - ratio) / 0.35;
    ctx.save();
    ctx.globalAlpha = 0.25 + strength * 0.35;
    ctx.fillStyle = '#5a0d1c';
    const band = 10 + strength * 14;
    ctx.fillRect(0, 0, VIEW_W, band);
    ctx.fillRect(0, VIEW_H - band, VIEW_W, band);
    ctx.fillRect(0, 0, band, VIEW_H);
    ctx.fillRect(VIEW_W - band, 0, band, VIEW_H);
    ctx.restore();
  }

  dispose(): void {
    this.disposed = true;
    this.background.dispose();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

const WALK_FPS = 9;

export function pickPlayerAnim(player: Player): { anim: SpriteAnim; frame: number } {
  switch (player.state) {
    case 'attack': {
      const frame = player.stateTime < 0.07 ? 0 : player.stateTime < 0.15 ? 1 : 2;
      return { anim: 'attack', frame };
    }
    case 'spin':
      return { anim: 'spin', frame: Math.floor(player.actionProgress * frameCount('player', 'spin')) % frameCount('player', 'spin') };
    case 'dash':
      return { anim: 'dash', frame: 0 };
    case 'hurt':
      return { anim: 'hurt', frame: 0 };
    case 'dead':
      return { anim: 'dead', frame: 0 };
    case 'rise':
      return { anim: 'rise', frame: 0 };
    case 'fall':
      return { anim: 'fall', frame: 0 };
    case 'run':
      return { anim: 'run', frame: Math.floor(player.animTime * WALK_FPS * Math.min(1.6, Math.abs(player.vx) / 70)) };
    default:
      return { anim: 'idle', frame: Math.floor(player.animTime * 4) };
  }
}

export function pickEnemyAnim(enemy: Enemy): { anim: SpriteAnim; frame: number } {
  switch (enemy.state) {
    case 'dead':
      return { anim: 'dead', frame: 0 };
    case 'hurt':
      return { anim: 'hurt', frame: 0 };
    case 'windup': {
      const total = frameCount(enemy.kind, 'windup');
      const t = Math.min(0.999, enemy.stateTime / Math.max(0.01, enemy.windup));
      return { anim: 'windup', frame: Math.floor(t * total) };
    }
    case 'attack':
      return { anim: 'attack', frame: 0 };
    default: {
      const moving = Math.abs(enemy.vx) > 4;
      if (!moving) return { anim: 'idle', frame: Math.floor(enemy.animTime * 3) };
      const speedFactor = enemy.kind === 'tank' ? 0.5 : enemy.kind === 'glass' ? 1.4 : 1;
      return { anim: 'walk', frame: Math.floor(enemy.animTime * WALK_FPS * speedFactor) };
    }
  }
}

export { Camera };
export type { EnemyKind };
export const WORLD_LIMIT = WORLD_WIDTH;
