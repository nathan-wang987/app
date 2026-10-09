import type { HudSnapshot } from '../game/world';
import type { GameActions } from '../hooks/useGameEngine';
import { formatRelative, formatTime } from './format';
import { MonsterCodex } from './MonsterCodex';
import { Panel, PixelButton } from './Panel';

const RARITY_LABEL: Record<string, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
};

interface OverlayProps {
  snapshot: HudSnapshot;
  actions: GameActions;
}

function StatGrid({ snapshot }: { snapshot: HudSnapshot }) {
  return (
    <dl className="stats">
      <div>
        <dt>到达波次</dt>
        <dd>第 {snapshot.wave} 波</dd>
      </div>
      <div>
        <dt>等级</dt>
        <dd>Lv.{snapshot.level}</dd>
      </div>
      <div>
        <dt>击杀</dt>
        <dd>{snapshot.stats.kills}</dd>
      </div>
      <div>
        <dt>造成伤害</dt>
        <dd>{Math.round(snapshot.stats.damageDealt)}</dd>
      </div>
      <div>
        <dt>承受伤害</dt>
        <dd>{Math.round(snapshot.stats.damageTaken)}</dd>
      </div>
      <div>
        <dt>本局用时</dt>
        <dd>{formatTime(snapshot.elapsed)}</dd>
      </div>
    </dl>
  );
}

function ControlList() {
  return (
    <ul className="controls">
      <li>
        <span>左右移动</span>
        <kbd>←</kbd>
        <kbd>→</kbd>
        <em>/ A D</em>
      </li>
      <li>
        <span>跳跃 / 二段跳</span>
        <kbd>空格</kbd>
        <kbd>W</kbd>
        <kbd>K</kbd>
      </li>
      <li>
        <span>普攻挥砍</span>
        <kbd>J</kbd>
        <kbd>X</kbd>
      </li>
      <li>
        <span>回旋斩 / 冲锋 / 治疗</span>
        <kbd>U</kbd>
        <kbd>I</kbd>
        <kbd>O</kbd>
        <em>/ 1 2 3</em>
      </li>
      <li>
        <span>暂停</span>
        <kbd>Esc</kbd>
        <kbd>P</kbd>
      </li>
    </ul>
  );
}

export function StartScreen({ snapshot, actions }: OverlayProps) {
  const save = snapshot.saveSummary;
  return (
    <div className="overlay overlay--start">
      <Panel
        wide
        className="panel--start"
        title="像素勇者 · 无尽波次"
        subtitle="横版 2D 像素打怪升级 · 一波比一波更凶"
      >
        <div className="start__top">
          <ControlList />
          <div className="start__side">
            {save ? (
              <PixelButton kind="primary" onClick={actions.continueGame} hint={`Lv.${save.level} · ${formatRelative(save.savedAt)}`}>
                继续游戏（第 {save.wave} 波）
              </PixelButton>
            ) : null}
            <PixelButton kind={save ? 'ghost' : 'primary'} onClick={actions.startNewGame}>
              新游戏
            </PixelButton>
            {save ? (
              <PixelButton kind="danger" onClick={actions.deleteSave} hint="清除浏览器里的存档">
                清空存档
              </PixelButton>
            ) : null}
          </div>
        </div>
        <MonsterCodex />
        <p className="tip">
          升级时会弹出三个随机加成供你选择；升级后生命上限与攻击提升、血量回满。
          进度会自动保存，切到别的窗口时会自动暂停，切回来有 3 秒准备时间。
        </p>
      </Panel>
    </div>
  );
}

export function PrepareBanner({ snapshot }: { snapshot: HudSnapshot }) {
  const seconds = Math.max(1, Math.ceil(snapshot.prepareRemaining));
  return (
    <div className="overlay overlay--prepare">
      <div className="prepare">
        <div className="prepare__count">{seconds}</div>
        <div className="prepare__label">
          {snapshot.wave > 0 ? `第 ${snapshot.wave} 波准备中` : '准备'}
        </div>
        <div className="prepare__hint">可以走动调整站位，怪物马上就来</div>
      </div>
    </div>
  );
}

