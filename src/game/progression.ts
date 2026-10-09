import type { Rng } from '../engine/rng';
import { clamp } from '../engine/math';
import { EXP_BASE, EXP_GROWTH, LEVEL_GAIN } from './constants';
import type { Player } from './player';

export type Rarity = 'common' | 'rare' | 'epic';

export interface UpgradeChoice {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  /** 已经拿过几次 */
  stacks: number;
  maxStacks: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  maxStacks: number;
  weight: number;
  apply: (player: Player) => void;
}

const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 1,
  rare: 0.52,
  epic: 0.22,
};

/** 升级加成池（随机三选一从这里抽） */
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'sharp_blade',
    name: '锋利剑刃',
    desc: '攻击力 +4',
    rarity: 'common',
    maxStacks: 9,
    weight: 1,
    apply: (player) => {
      player.attack += 4;
    },
  },
  {
    id: 'steel_body',
    name: '钢铁之躯',
    desc: '最大生命 +22，并回复等量生命',
    rarity: 'common',
    maxStacks: 8,
    weight: 1,
    apply: (player) => {
      player.maxHp += 22;
      player.hp = clamp(player.hp + 22, 0, player.maxHp);
    },
  },
  {
    id: 'swift_boots',
    name: '疾风之靴',
    desc: '移动速度 +12%',
    rarity: 'common',
    maxStacks: 5,
    weight: 1,
    apply: (player) => {
      player.stats.moveSpeedMul *= 1.12;
    },
  },
  {
    id: 'quick_slash',
    name: '快速挥砍',
    desc: '普攻间隔 -18%',
    rarity: 'common',
    maxStacks: 4,
    weight: 1,
    apply: (player) => {
      player.stats.attackSpeedMul *= 0.82;
    },
  },
  {
    id: 'regen',
    name: '回春',
    desc: '治疗技能回复量 +50%',
    rarity: 'common',
    maxStacks: 4,
    weight: 1,
    apply: (player) => {
      player.stats.healMul *= 1.5;
    },
  },
  {
    id: 'heavy_blade',
    name: '重剑',
    desc: '攻击力 +22%',
    rarity: 'rare',
    maxStacks: 4,
    weight: 1,
    apply: (player) => {
      player.attack *= 1.22;
    },
  },
  {
    id: 'spin_master',
    name: '旋风精通',
    desc: '回旋斩范围 +25%、伤害 +15%',
    rarity: 'rare',
    maxStacks: 3,
    weight: 1,
    apply: (player) => {
      player.stats.spinRadiusMul *= 1.25;
      player.stats.spinDamageMul *= 1.15;
    },
  },
  {
    id: 'tactical_breath',
    name: '战术呼吸',
    desc: '所有技能冷却 -14%',
    rarity: 'rare',
    maxStacks: 3,
    weight: 1,
    apply: (player) => {
      player.stats.cooldownMul *= 0.86;
    },
  },
  {
    id: 'dash_master',
    name: '冲锋大师',
    desc: '冲锋伤害 +60%、冷却 -15%',
    rarity: 'rare',
    maxStacks: 3,
    weight: 1,
    apply: (player) => {
      player.stats.dashDamageMul *= 1.6;
      player.stats.cooldownMul *= 0.85;
    },
  },
  {
    id: 'vampire',
    name: '嗜血',
    desc: '每击杀一只怪回复 3 点生命',
    rarity: 'rare',
    maxStacks: 6,
    weight: 1,
    apply: (player) => {
      player.stats.lifesteal += 3;
    },
  },
  {
    id: 'thorns',
    name: '荆棘之皮',
    desc: '受到伤害时反弹 10 点伤害给攻击者',
    rarity: 'rare',
    maxStacks: 5,
    weight: 1,
    apply: (player) => {
      player.stats.thorns += 10;
    },
  },
  {
    id: 'iron_skin',
    name: '铁皮',
    desc: '受到的伤害 -12%',
    rarity: 'rare',
    maxStacks: 3,
    weight: 1,
    apply: (player) => {
      player.stats.damageReduction = clamp(player.stats.damageReduction + 0.12, 0, 0.7);
    },
  },
  {
    id: 'blood_rage',
    name: '血怒',
    desc: '生命低于 30% 时攻击力 +55%',
    rarity: 'epic',
    maxStacks: 2,
    weight: 1,
    apply: (player) => {
      player.stats.lowHpBonus += 0.55;
    },
  },
  {
    id: 'air_blade',
    name: '空刃',
    desc: '二段跳时对周围造成攻击力 90% 的伤害',
    rarity: 'epic',
    maxStacks: 3,
    weight: 1,
    apply: (player) => {
      player.stats.jumpBlastDamage += player.attack * 0.9;
    },
  },
  {
    id: 'executioner',
    name: '处决者',
    desc: '对生命低于 30% 的怪伤害 +55%',
    rarity: 'epic',
    maxStacks: 2,
    weight: 1,
    apply: (player) => {
      player.stats.executioner += 0.55;
    },
  },
  {
    id: 'berserk_heart',
    name: '生命涌动',
    desc: '最大生命 +12%，并立刻回满生命',
    rarity: 'epic',
    maxStacks: 2,
    weight: 1,
    apply: (player) => {
      player.maxHp = Math.round(player.maxHp * 1.12);
      player.hp = player.maxHp;
    },
  },
];

const UPGRADE_BY_ID = new Map(UPGRADES.map((def) => [def.id, def]));

export function getUpgrade(id: string): UpgradeDef | undefined {
  return UPGRADE_BY_ID.get(id);
}

export function expNeeded(level: number): number {
  return Math.floor(EXP_BASE * Math.pow(EXP_GROWTH, level - 1));
}

export function applyUpgrade(player: Player, id: string): boolean {
  const def = UPGRADE_BY_ID.get(id);
  if (!def) return false;
  const stacks = player.upgrades[id] ?? 0;
  if (stacks >= def.maxStacks) return false;
  def.apply(player);
  player.upgrades[id] = stacks + 1;
  return true;
}

/** 随机抽 3 个不重复的加成（已经拿满的不再出现） */
export function rollUpgrades(rng: Rng, taken: Record<string, number>, count = 3): UpgradeChoice[] {
  const available = UPGRADES.filter((def) => (taken[def.id] ?? 0) < def.maxStacks);
  const weights = available.map((def) => ({
    def,
    weight: def.weight * RARITY_WEIGHT[def.rarity],
  }));

  const picked: UpgradeChoice[] = [];
  const pickedIds = new Set<string>();
  let guard = 0;
  while (picked.length < count && pickedIds.size < available.length && guard < 60) {
    guard += 1;
    const pool = weights.filter((w) => !pickedIds.has(w.def.id));
    if (pool.length === 0) break;
    const chosen = rng.pickWeighted(pool);
    pickedIds.add(chosen.def.id);
    picked.push({
      id: chosen.def.id,
      name: chosen.def.name,
      desc: chosen.def.desc,
      rarity: chosen.def.rarity,
      stacks: taken[chosen.def.id] ?? 0,
      maxStacks: chosen.def.maxStacks,
    });
  }
  return picked;
}

/** 升级时对基础属性的固定成长 */
export function applyLevelGain(player: Player): void {
  player.maxHp += LEVEL_GAIN.maxHp;
  player.attack += LEVEL_GAIN.attack;
  player.hp = player.maxHp;
}
