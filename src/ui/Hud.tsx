import type { HudSnapshot } from '../game/world';

interface HudProps {
  snapshot: HudSnapshot;
  onPause: () => void;
  onResume: () => void;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function Hud({ snapshot, onPause, onResume }: HudProps) {
  const hpRatio = snapshot.maxHp > 0 ? Math.max(0, snapshot.hp / snapshot.maxHp) : 0;
  const expRatio = snapshot.expNeed > 0 ? Math.min(1, snapshot.exp / snapshot.expNeed) : 0;
  const paused = snapshot.state === 'paused';
  const playable = snapshot.state === 'playing' || snapshot.state === 'prepare';

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="hud__left">
          <div className="hud__row">
            <span className="tag tag--level">Lv.{snapshot.level}</span>
            <div className="bar bar--hp" title={`生命 ${snapshot.hp} / ${snapshot.maxHp}`}>
              <div className="bar__fill bar__fill--hp" style={{ width: `${hpRatio * 100}%` }} />
              <span className="bar__text">
                {snapshot.hp} / {snapshot.maxHp}
              </span>
            </div>
          </div>
          <div className="hud__row">
            <span className="tag tag--exp">EXP</span>
            <div className="bar bar--exp" title={`经验 ${snapshot.exp} / ${snapshot.expNeed}`}>
              <div className="bar__fill bar__fill--exp" style={{ width: `${expRatio * 100}%` }} />
              <span className="bar__text">
                {snapshot.exp} / {snapshot.expNeed}
              </span>
            </div>
          </div>
          <div className="hud__meta">
            <span>攻击 {snapshot.attack}</span>
            <span>击杀 {snapshot.stats.kills}</span>
            <span>用时 {formatTime(snapshot.elapsed)}</span>
          </div>
        </div>

        <div className="hud__right">
          <div className="wave-badge">
            <span className="wave-badge__label">第 {snapshot.wave} 波</span>
            <span className="wave-badge__detail">
              剩余 {snapshot.monstersAlive + snapshot.pendingSpawns} / {Math.max(snapshot.waveTotal, snapshot.monstersAlive)}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={(event) => {
              event.currentTarget.blur();
              if (paused) onResume();
              else if (playable) onPause();
            }}
            disabled={!playable && !paused}
            title={paused ? '继续 (Esc)' : '暂停 (Esc)'}
          >
            {paused ? '▶ 继续' : '❚❚ 暂停'}
          </button>
        </div>
      </div>

      <div className="hud__skills">
        {snapshot.skills.map((skill, index) => {
          const cooldownRatio = skill.duration > 0 ? Math.max(0, Math.min(1, skill.remaining / skill.duration)) : 0;
          return (
            <div key={skill.id} className={`skill ${skill.ready ? 'skill--ready' : ''}`} title={skill.desc}>
              <div className="skill__key">{index === 0 ? 'U / 1' : index === 1 ? 'I / 2' : 'O / 3'}</div>
              <div className="skill__icon" style={{ borderColor: skill.color, color: skill.color }}>
                {skill.name.slice(0, 1)}
              </div>
              <div className="skill__name">{skill.name}</div>
              {skill.ready ? (
                <div className="skill__ready">就绪</div>
              ) : (
                <>
                  <div className="skill__cooldown" style={{ height: `${cooldownRatio * 100}%` }} />
                  <div className="skill__timer">{skill.remaining.toFixed(1)}s</div>
                </>
              )}
            </div>
          );
        })}
        <div className="skill skill--attack" title="普通攻击：向前挥砍">
          <div className="skill__key">J / X</div>
          <div className="skill__icon" style={{ borderColor: '#ffd166', color: '#ffd166' }}>
            攻
          </div>
          <div className="skill__name">普攻</div>
          <div className="skill__cooldown skill__cooldown--light" style={{ height: `${(1 - snapshot.attackReadyProgress) * 100}%` }} />
        </div>
      </div>

      {snapshot.toast ? <div className={`toast toast--${snapshot.toast.kind}`}>{snapshot.toast.text}</div> : null}
    </div>
  );
}
