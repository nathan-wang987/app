import { SKILLS } from '../game/constants';
import type { HudSnapshot } from '../game/types';

interface HudProps {
  snapshot: HudSnapshot;
  fps: number;
  stats: { enemies: number; particles: number; texts: number; listeners: number };
  onTogglePause: () => void;
  onBackToMenu: () => void;
}

const formatTime = (seconds: number): string => {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** 顶部状态栏：生命、经验、波次、击杀与暂停控制。 */
export function Hud({ snapshot, fps, stats, onTogglePause, onBackToMenu }: HudProps) {
  const hpRatio = snapshot.maxHp > 0 ? snapshot.hp / snapshot.maxHp : 0;
  const xpRatio = snapshot.xpToNext > 0 ? snapshot.xp / snapshot.xpToNext : 0;
  const canPause = snapshot.phase === 'playing';

  return (
    <div className="hud">
      <div className="hud-row">
        <div className="bars">
          <div className="bar bar-hp">
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(1, hpRatio)) * 100}%` }} />
            <span className="bar-label">
              HP {snapshot.hp}/{snapshot.maxHp}
            </span>
          </div>
          <div className="bar bar-xp">
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(1, xpRatio)) * 100}%` }} />
            <span className="bar-label">
              LV {snapshot.level} · {snapshot.xp}/{snapshot.xpToNext}
            </span>
          </div>
        </div>

        <div className="hud-stats">
          <span className="chip chip-wave">第 {snapshot.wave} 波</span>
          <span className="chip">剩余 {snapshot.enemiesLeft}</span>
          <span className="chip">击杀 {snapshot.kills}</span>
          <span className="chip">{formatTime(snapshot.elapsed)}</span>
          <button className="icon-button" onClick={onTogglePause} disabled={!canPause} title="暂停 / 继续 (Esc)">
            {snapshot.paused ? '▶' : '❚❚'}
          </button>
          <button className="icon-button" onClick={onBackToMenu} title="保存并返回标题">
            ⌂
          </button>
        </div>
      </div>

      <div className="hud-dev">
        {fps} FPS · 敌人 {stats.enemies} · 粒子 {stats.particles} · 飘字 {stats.texts} · 监听 {stats.listeners}
        · 最高波 {snapshot.bestWave}
      </div>
    </div>
  );
}

interface SkillBarProps {
  snapshot: HudSnapshot;
  onPress: (action: 'attack' | 'spin' | 'dash' | 'heal') => void;
}

/**
 * 技能栏：显示每个技能的冷却剩余时间 + 冷却填充条。
 * 冷却数据与游戏逻辑共用同一份数据源（player.cooldowns）。
 */
export function SkillBar({ snapshot, onPress }: SkillBarProps) {
  const interactive = snapshot.phase === 'playing' && !snapshot.paused && !snapshot.autoPaused;

  return (
    <div className="skillbar">
      <button
        className="skill-card skill-attack"
        disabled={!interactive}
        onClick={() => onPress('attack')}
        title="普通攻击 (J)"
      >
        <div className="skill-icon">⚔</div>
        <div className="skill-name">攻击</div>
        <div className="skill-key">J</div>
      </button>

      {(['spin', 'dash', 'heal'] as const).map((id) => {
        const info = snapshot.cooldowns[id];
        const cfg = SKILLS[id];
        const ready = info.remaining <= 0;
        const ratio = info.total > 0 ? info.remaining / info.total : 0;
        return (
          <button
            key={id}
            className={`skill-card${ready ? '' : ' cooling'}`}
            style={{ ['--skill-color' as string]: cfg.color }}
            disabled={!interactive}
            onClick={() => onPress(id)}
            title={`${cfg.name} (${cfg.key}) — ${cfg.description}`}
          >
            <div className="skill-icon">{id === 'spin' ? '🌀' : id === 'dash' ? '➹' : '✚'}</div>
            <div className="skill-name">{cfg.name}</div>
            <div className="skill-key">{cfg.key}</div>
            {!ready && (
              <>
                <div className="skill-cooldown-fill" style={{ height: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
                <div className="skill-cooldown-text">{info.remaining.toFixed(1)}s</div>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
