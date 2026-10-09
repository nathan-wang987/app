import type { Rect, Vec2 } from '../engine/math';

export type EnemyKind = 'chaser' | 'glass' | 'tank';

export type SkillId = 'spin' | 'dash' | 'heal';

/**
 * 顶层状态机。
 * - menu：标题界面，世界不推进
 * - playing：正常战斗
 * - waveClear：本波清空后的结算，禁止攻击（需求 6）
 * - levelUp：升级选加成，未选完不继续（需求 5）
 * - gameOver：阵亡结算
 */
export type GamePhase = 'menu' | 'playing' | 'waveClear' | 'levelUp' | 'gameOver';

export type PlayerState =
  | 'idle'
  | 'run'
  | 'rise'
  | 'fall'
  | 'attack'
  | 'spin'
  | 'dash'
  | 'hurt'
  | 'dead';

export type EnemyState = 'idle' | 'walk' | 'windup' | 'attack' | 'hurt' | 'dead';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

export interface Player extends Body {
  state: PlayerState;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  attack: number;
  moveSpeed: number;
  jumpSpeed: number;
  airJumpsLeft: number;
  level: number;
  xp: number;
  xpToNext: number;
  /** 各技能剩余冷却（秒）。 */
  cooldowns: Record<SkillId, number>;
  cooldownMax: Record<SkillId, number>;
  stateTime: number;
  invuln: number;
  hitFlash: number;
  attackCooldown: number;
  /** 本次挥砍/技能已命中的敌人 id，避免同一次攻击重复结算。 */
  hitThisSwing: Set<number>;
  animTime: number;
  /** 当前动作的视觉进度 0..1。 */
  actionProgress: number;
}

export interface Enemy extends Body {
  id: number;
  active: boolean;
  kind: EnemyKind;
  state: EnemyState;
  stateTime: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  xp: number;
  attackRange: number;
  attackCooldown: number;
  /** 前摇时长：越大越容易躲开。 */
  windup: number;
  attackDone: boolean;
  knockbackResist: number;
  invuln: number;
  hitFlash: number;
  animTime: number;
  bobPhase: number;
  /** 出生短暂无敌 + 闪白，防止刚出现就被判定。 */
  spawnGrace: number;
  /** 翻越障碍的跳跃冷却，防止卡在低墙前反复起跳。 */
  hopCooldown: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  color: string;
}

export interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  outline: string;
  size: number;
}

/** 短命的挥砍弧线/冲击波视觉。 */
export interface Slash {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  arcStart: number;
  arcEnd: number;
  life: number;
  maxLife: number;
  color: string;
  thickness: number;
  spin: boolean;
}

export type UpgradeId =
  | 'vitality'
  | 'might'
  | 'agility'
  | 'swiftness'
  | 'reach'
  | 'vampire'
  | 'crit'
  | 'ironwill'
  | 'scholar'
  | 'dashMaster'
  | 'spinner'
  | 'mender';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  /** 可重复抽到的加成会累加等级。 */
  maxStacks: number;
  rarity: 'common' | 'rare' | 'epic';
  apply(mods: PlayerModifiers): void;
}

/** 升级带来的累积修正，独立于运行时实体，便于存档与结算。 */
export interface PlayerModifiers {
  bonusMaxHp: number;
  bonusAttack: number;
  bonusMoveSpeed: number;
  bonusReach: number;
  cooldownRate: number;
  lifesteal: number;
  critChance: number;
  damageReduction: number;
  xpGain: number;
  dashPower: number;
  spinPower: number;
  healPower: number;
  taken: Partial<Record<UpgradeId, number>>;
}

export interface EnemyHitbox extends Rect {
  damage: number;
  source: number;
  /** 命中后的击退强度。 */
  knockback: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  paused: boolean;
  autoPaused: boolean;
  resumeCountdown: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  wave: number;
  enemiesLeft: number;
  kills: number;
  totalKills: number;
  elapsed: number;
  cooldowns: Record<SkillId, { remaining: number; total: number }>;
  upgradeChoices: UpgradeId[];
  upgradeLabels: { id: UpgradeId; name: string; description: string; rarity: string }[];
  waveSummary: { wave: number; kills: number; time: number } | null;
  bestWave: number;
  hasSave: boolean;
  lastRun: { wave: number; level: number; kills: number } | null;
}

export interface DamageEvent {
  position: Vec2;
  amount: number;
  crit: boolean;
  target: 'enemy' | 'player';
}
