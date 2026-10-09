import { ObjectPool } from '../engine/pool';
import {
  MAX_FLOATING_TEXTS,
  MAX_PARTICLES,
  MAX_SLASHES,
  PARTICLE_PREALLOCATE
} from './constants';
import type { FloatingText, Particle, Slash } from './types';

const createParticle = (): Particle => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 1,
  size: 1,
  gravity: 0,
  color: '#fff'
});

const createText = (): FloatingText => ({
  active: false,
  x: 0,
  y: 0,
  vy: 0,
  life: 0,
  maxLife: 1,
  text: '',
  color: '#fff',
  outline: '#000',
  size: 6
});

const createSlash = (): Slash => ({
  active: false,
  x: 0,
  y: 0,
  radius: 0,
  arcStart: 0,
  arcEnd: 0,
  life: 0,
  maxLife: 1,
  color: '#fff',
  thickness: 2,
  spin: false
});

/**
 * 视觉特效管理器：所有特效都走固定容量对象池，
 * 池满时直接丢弃新的装饰性特效，保证内存与帧耗时收敛（需求 9）。
 */
export class Effects {
  private readonly particles = new ObjectPool<Particle>(
    createParticle,
    (p) => {
      p.vx = 0;
      p.vy = 0;
      p.gravity = 0;
      p.life = 0;
      p.maxLife = 1;
      p.size = 1;
      p.color = '#fff';
      p.x = 0;
      p.y = 0;
    },
    MAX_PARTICLES,
    PARTICLE_PREALLOCATE
  );

  private readonly texts = new ObjectPool<FloatingText>(
    createText,
    (t) => {
      t.vy = -26;
      t.life = 0;
      t.maxLife = 0.8;
      t.text = '';
      t.size = 6;
    },
    MAX_FLOATING_TEXTS,
    16
  );

  private readonly slashes = new ObjectPool<Slash>(
    createSlash,
    (s) => {
      s.life = 0;
      s.maxLife = 0.22;
      s.thickness = 2;
      s.spin = false;
    },
    MAX_SLASHES,
    8
  );

  burst(
    x: number,
    y: number,
    count: number,
    color: string,
    options: { speed?: number; spread?: number; size?: number; gravity?: number; life?: number } = {}
  ): void {
    const speed = options.speed ?? 60;
    const spread = options.spread ?? Math.PI * 2;
    const size = options.size ?? 2;
    const gravity = options.gravity ?? 180;
    const life = options.life ?? 0.45;
    for (let i = 0; i < count; i += 1) {
      const p = this.particles.acquire();
      if (!p) return;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const power = speed * (0.5 + Math.random() * 0.5);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * power * (spread / (Math.PI * 2));
      p.vy = Math.sin(angle) * power * (spread / (Math.PI * 2)) - speed * 0.2;
      p.life = life * (0.6 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.size = Math.max(1, Math.round(size * (0.7 + Math.random() * 0.6)));
      p.gravity = gravity;
      p.color = color;
    }
  }

  spray(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    count: number,
    color: string,
    options: { speed?: number; size?: number; life?: number; gravity?: number } = {}
  ): void {
    const speed = options.speed ?? 90;
    for (let i = 0; i < count; i += 1) {
      const p = this.particles.acquire();
      if (!p) return;
      const jitter = (Math.random() - 0.5) * 0.9;
      const power = speed * (0.5 + Math.random() * 0.8);
      p.x = x;
      p.y = y;
      p.vx = (dirX + jitter) * power;
      p.vy = (dirY + jitter * 0.5) * power;
      p.life = (options.life ?? 0.4) * (0.6 + Math.random() * 0.7);
      p.maxLife = p.life;
      p.size = options.size ?? 2;
      p.gravity = options.gravity ?? 160;
      p.color = color;
    }
  }

  ring(
    x: number,
    y: number,
    count: number,
    radius: number,
    color: string,
    upwardBias = 0.35
  ): void {
    for (let i = 0; i < count; i += 1) {
      const p = this.particles.acquire();
      if (!p) return;
      const angle = (Math.PI * 2 * i) / count;
      p.x = x + Math.cos(angle) * radius;
      p.y = y + Math.sin(angle) * radius * 0.6;
      p.vx = Math.cos(angle) * 70;
      p.vy = Math.sin(angle) * 40 - upwardBias * 90;
      p.life = 0.36 + Math.random() * 0.2;
      p.maxLife = p.life;
      p.size = 2;
      p.gravity = 200;
      p.color = color;
    }
  }

  text(x: number, y: number, text: string, color: string, size = 6): void {
    const t = this.texts.acquire();
    if (!t) return;
    t.x = x;
    t.y = y;
    t.text = text;
    t.color = color;
    t.outline = '#14121c';
    t.size = size;
    t.life = 0.75;
    t.maxLife = 0.75;
    t.vy = -30;
  }

  slash(
    x: number,
    y: number,
    radius: number,
    arcStart: number,
    arcEnd: number,
    color: string,
    thickness = 2,
    spin = false,
    life = 0.2
  ): void {
    const s = this.slashes.acquire();
    if (!s) return;
    s.x = x;
    s.y = y;
    s.radius = radius;
    s.arcStart = arcStart;
    s.arcEnd = arcEnd;
    s.color = color;
    s.thickness = thickness;
    s.spin = spin;
    s.life = life;
    s.maxLife = life;
  }

  update(dt: number): void {
    this.particles.forEachActive((p) => {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.release(p);
    });
    this.texts.forEachActive((t) => {
      t.y += t.vy * dt;
      t.vy += 34 * dt;
      t.life -= dt;
      if (t.life <= 0) this.texts.release(t);
    });
    this.slashes.forEachActive((s) => {
      s.life -= dt;
      if (s.life <= 0) this.slashes.release(s);
    });
  }

  eachParticle(fn: (p: Particle) => void): void {
    this.particles.forEachActive(fn);
  }

  eachText(fn: (t: FloatingText) => void): void {
    this.texts.forEachActive(fn);
  }

  eachSlash(fn: (s: Slash) => void): void {
    this.slashes.forEachActive(fn);
  }

  get stats(): { particles: number; texts: number; slashes: number } {
    return {
      particles: this.particles.live,
      texts: this.texts.live,
      slashes: this.slashes.live
    };
  }

  /** 让所有对象立即失效并回到最小规模。 */
  clear(): void {
    this.particles.reset(PARTICLE_PREALLOCATE);
    this.texts.reset(16);
    this.slashes.reset(8);
  }
}
