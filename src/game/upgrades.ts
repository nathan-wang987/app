import type { PlayerModifiers, Upgrade, UpgradeId } from './types';
import type { Rng } from '../engine/rng';

const bump = (mods: PlayerModifiers, id: UpgradeId): number => {
  const next = (mods.taken[id] ?? 0) + 1;
  mods.taken[id] = next;
  return next;
};

/**
 * 升级三选一的加成池。
 * maxStacks 控制可重复抽取次数，抽满后不再出现，避免后期只剩无效选项。
 */
export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'vitality',
    name: '钢铁体魄',
    description: '最大生命 +20，并立即回复等量生命',
    maxStacks: 8,
    rarity: 'common',
    apply: (mods) => {
      bump(mods, 'vitality');
      mods.bonusMaxHp += 20;
    }
  },
  {
    id: 'might',
    name: '磨刀石',
    description: '攻击力 +3',
    maxStacks: 8,
    rarity: 'common',
    apply: (mods) => {
      bump(mods, 'might');
      mods.bonusAttack += 3;
    }
  },
  {
    id: 'agility',
    name: '轻靴',
    description: '移动速度 +10%',
    maxStacks: 5,
    rarity: 'common',
    apply: (mods) => {
      bump(mods, 'agility');
      mods.bonusMoveSpeed += 0.1;
    }
  },
  {
    id: 'swiftness',
    name: '战术节拍',
    description: '所有技能冷却 -12%',
    maxStacks: 3,
    rarity: 'rare',
    apply: (mods) => {
      bump(mods, 'swiftness');
      mods.cooldownRate = Math.min(0.45, mods.cooldownRate + 0.12);
    }
  },
  {
    id: 'reach',
    name: '加长剑刃',
    description: '攻击距离 +4',
    maxStacks: 4,
    rarity: 'common',
    apply: (mods) => {
      bump(mods, 'reach');
      mods.bonusReach += 4;
    }
  },
  {
    id: 'vampire',
    name: '嗜血',
    description: '击中敌人回复 1 点生命（暴击回复 3 点）',
    maxStacks: 3,
    rarity: 'rare',
    apply: (mods) => {
      bump(mods, 'vampire');
      mods.lifesteal += 1;
    }
  },
  {
    id: 'crit',
    name: '致命一击',
    description: '暴击率 +12%，暴击造成 2 倍伤害',
    maxStacks: 4,
    rarity: 'rare',
    apply: (mods) => {
      bump(mods, 'crit');
      mods.critChance = Math.min(0.75, mods.critChance + 0.12);
    }
  },
  {
    id: 'ironwill',
    name: '铁意志',
    description: '受到的伤害 -12%',
    maxStacks: 4,
    rarity: 'rare',
    apply: (mods) => {
      bump(mods, 'ironwill');
      mods.damageReduction = Math.min(0.6, mods.damageReduction + 0.12);
    }
  },
  {
    id: 'scholar',
    name: '老兵经验',
    description: '获得经验 +20%',
    maxStacks: 3,
    rarity: 'common',
    apply: (mods) => {
      bump(mods, 'scholar');
      mods.xpGain += 0.2;
    }
  },
  {
    id: 'dashMaster',
    name: '冲锋专精',
    description: '冲锋伤害 +50%',
    maxStacks: 3,
    rarity: 'epic',
    apply: (mods) => {
      bump(mods, 'dashMaster');
      mods.dashPower += 0.5;
    }
  },
  {
    id: 'spinner',
    name: '旋风扩散',
    description: '旋风斩范围 +25%、伤害 +20%',
    maxStacks: 3,
    rarity: 'epic',
    apply: (mods) => {
      bump(mods, 'spinner');
      mods.spinPower += 0.2;
    }
  },
  {
    id: 'mender',
    name: '圣光眷顾',
    description: '治疗术回复量 +50%',
    maxStacks: 3,
    rarity: 'epic',
    apply: (mods) => {
      bump(mods, 'mender');
      mods.healPower += 0.5;
    }
  }
];

export function createModifiers(): PlayerModifiers {
  return {
    bonusMaxHp: 0,
    bonusAttack: 0,
    bonusMoveSpeed: 0,
    bonusReach: 0,
    cooldownRate: 0,
    lifesteal: 0,
    critChance: 0,
    damageReduction: 0,
    xpGain: 0,
    dashPower: 0,
    spinPower: 0,
    healPower: 0,
    taken: {}
  };
}

export const getUpgrade = (id: UpgradeId): Upgrade | undefined =>
  UPGRADES.find((u) => u.id === id);

/** 随机抽 3 个未抽满的加成（需求 5）。 */
export function rollUpgradeChoices(rng: Rng, mods: PlayerModifiers, count = 3): UpgradeId[] {
  const pool = UPGRADES.filter((u) => (mods.taken[u.id] ?? 0) < u.maxStacks);
  const source = pool.length >= count ? pool : UPGRADES.slice();
  return rng.sample(source, count).map((u) => u.id);
}
