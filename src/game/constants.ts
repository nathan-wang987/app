/** 全局数值配置：便于统一调平衡。 */

/** 逻辑分辨率（像素风基础画布），渲染时按整数倍放大。 */
export const VIEW_W = 480;
export const VIEW_H = 270;

export const GRAVITY = 620;
export const MAX_FALL_SPEED = 420;

export const WORLD_WIDTH = 1920;
export const GROUND_Y = 236;
export const WALL_THICK = 16;

export const PLAYER_START_X = 200;
export const PLAYER_W = 14;
export const PLAYER_H = 20;
export const PLAYER_BASE_HP = 100;
export const PLAYER_BASE_ATTACK = 12;
export const PLAYER_BASE_SPEED = 108;
export const PLAYER_JUMP_SPEED = 208;
/** 跳起后还能再往上跳一次（需求 1）。 */
export const PLAYER_MAX_AIR_JUMPS = 1;

export const PLAYER_ATTACK_COOLDOWN = 0.32;
export const PLAYER_ATTACK_ACTIVE = 0.16;
export const PLAYER_ATTACK_RANGE = 22;
export const PLAYER_ATTACK_HEIGHT = 20;

export const PLAYER_INVULN_AFTER_HIT = 0.9;

export interface SkillConfig {
  id: 'spin' | 'dash' | 'heal';
  name: string;
  key: string;
  cooldown: number;
  duration: number;
  description: string;
  color: string;
}

export const SKILLS: Record<'spin' | 'dash' | 'heal', SkillConfig> = {
  spin: {
    id: 'spin',
    name: '旋风斩',
    key: 'K',
    cooldown: 6,
    duration: 0.45,
    description: '原地转一圈，砍到周围所有敌人',
    color: '#7fd4ff'
  },
  dash: {
    id: 'dash',
    name: '冲锋',
    key: 'L',
    cooldown: 5,
    duration: 0.26,
    description: '向前冲刺并撞飞敌人，冲刺期间无敌',
    color: '#ffd479'
  },
  heal: {
    id: 'heal',
    name: '治疗',
    key: 'U',
    cooldown: 14,
    duration: 0.5,
    description: '立刻回复最大生命的 40%',
    color: '#8bf59a'
  }
};

export const SPIN_RADIUS = 40;
export const SPIN_DAMAGE = 1.6; // 攻击力倍率
export const DASH_SPEED = 400;
export const DASH_DAMAGE = 1.8;
export const DASH_KNOCKBACK = 190;
export const HEAL_RATIO = 0.4;

export const MAX_PARTICLES = 320;
export const MAX_FLOATING_TEXTS = 48;
export const MAX_SLASHES = 24;
export const PARTICLE_PREALLOCATE = 96;

export const MAX_ALIVE_ENEMIES = 14;
export const ENEMY_STAGGER = 34; // 怪物之间保持的最小水平间隔

export interface EnemyConfig {
  kind: 'chaser' | 'glass' | 'tank';
  name: string;
  w: number;
  h: number;
  baseHp: number;
  hpPerWave: number;
  baseDamage: number;
  damagePerWave: number;
  speed: number;
  attackRange: number;
  attackCooldown: number;
  windup: number;
  /** 跳跃力度：决定能不能翻过低矮障碍/跳上平台，也让三种怪的体重感不同。 */
  hopPower: number;
  xp: number;
  knockbackResist: number;
  color: string;
}

export const ENEMY_CONFIGS: Record<'chaser' | 'glass' | 'tank', EnemyConfig> = {
  chaser: {
    kind: 'chaser',
    name: '赤牙小鬼',
    w: 14,
    h: 16,
    baseHp: 30,
    hpPerWave: 7,
    baseDamage: 8,
    damagePerWave: 1,
    speed: 52,
    attackRange: 16,
    attackCooldown: 1.3,
    windup: 0.24,
    hopPower: 340,
    xp: 10,
    knockbackResist: 0,
    color: '#ff6b6b'
  },
  glass: {
    kind: 'glass',
    name: '狂刃术士',
    w: 13,
    h: 17,
    baseHp: 16,
    hpPerWave: 4,
    baseDamage: 22,
    damagePerWave: 3,
    speed: 84,
    attackRange: 22,
    attackCooldown: 2,
    /** 前摇很长，颜色 + 动作都能一眼看出（需求 4）。 */
    windup: 0.62,
    hopPower: 320,
    xp: 16,
    knockbackResist: 0,
    color: '#ffc44d'
  },
  tank: {
    kind: 'tank',
    name: '石甲巨胖',
    w: 22,
    h: 20,
    baseHp: 110,
    hpPerWave: 26,
    baseDamage: 5,
    damagePerWave: 0.6,
    speed: 26,
    attackRange: 20,
    attackCooldown: 1.8,
    windup: 0.45,
    /** 又胖又重，跳不高，翻不过高台。 */
    hopPower: 205,
    xp: 26,
    knockbackResist: 0.72,
    color: '#8ab46a'
  }
};

/** 升级所需经验：线性增长，配合波次推进保持节奏。 */
export const xpForLevel = (level: number): number => 18 + (level - 1) * 14;

export const AUTOSAVE_INTERVAL = 4; // 秒
export const RESUME_PREP_TIME = 3; // 切回窗口后的准备时间（需求 8）
