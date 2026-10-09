import { Emitter } from '../engine/events';
import { InputManager } from '../engine/input';
import { SnapshotStore } from '../engine/store';
import { Rng } from '../engine/rng';
import { clamp, damp, rectCenterX, rectCenterY } from '../engine/math';
import { AUTOSAVE_INTERVAL, FIXED_DT, SAVE_VERSION, WAVE } from './constants';
import { FxSystem } from './fx';
import { buildArena, findSpawnPoint, type Arena } from './level';
import { createMonster, separateMonsters, updateMonster, MONSTER_DEFS, type Monster, type MonsterKind } from './monsters';
import { createPlayer, updatePlayer, type Player } from './player';
import { applyLevelGain, applyUpgrade, expNeeded, rollUpgrades, type UpgradeChoice } from './progression';
import { SKILL_DEFS, SKILL_ORDER, type SkillId } from './skills';
import { buildSpawnOrder, planWave, type SpawnOrderEntry, type WavePlan } from './waves';
import { clearSave, readSave, writeSave, type SaveData, type SaveStats } from './save';

export type GameState = 'menu' | 'prepare' | 'playing' | 'paused' | 'levelup' | 'waveclear' | 'gameover';

export type PauseReason = 'manual' | 'hidden';

export type WorldEvents = {
  skill: { id: SkillId };
  levelUp: { level: number };
  upgradePicked: { id: string };
  waveStart: { wave: number };
  waveClear: { wave: number; kills: number };
  death: { wave: number; level: number };
  saved: { at: number };
  autoPause: { reason: PauseReason };
};

export interface HudSkill {
  id: SkillId;
  name: string;
  desc: string;
  color: string;
  remaining: number;
  duration: number;
  ready: boolean;
}

export interface HudSnapshot {
  state: GameState;
  wave: number;
  waveTotal: number;
  waveKills: number;
  monstersAlive: number;
  pendingSpawns: number;
  level: number;
  exp: number;
  expNeed: number;
  hp: number;
  maxHp: number;
  attack: number;
  skills: HudSkill[];
  attackReadyProgress: number;
  choices: UpgradeChoice[];
  pendingLevelUps: number;
  prepareRemaining: number;
  clearRemaining: number;
  toast: { text: string; kind: 'info' | 'save' | 'danger' } | null;
  autoPaused: boolean;
  hasSave: boolean;
  saveSummary: { wave: number; level: number; savedAt: number } | null;
  stats: SaveStats;
  elapsed: number;
  upgrades: Record<string, number>;
}

export function createDefaultStats(): SaveStats {
  return { kills: 0, damageDealt: 0, damageTaken: 0, deaths: 0, bestWave: 1, totalExp: 0, playTime: 0 };
}

export class World {
  readonly arena: Arena = buildArena();
  readonly fx = new FxSystem();
  readonly events = new Emitter<WorldEvents>();
  readonly input: InputManager;
  private readonly store: SnapshotStore<HudSnapshot>;

  rng: Rng;
  player: Player;
  monsters: Monster[] = [];
  nextMonsterId = 1;
  monstersDropped = 0;

  state: GameState = 'menu';
  wave = 0;
  wavePlan: WavePlan | null = null;
  spawnQueue: SpawnOrderEntry[] = [];
  waveTotal = 0;
  waveKills = 0;
  level = 1;
  exp = 0;
  pendingLevelUps = 0;
  choices: UpgradeChoice[] = [];
  stats: SaveStats = createDefaultStats();
  elapsed = 0;

  prepareRemaining = 0;
  clearRemaining = 0;
  autoPaused = false;
  toast: { text: string; kind: 'info' | 'save' | 'danger'; t: number } | null = null;
  hasSave = false;
  saveSummary: { wave: number; level: number; savedAt: number } | null = null;

  cameraX = 0;
  cameraY = 0;
  shake = 0;
  viewW = 960;
  viewH = 540;

  private spawnTimer = 0;
  private snapshotTimer = 0;
  private autosaveTimer = 0;
  private stateBeforeLevelUp: GameState = 'playing';
  private stateBeforePause: GameState = 'playing';
  private disposed = false;

  constructor(input: InputManager, store: SnapshotStore<HudSnapshot>) {
    this.input = input;
    this.store = store;
    this.rng = new Rng();
    this.player = createPlayer();
    this.player.y = this.arena.bounds.h - 400;
    this.centerCameraOnPlayer();
    this.refreshSaveInfo();
    this.pushSnapshot(true);
  }

