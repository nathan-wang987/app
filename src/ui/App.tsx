import { useEffect, useRef, useState } from 'react';
import { Hud, SkillBar } from './Hud';
import { Overlays } from './Overlays';
import { UpgradePanel } from './UpgradePanel';
import { useGame } from './useGame';

/**
 * 顶层容器：把 Canvas（游戏画面）与 React（界面）叠在一起。
 * React 负责所有 UI，Canvas 只画游戏画面（需求：界面用 React，画面用 Canvas）。
 */
export function App() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const { snapshot, actions, fps, stats } = useGame(canvas, stage);

  // 升级面板支持按 1/2/3 快速选择。
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const current = snapshotRef.current;
      if (!current || current.phase !== 'levelUp') return;
      const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
      if (index < 0) return;
      const choice = current.upgradeChoices[index];
      if (choice) actions.chooseUpgrade(choice);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions]);

  return (
    <div className="app">
      <div className="stage" ref={setStage}>
        <canvas className="game-canvas" ref={setCanvas} />
        {snapshot ? (
          <>
            {snapshot.phase !== 'menu' ? (
              <>
                <Hud
                  snapshot={snapshot}
                  fps={fps}
                  stats={stats}
                  onTogglePause={actions.togglePause}
                  onBackToMenu={actions.backToMenu}
                />
                <SkillBar snapshot={snapshot} onPress={actions.press} />
              </>
            ) : null}
            <Overlays
              snapshot={snapshot}
              onStart={actions.startNew}
              onContinue={actions.continueRun}
              onNextWave={actions.nextWave}
              onRestart={actions.restart}
              onResume={actions.resume}
            />
            <UpgradePanel snapshot={snapshot} onPick={actions.chooseUpgrade} />
          </>
        ) : null}
      </div>
      <footer className="footer">
        <span>Canvas 渲染 · React 界面 · TypeScript 引擎</span>
        <span>进度自动保存到浏览器本地存储，关掉页面再打开可以继续。</span>
      </footer>
    </div>
  );
}
