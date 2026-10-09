import type { HudSnapshot, UpgradeId } from '../game/types';

interface UpgradePanelProps {
  snapshot: HudSnapshot;
  onPick: (id: UpgradeId) => void;
}

const RARITY_LABEL: Record<string, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗'
};

/**
 * 升级三选一：必须选一个才能继续（需求 5）。
 * 选择期间相位为 levelUp，世界时间冻结、无法攻击（需求 6）。
 */
export function UpgradePanel({ snapshot, onPick }: UpgradePanelProps) {
  if (snapshot.phase !== 'levelUp') return null;

  return (
    <div className="overlay overlay-levelup">
      <div className="panel">
        <h2 className="panel-title">升级！LV {snapshot.level}</h2>
        <p className="panel-sub">生命已回满，属性提升。选择一个加成：</p>
        <div className="upgrade-grid">
          {snapshot.upgradeLabels.map((up, index) => (
            <button
              key={up.id}
              className={`upgrade-card rarity-${up.rarity}`}
              onClick={() => onPick(up.id)}
              autoFocus={index === 0}
            >
              <span className={`rarity-tag rarity-${up.rarity}`}>{RARITY_LABEL[up.rarity] ?? up.rarity}</span>
              <strong className="upgrade-name">{up.name}</strong>
              <span className="upgrade-desc">{up.description}</span>
              <span className="upgrade-hint">按 {index + 1} 或点击选择</span>
            </button>
          ))}
        </div>
        <p className="panel-foot">当前：生命上限 {snapshot.maxHp} · 等级 {snapshot.level}</p>
      </div>
    </div>
  );
}