  // ---------------------------------------------------------------- 生命周期

  dispose(): void {
    this.disposed = true;
    this.events.clear();
    this.fx.dispose();
    this.monsters.length = 0;
    this.spawnQueue.length = 0;
    this.choices.length = 0;
  }

  refreshSaveInfo(): void {
    const save = readSave();
    this.hasSave = !!save;
    this.saveSummary = save ? { wave: save.wave, level: save.level, savedAt: save.savedAt } : null;
  }

  setViewport(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
  }

  startNewGame(seed = Date.now() >>> 0): void {
    this.rng = new Rng(seed);
    this.player = createPlayer();
    this.player.y = 200;
    this.monsters = [];
    this.spawnQueue = [];
    this.fx.clear();
    this.nextMonsterId = 1;
    this.monstersDropped = 0;
    this.stats = createDefaultStats();
    this.level = 1;
    this.exp = 0;
    this.pendingLevelUps = 0;
    this.choices = [];
    this.elapsed = 0;
    this.autoPaused = false;
    this.autosaveTimer = 0;
    this.waveKills = 0;
    this.waveTotal = 0;
    this.beginWave(1);
    this.showToast('第 1 波即将开始', 'info', 2);
    this.saveGame(true);
  }

  continueGame(): boolean {
    const save = readSave();
    if (!save) {
      this.refreshSaveInfo();
      return false;
    }
    this.rng = new Rng(save.seed);
    this.player = createPlayer();
    this.player.upgrades = {};
    for (const upgrade of save.upgrades) {
      const stacks = Math.max(0, Math.round(upgrade.stacks));
      for (let i = 0; i < stacks; i += 1) applyUpgrade(this.player, upgrade.id);
      if (stacks > 0) this.player.upgrades[upgrade.id] = stacks;
    }
    // 加成重新应用完后再用存档里的数值覆盖，避免生命/攻击被二次放大
    this.player.maxHp = save.maxHp;
    this.player.hp = clamp(save.hp, 1, save.maxHp);
    this.player.attack = save.attack;
    this.level = save.level;
    this.exp = save.exp;
    this.stats = { ...save.stats };
    this.monsters = [];
    this.spawnQueue = [];
    this.fx.clear();
    this.nextMonsterId = 1;
    this.pendingLevelUps = 0;
    this.choices = [];
    this.elapsed = this.stats.playTime;
    this.autosaveTimer = 0;
    this.beginWave(save.wave);
    this.showToast(`继续游戏：第 ${save.wave} 波`, 'info', 2.4);
    return true;
  }

  restart(): void {
    this.startNewGame();
  }

  deleteSave(): void {
    clearSave();
    this.hasSave = false;
    this.saveSummary = null;
    this.state = 'menu';
    this.monsters.length = 0;
    this.spawnQueue.length = 0;
    this.fx.clear();
    this.pushSnapshot(true);
  }

  backToMenu(): void {
    this.saveGame(true);
    this.state = 'menu';
    this.monsters.length = 0;
    this.spawnQueue.length = 0;
    this.fx.clear();
    this.pushSnapshot(true);
  }

  // ---------------------------------------------------------------- 波次

  beginWave(index: number): void {
    this.wave = Math.max(1, Math.round(index));
    this.wavePlan = planWave(this.wave, this.rng);
    this.spawnQueue = buildSpawnOrder(this.wavePlan, this.rng, WAVE.batchInterval);
    this.spawnTimer = 0;
    this.waveTotal = this.wavePlan.total;
    this.waveKills = 0;
    this.monsters = [];
    this.choices = [];
    this.state = 'prepare';
    this.prepareRemaining = WAVE.prepareTime;
    this.clearRemaining = 0;
    this.centerCameraOnPlayer();
    this.pushSnapshot(true);
  }

  nextWave(): void {
    this.beginWave(this.wave + 1);
  }

  private endWave(): void {
    if (this.state !== 'playing') return;
    this.state = 'waveclear';
    this.clearRemaining = WAVE.clearTime;
    this.stats.bestWave = Math.max(this.stats.bestWave, this.wave);
    this.saveGame(true);
    this.events.emit('waveClear', { wave: this.wave, kills: this.waveKills });
    this.pushSnapshot(true);
  }

  // ---------------------------------------------------------------- 主循环

