import { useEffect, useMemo, useRef, useState } from 'react';
import { GameLoop } from '../engine/loop';
import { InputManager, type ActionName } from '../engine/input';
import { World } from '../game/world';
import { Camera } from '../render/camera';
import { Renderer } from '../render/renderer';
import { VIEW_H, VIEW_W } from '../game/constants';
import { installDebugHandle, removeDebugHandle } from './debug';
import type { HudSnapshot, SkillId, UpgradeId } from '../game/types';

export interface GameActions {
  startNew(): void;
  continueRun(): void;
  nextWave(): void;
  chooseUpgrade(id: UpgradeId): void;
  togglePause(): void;
  resume(): void;
  restart(): void;
  backToMenu(): void;
  press(action: 'attack' | SkillId): void;
  setHolding(action: 'left' | 'right' | 'jump', holding: boolean): void;
}

export interface GameView {
  snapshot: HudSnapshot | null;
  actions: GameActions;
  fps: number;
  stats: { enemies: number; particles: number; texts: number; listeners: number };
}

const HUD_INTERVAL_MS = 70;
const HOLD_ACTIONS: Record<'left' | 'right' | 'jump', ActionName> = {
  left: 'left',
  right: 'right',
  jump: 'jump'
};

const SKILL_ACTION: Record<SkillId, ActionName> = {
  spin: 'skill1',
  dash: 'skill2',
  heal: 'skill3'
};

/**
 * 把引擎（World / GameLoop / Renderer / Input）接到 React 上。
 * React 只在 HUD_INTERVAL_MS 间隔拉取一次快照，不参与每帧渲染。
 */
export function useGame(canvas: HTMLCanvasElement | null, stage: HTMLElement | null): GameView {
  const worldRef = useRef<World | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState({ enemies: 0, particles: 0, texts: 0, listeners: 0 });
  const fpsRef = useRef({ frames: 0, last: performance.now() });

  useEffect(() => {
    if (!canvas) return;

    const input = new InputManager();
    const world = new World(input);
    const camera = new Camera();
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch {
      return;
    }
    let lastDt = 1 / 60;
    const loop = new GameLoop({
      update: (dt) => {
        lastDt = dt;
        world.update(dt);
      },
      render: (alpha) => {
        renderer.render(
          { player: world.player, enemies: world.enemies.enemies, effects: world.effects, phase: world.phase, camera },
          lastDt,
          alpha
        );
        const now = performance.now();
        fpsRef.current.frames += 1;
        if (now - fpsRef.current.last >= 500) {
          setFps(Math.round((fpsRef.current.frames * 1000) / (now - fpsRef.current.last)));
          fpsRef.current.frames = 0;
          fpsRef.current.last = now;
        }
      }
    });
    inputRef.current = input;
    worldRef.current = world;
    installDebugHandle(world, input, loop, () =>
      renderer.render(
        { player: world.player, enemies: world.enemies.enemies, effects: world.effects, phase: world.phase, camera },
        1 / 60,
        0
      )
    );
    loop.start();

    setSnapshot(world.getSnapshot());
    const unsubscribe = world.events.on('changed', () => setSnapshot(world.getSnapshot()));

    // HUD 快照按固定频率刷新，避免每帧 setState。
    const hudTimer = window.setInterval(() => {
      setSnapshot(world.getSnapshot());
      const fx = world.effects.stats;
      setStats({
        enemies: world.enemies.totalActive,
        particles: fx.particles,
        texts: fx.texts,
        listeners: world.events.listenerCount
      });
    }, HUD_INTERVAL_MS);

    // 窗口失焦 / 切到别的程序：立即暂停（需求 8）。
    const handleVisibility = () => world.setSuspended(document.hidden);
    const handleBlur = () => world.setSuspended(true);
    const handleFocus = () => world.setSuspended(false);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    const handleBeforeUnload = () => world.setSuspended(true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Canvas 按整数倍缩放，保证像素锐利。
    let resizeObserver: ResizeObserver | null = null;
    const applyScale = () => {
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const scale = Math.max(1, Math.floor(Math.min(rect.width / VIEW_W, rect.height / VIEW_H)));
      canvas.style.width = `${VIEW_W * scale}px`;
      canvas.style.height = `${VIEW_H * scale}px`;
    };
    applyScale();
    if (typeof ResizeObserver !== 'undefined' && stage) {
      resizeObserver = new ResizeObserver(applyScale);
      resizeObserver.observe(stage);
    }
    window.addEventListener('resize', applyScale);

    return () => {
      window.clearInterval(hudTimer);
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('resize', applyScale);
      resizeObserver?.disconnect();
      world.setSuspended(true);
      loop.stop();
      input.dispose();
      world.dispose();
      renderer.dispose();
      inputRef.current = null;
      worldRef.current = null;
      removeDebugHandle();
    };
  }, [canvas, stage]);

  const actions = useMemo<GameActions>(
    () => ({
      startNew: () => worldRef.current?.startRun(false),
      continueRun: () => worldRef.current?.startRun(true),
      nextWave: () => worldRef.current?.startNextWave(),
      chooseUpgrade: (id) => worldRef.current?.chooseUpgrade(id),
      togglePause: () => worldRef.current?.togglePause(),
      resume: () => worldRef.current?.resume(),
      restart: () => worldRef.current?.restart(),
      backToMenu: () => worldRef.current?.toMenu(),
      press: (action) => {
        const input = inputRef.current;
        if (!input) return;
        input.push(action === 'attack' ? 'attack' : SKILL_ACTION[action]);
      },
      setHolding: (action, holding) => {
        const input = inputRef.current;
        if (!input) return;
        if (holding) input.push(HOLD_ACTIONS[action]);
        else input.releaseAll();
      }
    }),
    []
  );

  return { snapshot, actions, fps, stats };
}
