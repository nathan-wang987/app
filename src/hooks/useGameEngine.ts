import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { GameLoop } from '../engine/loop';
import { InputManager } from '../engine/input';
import { SnapshotStore } from '../engine/store';
import { FIXED_DT, VIEW_ZOOM } from '../game/constants';
import { createDefaultStats, World, type HudSnapshot } from '../game/world';
import { Renderer, viewportSizeOf } from '../render/renderer';

const INITIAL_SNAPSHOT: HudSnapshot = {
  state: 'menu',
  wave: 0,
  waveTotal: 0,
  waveKills: 0,
  monstersAlive: 0,
  pendingSpawns: 0,
  level: 1,
  exp: 0,
  expNeed: 1,
  hp: 110,
  maxHp: 110,
  attack: 12,
  skills: [],
  attackReadyProgress: 1,
  choices: [],
  pendingLevelUps: 0,
  prepareRemaining: 0,
  clearRemaining: 0,
  toast: null,
  autoPaused: false,
  hasSave: false,
  saveSummary: null,
  stats: createDefaultStats(),
  elapsed: 0,
  upgrades: {},
};

export interface GameActions {
  startNewGame: () => void;
  continueGame: () => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  nextWave: () => void;
  chooseUpgrade: (id: string) => void;
  deleteSave: () => void;
  backToMenu: () => void;
}

export interface GameApi {
  canvasRef: RefObject<HTMLCanvasElement>;
  snapshot: HudSnapshot;
  actions: GameActions;
}

/**
 * React 与游戏引擎之间的桥：
 * - 挂载时创建输入、世界、渲染器与固定步长循环；
 * - 卸载时摘掉所有监听、停循环、释放精灵缓存，避免内存泄漏；
 * - 通过 useSyncExternalStore 把引擎快照喂给界面。
 */
export function useGameEngine(): GameApi {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const storeRef = useRef<SnapshotStore<HudSnapshot> | null>(null);
  if (!storeRef.current) storeRef.current = new SnapshotStore<HudSnapshot>(INITIAL_SNAPSHOT);
  const store = storeRef.current;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const input = new InputManager(window);
    const world = new World(input, store);
    const renderer = new Renderer(canvas);
    worldRef.current = world;

    const resize = () => {
      const { w, h } = viewportSizeOf(canvas);
      renderer.resize(w, h, window.devicePixelRatio || 1, VIEW_ZOOM);
      // 世界坐标下的可视范围（缩放后能看到的实际范围变小）
      world.setViewport(w / VIEW_ZOOM, h / VIEW_ZOOM);
    };
    resize();

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);

    let lastFrame = performance.now();
    const loop = new GameLoop(
      (dt) => world.update(dt),
      () => {
        const now = performance.now();
        const frameDelta = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        renderer.render(world, frameDelta);
      },
      FIXED_DT,
    );
    loop.start();

    const onBlur = () => world.notifyHidden();
    const onFocus = () => world.notifyVisible();
    const onVisibility = () => {
      if (document.hidden) world.notifyHidden();
      else world.notifyVisible();
    };
    const onBeforeUnload = () => world.saveGame(true);

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      loop.dispose();
      renderer.dispose();
      world.dispose();
      input.dispose();
      worldRef.current = null;
    };
  }, [store]);

  const actions = useMemo<GameActions>(
    () => ({
      startNewGame: () => worldRef.current?.startNewGame(),
      continueGame: () => worldRef.current?.continueGame(),
      restart: () => worldRef.current?.restart(),
      pause: () => worldRef.current?.pause('manual'),
      resume: () => worldRef.current?.resume(),
      togglePause: () => worldRef.current?.togglePause(),
      nextWave: () => worldRef.current?.nextWave(),
      chooseUpgrade: (id: string) => worldRef.current?.chooseUpgrade(id),
      deleteSave: () => worldRef.current?.deleteSave(),
      backToMenu: () => worldRef.current?.backToMenu(),
    }),
    [],
  );

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const captureSave = useCallback(() => worldRef.current?.saveGame(true), []);
  useEffect(() => {
    // 页面被关闭/切走前再存一次保险
    const onPageHide = () => captureSave();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [captureSave]);

  return { canvasRef, snapshot, actions };
}
