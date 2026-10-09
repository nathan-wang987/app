import { clamp, rectCenterX, rectCenterY } from '../engine/math';
import { SKILL_TUNING, WORLD } from '../game/constants';
import type { Platform } from '../game/level';
import type { Monster } from '../game/monsters';
import type { Player } from '../game/player';
import type { World } from '../game/world';
import { drawFog, drawHills, drawMoon, drawMountains, drawSky, drawStars } from './background';
import { drawPixelRect, drawPixelText, hash2d } from './pixel';
import { MONSTER_FRAME, PLAYER_FRAME, SPRITE_META, SpriteCache } from './sprites';

const PLATFORM_STYLE: Record<Platform['kind'], { fill: string; top: string; shade: string; line: string }> = {
  ground: { fill: '#2e2b3f', top: '#3f6b45', shade: '#242236', line: '#1b1929' },
  rock: { fill: '#3f3f5e', top: '#5f5f88', shade: '#33334d', line: '#28283c' },
  crate: { fill: '#6f5133', top: '#9c7448', shade: '#573f27', line: '#402d1b' },
};

const TINT_TELEGRAPH = 'rgba(255, 60, 60, 0.45)';
const TINT_HIT = 'rgba(255, 255, 255, 0.75)';
const TINT_DASH = 'rgba(120, 200, 255, 0.35)';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = new SpriteCache();
  private dpr = 1;
  private width = 960;
  private height = 540;
  private zoom = 1;
  private vignette: CanvasGradient | null = null;
  private bgTime = 0;
  /** 复用缓冲区，避免每帧新建数组 */
  private drawOrder: number[] = [];
  private readonly drawParticle = (p: { x: number; y: number; life: number; maxLife: number; size: number; color: string; shrink: boolean }) => {
    const ctx = this.ctx;
    const ratio = p.maxLife > 0 ? p.life / p.maxLife : 0;
    const size = p.shrink ? Math.max(1, Math.round(p.size * ratio + 0.6)) : p.size;
    ctx.globalAlpha = clamp(ratio * 1.6, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    ctx.globalAlpha = 1;
  };
  private readonly drawText = (t: { x: number; y: number; life: number; maxLife: number; text: string; color: string; size: number }) => {
    const ratio = t.maxLife > 0 ? t.life / t.maxLife : 0;
    this.ctx.globalAlpha = clamp(ratio * 1.8, 0, 1);
    drawPixelText(this.ctx, t.text, t.x, t.y, t.color, t.size);
    this.ctx.globalAlpha = 1;
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
    this.ctx = ctx;
  }

  /** 根据容器尺寸与设备像素比调整后备缓冲 */
  resize(cssWidth: number, cssHeight: number, dpr: number, zoom = 1): void {
    const width = Math.max(320, Math.round(cssWidth));
    const height = Math.max(240, Math.round(cssHeight));
    const ratio = clamp(dpr || 1, 1, 2.5);
    this.width = width;
    this.height = height;
    this.dpr = ratio;
    this.zoom = clamp(zoom, 0.5, 3);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.ctx.imageSmoothingEnabled = false;

    const gradient = this.ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height * 0.95);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(4, 6, 14, 0.55)');
    this.vignette = gradient;
  }

  render(world: World, dt: number): void {
    const ctx = this.ctx;
    this.bgTime += dt;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const shake = world.shake;
    const shakeX = shake > 0 ? (Math.random() * 2 - 1) * shake : 0;
    const shakeY = shake > 0 ? (Math.random() * 2 - 1) * shake * 0.6 : 0;
    const camX = world.cameraX + shakeX;
    const camY = world.cameraY + shakeY;

    drawSky(ctx, this.width, this.height);
    drawStars(ctx, camX * this.zoom, this.bgTime);
    drawMoon(ctx, camX * this.zoom, this.width);

    const groundScreenY = (WORLD.groundTop - camY) * this.zoom;
    drawMountains(ctx, camX, this.width, this.height);
    drawHills(ctx, camX, this.width, this.height);
    drawFog(ctx, this.width, this.height, camY, groundScreenY);

    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-Math.round(camX), -Math.round(camY));
    this.drawPlatforms(world);
    this.drawEntities(world);
    this.drawEffects(world);
    ctx.restore();

    if (this.vignette) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  // ------------------------------------------------------------------ 地形

  private drawPlatforms(world: World): void {
    const platforms = world.arena.platforms;
    for (let i = 0; i < platforms.length; i += 1) {
      const platform = platforms[i];
      if (platform.x + platform.w < world.cameraX - 80 || platform.x > world.cameraX + world.viewW + 80) continue;
      this.drawPlatform(platform);
    }
  }

  private drawPlatform(platform: Platform): void {
    const ctx = this.ctx;
    const style = PLATFORM_STYLE[platform.kind];
    const x = Math.round(platform.x);
    const y = Math.round(platform.y);
    const w = Math.round(platform.w);
    const h = Math.round(platform.h);

    ctx.fillStyle = style.fill;
    ctx.fillRect(x, y, w, h);

    // 顶面亮边 + 草皮
    if (platform.kind === 'ground') {
      ctx.fillStyle = '#2a4a34';
      ctx.fillRect(x, y + 6, w, 4);
      ctx.fillStyle = style.top;
      ctx.fillRect(x, y, w, 8);
      // 草叶
      ctx.fillStyle = '#4f8451';
      const step = 12;
      for (let gx = x - (x % step); gx < x + w; gx += step) {
        const noise = hash2d(Math.floor(gx / step), 7);
        if (noise < 0.45) continue;
        ctx.fillRect(gx + 2, y - 4, 3, 5);
        ctx.fillRect(gx + 6, y - 3, 3, 4);
      }
    } else {
      ctx.fillStyle = style.top;
      ctx.fillRect(x, y, w, 4);
      ctx.fillStyle = style.shade;
      ctx.fillRect(x, y + h - 4, w, 4);
    }

    // 砖块纹路 / 木箱纹路（用确定性噪声，避免每帧闪动）
    ctx.fillStyle = style.line;
    if (platform.kind === 'crate') {
      ctx.fillRect(x, y, w, 2);
      ctx.fillRect(x + 2, y + 4, w - 4, 2);
      for (let bx = x + 8; bx < x + w - 4; bx += 16) ctx.fillRect(bx, y + 8, 2, h - 12);
      ctx.fillRect(x + 3, y + h - 5, w - 6, 2);
    } else if (platform.kind === 'rock') {
      const brickH = 16;
      const brickW = 32;
      for (let by = y + 10; by < y + h - 3; by += brickH) {
        ctx.fillRect(x, by, w, 2);
      }
      const rowOffset = Math.floor((y + 10) / brickH) % 2 === 0 ? 0 : brickW / 2;
      for (let by = y + 10; by < y + h - 3; by += brickH) {
        for (let bx = x + rowOffset; bx < x + w; bx += brickW) {
          ctx.fillRect(bx, by, 2, brickH - 2);
        }
      }
    } else {
      // 地面：土壤分层 + 小石子，比砖块更像泥地
      ctx.fillStyle = '#221f31';
      for (let by = y + 14; by < y + h - 6; by += 18) {
        ctx.fillRect(x, by, w, 3);
      }
      ctx.fillStyle = '#3a364d';
      for (let by = y + 30; by < y + h - 10; by += 34) {
        for (let bx = x + (by % 3 === 0 ? 10 : 40); bx < x + w - 12; bx += 96) {
          if (hash2d(bx, by) > 0.55) ctx.fillRect(bx, by, 22, 8);
        }
      }
    }

    // 土壤杂点
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    const cell = 18;
    for (let px = Math.ceil(x / cell) * cell; px < x + w; px += cell) {
      for (let py = Math.ceil((y + 12) / cell) * cell; py < y + h - 4; py += cell) {
        if (hash2d(px / cell, py / cell) > 0.72) ctx.fillRect(px, py, 3, 3);
      }
    }
  }

  // ------------------------------------------------------------------ 实体

  private drawEntities(world: World): void {
    const monsters = world.monsters;
    const order = this.drawOrder;
    order.length = monsters.length;
    for (let i = 0; i < monsters.length; i += 1) order[i] = i;
    // 插入排序：按 y 排序，数量很少，且复用数组不产生垃圾
    for (let i = 1; i < order.length; i += 1) {
      const value = order[i];
      const key = monsters[value].y;
      let j = i - 1;
      while (j >= 0 && monsters[order[j]].y > key) {
        order[j + 1] = order[j];
        j -= 1;
      }
      order[j + 1] = value;
    }

    const player = world.player;
    let playerDrawn = false;
    for (let i = 0; i < order.length; i += 1) {
      const monster = monsters[order[i]];
      if (!playerDrawn && monster.y >= player.y) {
        this.drawPlayer(world);
        playerDrawn = true;
      }
      this.drawMonster(monster);
    }
    if (!playerDrawn) this.drawPlayer(world);
  }

  private drawPlayer(world: World): void {
    const ctx = this.ctx;
    const player = world.player;
    const meta = SPRITE_META.player;

    // 冲刺残影
    if (player.action === 'dash') {
      const canvas = this.sprites.get('player', PLAYER_FRAME.attack, TINT_DASH);
      if (canvas) {
        for (let i = 1; i <= 3; i += 1) {
          ctx.globalAlpha = 0.22 / i;
          const offset = -player.dashDir * i * 22;
          ctx.drawImage(
            canvas,
            Math.round(player.x + meta.offsetX + offset),
            Math.round(player.y + meta.offsetY),
            canvas.width * meta.scale,
            canvas.height * meta.scale,
          );
        }
        ctx.globalAlpha = 1;
      }
    }

    let frame: number = PLAYER_FRAME.idle;
    if (player.action === 'attack') frame = PLAYER_FRAME.attack;
    else if (!player.onGround) frame = PLAYER_FRAME.jump;
    else if (Math.abs(player.vx) > 24) frame = Math.floor(player.animTime * 9) % 2 === 0 ? PLAYER_FRAME.walk1 : PLAYER_FRAME.walk2;

    let tint: string | null = null;
    if (player.hurtFlash > 0) tint = 'rgba(255, 90, 90, 0.55)';
    else if (player.action === 'dash') tint = TINT_DASH;
    else if (player.action === 'spin') tint = 'rgba(110, 231, 183, 0.28)';

    const canvas = this.sprites.get('player', frame, tint);
    const blink = player.invuln > 0 && player.action !== 'dash' && Math.floor(player.invuln * 20) % 2 === 1;
    if (canvas) {
      ctx.globalAlpha = blink ? 0.45 : 1;
      this.drawSprite(canvas, player, 'player');
      ctx.globalAlpha = 1;
    }

    if (player.healTimer > 0) {
      const ratio = player.healTimer / SKILL_TUNING.heal.castTime;
      ctx.strokeStyle = `rgba(110, 231, 183, ${(ratio * 0.9).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rectCenterX(player), rectCenterY(player), 34 + (1 - ratio) * 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawPlayerAttackVisual(player);
  }

  private drawPlayerAttackVisual(player: Player): void {
    const ctx = this.ctx;
    const cx = rectCenterX(player);
    const cy = rectCenterY(player);

    if (player.action === 'attack') {
      const elapsed = player.actionDuration - player.actionTimer;
      const ratio = clamp(elapsed / Math.max(player.actionDuration, 0.001), 0, 1);
      const dir = player.facing;
      ctx.save();
      ctx.globalAlpha = clamp(1 - ratio, 0, 1) * 0.95;
      ctx.fillStyle = '#e6edf7';
      const steps = 8;
      for (let i = 0; i < steps; i += 1) {
        const t = i / (steps - 1);
        const angle = ((-70 + t * 130) * Math.PI) / 180;
        const radius = 30 + t * 18;
        const x = cx + dir * Math.cos(angle) * radius + dir * 8;
        const y = cy - 4 + Math.sin(angle) * radius;
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
      ctx.fillStyle = 'rgba(255, 209, 102, 0.75)';
      for (let i = 0; i < steps; i += 1) {
        const t = i / (steps - 1);
        const angle = ((-70 + t * 130) * Math.PI) / 180;
        const radius = 40 + t * 18;
        const x = cx + dir * Math.cos(angle) * radius + dir * 8;
        const y = cy - 4 + Math.sin(angle) * radius;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      }
      ctx.restore();
    }

    if (player.action === 'spin') {
      const elapsed = player.actionDuration - player.actionTimer;
      const ratio = clamp(elapsed / Math.max(player.actionDuration, 0.001), 0, 1);
      const radius = SKILL_TUNING.spin.radius * player.stats.spinRadiusMul;
      const sweep = ratio * Math.PI * 2;
      ctx.save();
      ctx.globalAlpha = clamp(1 - ratio * 0.6, 0.2, 1);
      ctx.fillStyle = '#a7f3d0';
      const steps = 22;
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * sweep - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.55;
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
      ctx.strokeStyle = 'rgba(110, 231, 183, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawMonster(monster: Monster): void {
    const ctx = this.ctx;
    const meta = SPRITE_META[monster.def.sprite];
    if (!meta) return;

    const walking = Math.abs(monster.vx) > 8;
    const frame = walking && Math.floor(monster.animTime * 7) % 2 === 0 ? MONSTER_FRAME.walk2 : MONSTER_FRAME.walk1;

    let tint: string | null = null;
    if (monster.hitFlash > 0) tint = TINT_HIT;
    else if (monster.ai === 'windup' && monster.kind === 'berserker') tint = TINT_TELEGRAPH;

    const shakeOffset = monster.ai === 'windup' ? Math.round(Math.sin(monster.animTime * 70) * (monster.def.alertLevel >= 2 ? 2 : 1)) : 0;
    const canvas = this.sprites.get(monster.def.sprite, frame, tint);
    if (canvas) {
      ctx.drawImage(
        canvas,
        Math.round(monster.x + meta.offsetX + shakeOffset),
        Math.round(monster.y + meta.offsetY),
        canvas.width * meta.scale,
        canvas.height * meta.scale,
      );
    }

    this.drawMonsterHealthBar(monster);
    this.drawMonsterTelegraph(monster);
  }

  private drawMonsterHealthBar(monster: Monster): void {
    if (monster.hp >= monster.maxHp && monster.kind !== 'brute') return;
    const ctx = this.ctx;
    const w = Math.max(24, Math.round(monster.w));
    const x = Math.round(rectCenterX(monster) - w / 2);
    const y = Math.round(monster.y - 12);
    const ratio = clamp(monster.hp / monster.maxHp, 0, 1);
    drawPixelRect(ctx, x, y, w, 5, '#241f2e', '#0f0d16');
    ctx.fillStyle = monster.kind === 'brute' ? '#c084fc' : monster.kind === 'berserker' ? '#f87171' : '#86efac';
    ctx.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * ratio)), 3);
  }

  private drawMonsterTelegraph(monster: Monster): void {
    if (monster.ai !== 'windup') return;
    const ctx = this.ctx;
    const level = monster.def.alertLevel;
    const color = level >= 3 ? '#ff4d4d' : level === 2 ? '#ffa94d' : '#ffe066';
    const size = level >= 3 ? 26 : level === 2 ? 22 : 16;
    const bob = Math.sin(monster.animTime * 16) * 3;
    drawPixelText(ctx, '!', rectCenterX(monster), monster.y - 24 + bob, color, size);

    if (level >= 2) {
      // 预告攻击范围（让玩家能预判）
      const hb = monster.def.hitbox;
      const x = monster.facing === 1 ? monster.x + hb.x : monster.x + monster.w - hb.x - hb.w;
      ctx.save();
      ctx.globalAlpha = 0.18 + monster.telegraph * 0.25;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(monster.y + hb.y), Math.round(hb.w), Math.round(hb.h));
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ 特效

  private drawEffects(world: World): void {
    world.fx.particles.forEachActive(this.drawParticle);
    world.fx.texts.forEachActive(this.drawText);
  }

  private drawSprite(canvas: HTMLCanvasElement, entity: { x: number; y: number; facing?: number }, spriteName: string, flipOverride?: boolean): void {
    const meta = SPRITE_META[spriteName];
    const ctx = this.ctx;
    const flip = flipOverride ?? entity.facing === -1;
    const width = canvas.width * meta.scale;
    const height = canvas.height * meta.scale;
    const x = Math.round(entity.x + meta.offsetX);
    const y = Math.round(entity.y + meta.offsetY);

    if (!flip) {
      ctx.drawImage(canvas, x, y, width, height);
      return;
    }
    ctx.save();
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0, width, height);
    ctx.restore();
  }

  dispose(): void {
    this.sprites.dispose();
    this.drawOrder.length = 0;
    this.vignette = null;
  }
}

export function viewportSizeOf(canvas: HTMLCanvasElement): { w: number; h: number } {
  const rect = canvas.getBoundingClientRect();
  return { w: Math.max(320, rect.width), h: Math.max(240, rect.height) };
}
