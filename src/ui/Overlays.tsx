import type { HudSnapshot } from '../game/types';

interface OverlaysProps {
  snapshot: HudSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onNextWave: () => void;
  onRestart: () => void;
  onResume: () => void;
}

const CONTROL_ROWS: [string, string][] = [
  ['← → / A D', '左右移动'],
  ['空格 / ↑', '跳跃（空中可再跳一次）'],
  ['J', '挥刀攻击'],
  ['K', '旋风斩：原地转一圈砍周围'],
  ['L', '冲锋：向前冲刺，冲刺期间无敌'],
  ['U', '治疗：回复 40% 最大生命'],
  ['Esc / P', '暂停（暂停时时间停止）']
];

export function Overlays({
  snapshot,
  onStart,
  onContinue,
  onNextWave,
  onRestart,
  onResume
}: OverlaysProps) {
  if (snapshot.phase === 'menu') {
    return (
      <div className="overlay">
        <div className="panel">
          <h1 className="title">刃之轮回</h1>
          <p className="subtitle">像素横版 · 打怪升级 · 一波更比一波强</p>
          <div className="overlay-actions">
            {snapshot.hasSave ? (
              <button className="primary" onClick={onContinue}>
                继续游戏{snapshot.lastRun ? `（第 ${snapshot.lastRun.wave} 波 / LV ${snapshot.lastRun.level}）` : ''}
              </button>
            ) : null}
            <button className={snapshot.hasSave ? '' : 'primary'} onClick={onStart}>
              {snapshot.hasSave ? '重新开始（清空存档）' : '开始游戏'}
            </button>
          </div>
          <div className="controls">
            {CONTROL_ROWS.map(([keys, desc]) => (
              <div className="control-row" key={keys}>
                <span className="keys">{keys}</span>
                <span className="desc">{desc}</span>
              </div>
            ))}
          </div>
          <p className="panel-foot">
            通关提示：术士出手前会举手蓄力（0.6 秒），抓住这个空档；巨胖移动很慢但很耐打，用旋风斩清理小鬼。
            进度会自动保存，最高波次：{snapshot.bestWave}
          </p>
        </div>
      </div>
    );
  }

  if (snapshot.paused || snapshot.autoPaused) {
    return (
      <div className="overlay">
        <div className="panel small">
          <h2 className="panel-title">{snapshot.autoPaused ? '已自动暂停' : '已暂停'}</h2>
          <p className="panel-sub">时间已停止：怪物不会移动，技能冷却也不会走。</p>
          <div className="overlay-actions">
            <button className="primary" onClick={onResume}>
              继续
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (snapshot.resumeCountdown > 0) {
    return (
      <div className="overlay overlay-prep">
        <div className="prep">
          <div className="prep-number">{Math.ceil(snapshot.resumeCountdown)}</div>
          <div className="prep-text">准备…（切回窗口后的准备时间）</div>
        </div>
      </div>
    );
  }

  if (snapshot.phase === 'waveClear' && snapshot.waveSummary) {
    return (
      <div className="overlay">
        <div className="panel">
          <h2 className="panel-title">第 {snapshot.waveSummary.wave} 波 · 清场！</h2>
          <ul className="summary">
            <li>
              <span>本波击杀</span>
              <strong>{snapshot.waveSummary.kills}</strong>
            </li>
            <li>
              <span>用时</span>
              <strong>{snapshot.waveSummary.time.toFixed(1)}s</strong>
            </li>
            <li>
              <span>累计击杀</span>
              <strong>{snapshot.kills}</strong>
            </li>
            <li>
              <span>等级</span>
              <strong>LV {snapshot.level}</strong>
            </li>
          </ul>
          <p className="panel-sub">结算中无法攻击。准备好了就进入下一波，敌人会更多、更强。</p>
          <div className="overlay-actions">
            <button className="primary" onClick={onNextWave}>
              开始第 {snapshot.wave + 1} 波
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (snapshot.phase === 'gameOver') {
    return (
      <div className="overlay">
        <div className="panel">
          <h2 className="panel-title danger">你倒下了…</h2>
          <ul className="summary">
            <li>
              <span>到达波次</span>
              <strong>第 {snapshot.wave} 波</strong>
            </li>
            <li>
              <span>等级</span>
              <strong>LV {snapshot.level}</strong>
            </li>
            <li>
              <span>本次击杀</span>
              <strong>{snapshot.kills}</strong>
            </li>
            <li>
              <span>存活时间</span>
              <strong>{snapshot.elapsed.toFixed(0)}s</strong>
            </li>
          </ul>
          <p className="panel-sub">历史最高波次：{snapshot.bestWave} · 累计击杀：{snapshot.totalKills}</p>
          <div className="overlay-actions">
            <button className="primary" onClick={onRestart}>
              重新开始
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
