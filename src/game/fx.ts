import { Pool } from '../engine/pool';
import type { Poolable } from '../engine/pool';
import { FX_LIMITS } from './constants';

export interface Particle extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  /** 是否随时间缩小 */
  shrink: boolean;
}

export interface FloatingText extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

function createParticle(): Particle {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 3,
    color: '#ffffff',
    gravity: 0,
    drag: 0,
    shrink: true,
  };
}

function createFloatingText(): FloatingText {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    text: '',
    color: '#ffffff',
    size: 12,
  };
}

/**
 * 特效系统：粒子 + 飘字，全部走对象池，池满即丢弃新特效。
 * 这样长时间游玩不会因为特效对象无限增长而变卡。
 */
export class FxSystem {
  readonly particles = new Pool<Particle>(createParticle, FX_LIMITS.particles);
  readonly texts = new Pool<FloatingText>(createFloatingText, FX_LIMITS.floatingTexts);

  spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    options: { speed?: number; spread?: number; size?: number; gravity?: number; life?: number } = {},
  ): void {
    const speed = options.speed ?? 220;
    const size = options.size ?? 3;
    const gravity = options.gravity ?? 620;
    const life = options.life ?? 0.45;
    for (let i = 0; i < count; i += 1) {
      const p = this.particles.spawn();
      if (!p) return;
      const angle = Math.random() * Math.PI * 2;
      const magnitude = speed * (0.35 + Math.random() * 0.65);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * magnitude;
      p.vy = Math.sin(angle) * magnitude - speed * 0.15;
      p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.size = size;
      p.color = color;
      p.gravity = gravity;
      p.drag = 1.6;
      p.shrink = true;
    }
  }

  spawnDust(x: number, y: number, count: number, color = '#8b7f6b'): void {
    for (let i = 0; i < count; i += 1) {
      const p = this.particles.spawn();
      if (!p) return;
      p.x = x + (Math.random() - 0.5) * 26;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 120;
      p.vy = -Math.random() * 60;
      p.maxLife = 0.35 + Math.random() * 0.25;
      p.life = p.maxLife;
      p.size = 2 + Math.floor(Math.random() * 2);
      p.color = color;
      p.gravity = 60;
      p.drag = 2.2;
      p.shrink = true;
    }
  }

  spawnText(x: number, y: number, text: string, color: string, size = 12): void {
    const t = this.texts.spawn();
    if (!t) return;
    t.x = x;
    t.y = y;
    t.vx = (Math.random() - 0.5) * 26;
    t.vy = -60;
    t.maxLife = 0.75;
    t.life = t.maxLife;
    t.text = text;
    t.color = color;
    t.size = size;
  }

  update(dt: number): void {
    this.particles.update((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy += p.gravity * dt;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return true;
    });

    this.texts.update((t) => {
      t.life -= dt;
      if (t.life <= 0) return false;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 90 * dt;
      return true;
    });
  }

  clear(): void {
    this.particles.clear();
    this.texts.clear();
  }

  dispose(): void {
    this.particles.dispose();
    this.texts.dispose();
  }
}