  update(dt: number): void {
    if (this.disposed) return;

    if (this.input.justPressed('pause')) {
      if (this.state === 'playing' || this.state === 'prepare') this.pause('manual');
      else if (this.state === 'paused') this.resume();
    }

    // 回车：主菜单开始 / 结算进入下一波 / 失败重开
    if (this.input.justPressed('confirm')) {
      if (this.state === 'menu') {
        if (!this.continueGame()) this.startNewGame();
      } else if (this.state === 'waveclear') {
        this.nextWave();
      } else if (this.state === 'gameover') {
        this.restart();
      }
    }

    if (this.state === 'levelup') this.handleChoiceInput();

    switch (this.state) {
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'prepare': {
        this.prepareRemaining = Math.max(0, this.prepareRemaining - dt);
        this.fx.update(dt);
        this.updateCamera(dt);
        if (this.prepareRemaining <= 0) {
          this.state = 'playing';
          this.spawnTimer = 0;
          this.events.emit('waveStart', { wave: this.wave });
        }
        break;
      }
      case 'waveclear': {
        this.clearRemaining = Math.max(0, this.clearRemaining - dt);
        this.fx.update(dt);
        this.updateCamera(dt);
        if (this.clearRemaining <= 0) this.nextWave();
        break;
      }
      case 'menu':
      case 'paused':
      case 'levelup':
      case 'gameover':
        // 时间冻结：不推进任何玩法逻辑
        break;
      default:
        break;
    }

    if (this.toast) {
      this.toast.t = Math.max(0, this.toast.t - dt);
      if (this.toast.t <= 0) this.toast = null;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);

    this.input.endFrame();
    this.snapshotTimer += dt;
    this.pushSnapshot(false);
  }

  private updatePlaying(dt: number): void {
    this.elapsed += dt;
    this.stats.playTime += dt;

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL) {
      this.autosaveTimer = 0;
      this.saveGame(true);
    }

    this.updateSpawns(dt);
    updatePlayer(this, dt);
    if (this.state !== 'playing') return;

    const monsters = this.monsters;
    for (let i = 0; i < monsters.length; i += 1) {
      const monster = monsters[i];
      if (!monster.dead) updateMonster(this, monster, dt);
    }
    separateMonsters(this);
    this.compactMonsters();
    this.fx.update(dt);
    this.updateCamera(dt);

