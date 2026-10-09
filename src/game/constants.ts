/**
 * 玩法数值集中在这里，调平衡不用翻逻辑代码。
 */

export const FIXED_DT = 1 / 60;

/** 摄像机缩放：像素精灵放大约 1.6 倍，角色在画面里看得更清楚 */
export const VIEW_ZOOM = 1.6;

export const WORLD = {
  width: 2000,
  height: 720,
  groundTop: 620,
  gravity: 2100,
  /** 角色/怪物的最大下落速度 */
  maxFallSpeed: 1250,
  killPlaneY: 900,
} as const;

export const PLAYER = {
  bodyW: 28,
  bodyH: 46,
  moveSpeed: 285,
  accel: 2600,
  airAccel: 1500,
  friction: 2400,
  jumpSpeed: 700,
  doubleJumpSpeed: 645,
  /** 离开地面后仍可起跳的宽容时间（土狼时间） */
  coyoteTime: 0.09,
  /** 落地前预输入跳跃的缓冲时间 */
  jumpBufferTime: 0.12,
  maxHp: 110,
  attack: 12,
  /** 普攻总时长 / 冷却 */
  attackDuration: 0.26,
  attackCooldown: 0.1,
  attackHitStart: 0.06,
  attackHitEnd: 0.17,
  invulnAfterHit: 0.75,
  /** 受击击退速度 */
  hurtKnockX: 260,
  hurtKnockY: 360,
  /** 出生位置 */
  spawnX: 220,
} as const;

export const SKILL_TUNING = {
  spin: { duration: 0.5, hitStart: 0.06, hitEnd: 0.42, radius: 92, damageMul: 1.15, cooldown: 6 },
  dash: { duration: 0.28, speed: 830, damageMul: 1.5, cooldown: 7 },
  heal: { ratio: 0.42, cooldown: 14, castTime: 0.45 },
} as const;

export const EXP_BASE = 46;
export const EXP_GROWTH = 1.36;
export const LEVEL_GAIN = { maxHp: 16, attack: 2.2 } as const;

export const WAVE = {
  /** 开局准备时间 */
  prepareTime: 3,
  /** 切回窗口后的准备时间 */
  resumePrepareTime: 3,
  /** 结算面板自动进入下一波的倒计时 */
  clearTime: 7,
  /** 一批怪之间的间隔 */
  batchInterval: 1.1,
} as const;

export const FX_LIMITS = {
  particles: 260,
  floatingTexts: 48,
} as const;

export const SAVE_KEY = 'gsb-b.save.v1';
export const SAVE_VERSION = 1;
/** 自动保存间隔（秒） */
export const AUTOSAVE_INTERVAL = 12;
