import { SKILL_TUNING } from './constants';

export type SkillId = 'spin' | 'dash' | 'heal';

export interface SkillDef {
  id: SkillId;
  name: string;
  /** 界面上的简短说明 */
  desc: string;
  /** 基础冷却（秒） */
  cooldown: number;
  /** 图标配色（像素风小方块） */
  color: string;
}

export const SKILL_ORDER: SkillId[] = ['spin', 'dash', 'heal'];

export const SKILL_DEFS: Record<SkillId, SkillDef> = {
  spin: {
    id: 'spin',
    name: '回旋斩',
    desc: '原地转一圈，砍到周围所有怪',
    cooldown: SKILL_TUNING.spin.cooldown,
    color: '#6ee7b7',
  },
  dash: {
    id: 'dash',
    name: '冲锋',
    desc: '向前突进一段距离，冲刺期间无敌',
    cooldown: SKILL_TUNING.dash.cooldown,
    color: '#7dd3fc',
  },
  heal: {
    id: 'heal',
    name: '治疗',
    desc: '立刻回复一部分生命值',
    cooldown: SKILL_TUNING.heal.cooldown,
    color: '#fca5a5',
  },
};
