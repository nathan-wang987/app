import { useGameEngine } from './hooks/useGameEngine';
import { Hud } from './ui/Hud';
import {
  AutoPauseBanner,
  GameOverPanel,
  PauseOverlay,
  PrepareBanner,
  StartScreen,
  UpgradePicker,
  WaveClearPanel,
} from './ui/Overlays';

export function App() {
  const { canvasRef, snapshot, actions } = useGameEngine();
  const state = snapshot.state;

  return (
    <div className="app">
      <div className="frame">
        <canvas ref={canvasRef} className="frame__canvas" />

        {state !== 'menu' ? <Hud snapshot={snapshot} onPause={actions.pause} onResume={actions.resume} /> : null}
        {state === 'menu' ? <StartScreen snapshot={snapshot} actions={actions} /> : null}
        {state === 'prepare' ? <PrepareBanner snapshot={snapshot} /> : null}
        {state === 'paused' ? <PauseOverlay snapshot={snapshot} actions={actions} /> : null}
        {state === 'levelup' ? <UpgradePicker snapshot={snapshot} actions={actions} /> : null}
        {state === 'waveclear' ? <WaveClearPanel snapshot={snapshot} actions={actions} /> : null}
        {state === 'gameover' ? <GameOverPanel snapshot={snapshot} actions={actions} /> : null}
        <AutoPauseBanner snapshot={snapshot} />
      </div>

      <p className="app__hint">
        移动 ← → ｜ 跳跃 / 二段跳 空格 ｜ 普攻 J ｜ 回旋斩 U ｜ 冲锋 I ｜ 治疗 O ｜ 暂停 Esc
      </p>
    </div>
  );
}