export function PauseOverlay({ snapshot, actions }: OverlayProps) {
  return (
    <div className="overlay">
      <Panel title="已暂停" subtitle={snapshot.autoPaused ? '检测到窗口失焦，已自动暂停' : '时间已冻结，怪物不会行动'}>
        <StatGrid snapshot={snapshot} />
        <div className="overlay__buttons">
          <PixelButton kind="primary" onClick={actions.resume} hint="Esc / P">
            继续游戏
          </PixelButton>
          <PixelButton onClick={actions.restart} hint="从第 1 波重新开始">
            重新开始
          </PixelButton>
          <PixelButton kind="danger" onClick={actions.backToMenu}>
            返回主菜单
          </PixelButton>
        </div>
        <ControlList />
      </Panel>
    </div>
  );
}

export function UpgradePicker({ snapshot, actions }: OverlayProps) {
  return (
    <div className="overlay">
      <Panel
        wide
        title={`升级！ Lv.${snapshot.level}`}
        subtitle={
          snapshot.pendingLevelUps > 1
            ? `生命与攻击提升、血量已回满。还有 ${snapshot.pendingLevelUps} 次加成待选`
            : '生命与攻击提升、血量已回满。选一项加成继续'
        }
      >
        <div className="upgrades">
          {snapshot.choices.map((choice, index) => (
            <button
              key={choice.id}
              type="button"
              className={`upgrade-card upgrade-card--${choice.rarity}`}
              onClick={(event) => {
                event.currentTarget.blur();
                actions.chooseUpgrade(choice.id);
              }}
            >
              <span className="upgrade-card__index">{index + 1}</span>
              <span className="upgrade-card__rarity">{RARITY_LABEL[choice.rarity] ?? choice.rarity}</span>
              <span className="upgrade-card__name">{choice.name}</span>
              <span className="upgrade-card__desc">{choice.desc}</span>
              <span className="upgrade-card__stacks">
                已获得 {choice.stacks} / {choice.maxStacks} 次
              </span>
            </button>
          ))}
        </div>
        <p className="tip">按 1 / 2 / 3 或直接点击卡片选择</p>
      </Panel>
    </div>
  );
}

export function WaveClearPanel({ snapshot, actions }: OverlayProps) {
  return (
    <div className="overlay">
      <Panel
        title={`第 ${snapshot.wave} 波 清空！`}
        subtitle={`${snapshot.clearRemaining.toFixed(1)} 秒后自动进入下一波（结算期间不会受伤）`}
      >
        <StatGrid snapshot={snapshot} />
        <div className="overlay__buttons">
          <PixelButton kind="primary" onClick={actions.nextWave} hint="立刻开始下一波">
            进入第 {snapshot.wave + 1} 波
          </PixelButton>
          <PixelButton onClick={actions.pause}>暂停</PixelButton>
        </div>
      </Panel>
    </div>
  );
}

export function GameOverPanel({ snapshot, actions }: OverlayProps) {
  return (
    <div className="overlay">
      <Panel title="你倒下了" subtitle={`坚持到了第 ${snapshot.wave} 波`}>
        <StatGrid snapshot={snapshot} />
        <div className="overlay__buttons">
          <PixelButton kind="primary" onClick={actions.restart} hint="从第 1 波重新开始">
            重新开始
          </PixelButton>
          <PixelButton onClick={actions.backToMenu}>返回主菜单</PixelButton>
        </div>
        <p className="tip">提示：狂暴小鬼伤害极高但很脆，看到它站定发红时，用冲锋躲开或抢先砍死它。</p>
      </Panel>
    </div>
  );
}

export function AutoPauseBanner({ snapshot }: { snapshot: HudSnapshot }) {
  if (snapshot.state !== 'paused' || !snapshot.autoPaused) return null;
  return <div className="auto-pause-banner">窗口失焦 · 已自动暂停</div>;
}