    if (this.state === 'playing' && this.spawnQueue.length === 0 && this.monsters.length === 0) {
      this.endWave();
    }
  }

  /** 原地压缩数组，避免每帧 filter 产生新数组（长时间游玩的内存抖动） */
  private compactMonsters(): void {
    const monsters = this.monsters;
    let write = 0;
    for (let read = 0; read < monsters.length; read += 1) {
      const monster = monsters[read];
      if (monster.dead) continue;
      monsters[write] = monster;
      write += 1;
    }
    monsters.length = write;
  }

  private updateSpawns(dt: number): void {
    this.spawnTimer += dt;
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnTimer) {
      const entry = this.spawnQueue.shift();
      if (!entry) break;
      this.spawnMonster(entry.kind);
    }
  }

  private spawnMonster(kind: MonsterKind): void {
    const def = MONSTER_DEFS[kind];
    const plan = this.wavePlan;
    const scale = {
      hpMul: plan?.hpMul ?? 1,
      dmgMul: plan?.dmgMul ?? 1,
      speedMul: plan?.speedMul ?? 1,
      expMul: plan?.expMul ?? 1,
    };
    const point = findSpawnPoint(this.arena, () => this.rng.next(), {
      w: def.w,
      h: def.h,
      avoidX: rectCenterX(this.player),
      avoidY: rectCenterY(this.player),
      minDistanceFromAvoid: 300,
      preferredDistance: 520 + Math.min(8, this.wave) * 32,
      minDistanceFromOthers: 78,
      others: this.monsters,
    });
    if (!point) return; // 兜底层也失败时直接跳过这一只，保证不会生成在墙里
    const monster = createMonster(this, kind, point.x, point.y, scale);
    this.monsters.push(monster);
    this.fx.spawnBurst(point.x + def.w / 2, point.y + def.h, 10, monster.def.bloodColor, {
      speed: 130,
      size: 3,
      gravity: 420,
      life: 0.45,
    });
  }

  // ---------------------------------------------------------------- 玩家相关

  canPlayerAct(): boolean {
    return this.state === 'playing';
  }

  canPlayerMove(): boolean {
    return this.state === 'playing' || this.state === 'prepare';
  }

  addShake(amount: number): void {
    this.shake = Math.min(18, this.shake + amount);
  }

  emitEvent<K extends keyof WorldEvents>(key: K, payload: WorldEvents[K]): void {
    this.events.emit(key, payload);
  }

  grantExp(amount: number, monster: Monster): void {
    this.exp += amount;
    this.stats.totalExp += amount;
    this.fx.spawnText(rectCenterX(monster), monster.y - 18, `+${amount} EXP`, '#a5d8ff', 11);

    let leveled = false;
    while (this.exp >= expNeeded(this.level)) {
      this.exp -= expNeeded(this.level);
      this.level += 1;
      applyLevelGain(this.player);
      this.pendingLevelUps += 1;
      leveled = true;
    }
    if (!leveled) return;

    if (this.state === 'playing') this.stateBeforeLevelUp = 'playing';
    this.state = 'levelup';
    this.rollChoices();
    this.fx.spawnBurst(rectCenterX(this.player), rectCenterY(this.player), 26, '#ffe08a', {
      speed: 260,
      size: 4,
      gravity: 120,
      life: 0.9,
    });
    this.saveGame(true);
    this.events.emit('levelUp', { level: this.level });
    this.pushSnapshot(true);
  }

  private rollChoices(): void {
    this.choices = rollUpgrades(this.rng, this.player.upgrades, 3);
  }

  private handleChoiceInput(): void {
    if (this.choices.length === 0) return;
    if (this.input.justPressed('choice1')) this.chooseUpgrade(this.choices[0]?.id);
    else if (this.input.justPressed('choice2')) this.chooseUpgrade(this.choices[1]?.id);
    else if (this.input.justPressed('choice3')) this.chooseUpgrade(this.choices[2]?.id);
  }

  chooseUpgrade(id: string | undefined): void {
    if (this.state !== 'levelup' || !id) return;
    if (!applyUpgrade(this.player, id)) return;
    this.events.emit('upgradePicked', { id });
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);

    if (this.pendingLevelUps > 0) {
      this.rollChoices();
      this.pushSnapshot(true);
      return;
    }

    this.choices = [];
    this.state = this.stateBeforeLevelUp === 'levelup' ? 'playing' : this.stateBeforeLevelUp;
    if (this.state === 'playing') this.spawnTimer = 0;
    this.saveGame(true);
    this.pushSnapshot(true);
  }

  onPlayerDeath(): void {
    if (this.state === 'gameover' || this.disposed) return;
    this.state = 'gameover';
    this.stats.deaths += 1;
    this.addShake(12);
    this.fx.spawnBurst(rectCenterX(this.player), rectCenterY(this.player), 24, '#ff6b6b', {
      speed: 300,
      size: 4,
      gravity: 600,
      life: 0.9,
    });
    this.saveGame(true);
    this.events.emit('death', { wave: this.wave, level: this.level });
    this.pushSnapshot(true);
  }

  // ---------------------------------------------------------------- 暂停

  pause(reason: PauseReason = 'manual'): void {
    if (this.state !== 'playing' && this.state !== 'prepare') return;
    this.stateBeforePause = this.state;
    this.state = 'paused';
    this.autoPaused = reason === 'hidden';
    if (reason === 'hidden') this.events.emit('autoPause', { reason });
    this.saveGame(true);
    this.pushSnapshot(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = this.stateBeforePause === 'paused' ? 'playing' : this.stateBeforePause;
    this.autoPaused = false;
    this.input.clear();
    this.pushSnapshot(true);
  }

  togglePause(): void {
    if (this.state === 'paused') this.resume();
    else this.pause('manual');
  }

  /** 窗口/标签页失焦 */
  notifyHidden(): void {
    if (this.state === 'playing' || this.state === 'prepare') {
      this.pause('hidden');
    }
  }

  /** 切回窗口：给玩家几秒准备时间再放怪 */
  notifyVisible(): void {
    if (this.state !== 'paused') return;
    if (this.autoPaused) {
      this.state = 'prepare';
      this.prepareRemaining = WAVE.resumePrepareTime;
      this.autoPaused = false;
      this.input.clear();
      this.showToast('欢迎回来，准备时间', 'info', 2.4);
    }
    this.pushSnapshot(true);
  }

  // ---------------------------------------------------------------- 摄像机

  private centerCameraOnPlayer(): void {
    const targetX = clamp(rectCenterX(this.player) - this.viewW * 0.5, 0, Math.max(0, this.arena.bounds.w - this.viewW));
    const targetY = clamp(rectCenterY(this.player) - this.viewH * 0.6, 0, Math.max(0, this.arena.bounds.h - this.viewH));
    this.cameraX = targetX;
    this.cameraY = targetY;
  }

  private updateCamera(dt: number): void {
    const lookAhead = this.player.facing * 60;
    const targetX = clamp(
      rectCenterX(this.player) + lookAhead - this.viewW * 0.5,
      0,
      Math.max(0, this.arena.bounds.w - this.viewW),
    );
    const targetY = clamp(rectCenterY(this.player) - this.viewH * 0.62, 0, Math.max(0, this.arena.bounds.h - this.viewH));
    this.cameraX = damp(this.cameraX, targetX, 7, dt);
    this.cameraY = damp(this.cameraY, targetY, 5, dt);
  }

  // ---------------------------------------------------------------- 存档

  toSave(): SaveData {
    const upgrades = Object.entries(this.player.upgrades)
      .filter(([, stacks]) => stacks > 0)
      .map(([id, stacks]) => ({ id, stacks }));
    return {
      version: SAVE_VERSION,
      wave: this.wave,
      level: this.level,
      exp: Math.max(0, Math.round(this.exp)),
      hp: Math.max(1, Math.round(this.player.hp)),
      maxHp: Math.round(this.player.maxHp),
      attack: Math.round(this.player.attack * 100) / 100,
      upgrades,
      stats: { ...this.stats },
      seed: this.rng.seed,
      savedAt: Date.now(),
    };
  }

  saveGame(silent = false): void {
    if (this.state === 'menu' && this.wave === 0) return;
    const data = this.toSave();
    const ok = writeSave(data);
    this.hasSave = ok;
    this.saveSummary = ok ? { wave: data.wave, level: data.level, savedAt: data.savedAt } : this.saveSummary;
    if (ok) {
      this.events.emit('saved', { at: data.savedAt });
      if (!silent) this.showToast('进度已保存', 'save', 1.4);
    }
  }

  showToast(text: string, kind: 'info' | 'save' | 'danger' = 'info', duration = 1.6): void {
    this.toast = { text, kind, t: duration };
    this.pushSnapshot(true);
  }

  // ---------------------------------------------------------------- 快照

  buildSnapshot(): HudSnapshot {
    const player = this.player;
    const skills: HudSkill[] = SKILL_ORDER.map((id) => {
      const def = SKILL_DEFS[id];
      const cooldown = player.cooldowns[id];
      return {
        id,
        name: def.name,
        desc: def.desc,
        color: def.color,
        remaining: Math.round(cooldown.remaining * 10) / 10,
        duration: cooldown.duration,
        ready: cooldown.ready,
      };
    });
    return {
      state: this.state,
      wave: this.wave,
      waveTotal: this.waveTotal,
      waveKills: this.waveKills,
      monstersAlive: this.monsters.length,
      pendingSpawns: this.spawnQueue.length,
      level: this.level,
      exp: Math.floor(this.exp),
      expNeed: expNeeded(this.level),
      hp: Math.max(0, Math.round(player.hp)),
      maxHp: Math.round(player.maxHp),
      attack: Math.round(player.attack * 10) / 10,
      skills,
      attackReadyProgress: player.attackCooldown.progress,
      choices: this.choices,
      pendingLevelUps: this.pendingLevelUps,
      prepareRemaining: this.prepareRemaining,
      clearRemaining: this.clearRemaining,
      toast: this.toast ? { text: this.toast.text, kind: this.toast.kind } : null,
      autoPaused: this.autoPaused,
      hasSave: this.hasSave,
      saveSummary: this.saveSummary,
      stats: { ...this.stats },
      elapsed: this.elapsed,
      upgrades: { ...player.upgrades },
    };
  }

  pushSnapshot(force: boolean): void {
    if (this.disposed) return;
    // 界面只需要 10Hz 左右的数据刷新，离散状态变化时再强制推一次
    if (!force && this.snapshotTimer < 0.1) return;
    this.snapshotTimer = 0;
    this.store.set(this.buildSnapshot());
  }

  // ---------------------------------------------------------------- 调试/工具

  /** 给渲染层用：当前可见区域 */
  get viewport(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH };
  }

  /** 只有测试/调试会用到：直接推进若干固定步 */
  step(steps: number): void {
    for (let i = 0; i < steps; i += 1) this.update(FIXED_DT);
  }
}
