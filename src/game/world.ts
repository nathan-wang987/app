import {
  AUTOSAVE_INTERVAL,
  MAX_ALIVE_ENEMIES,
  RESUME_PREP_TIME,
  SKILLS,
  GROUND_Y,
  PLAYER_START_X,
  xpForLevel
} from './constants';
import { Effects } from './effects';
import { EnemyManager } from './enemies';
import { createPlayer } from './player';
import { createModifiers, getUpgrade, rollUpgradeChoices } from './upgrades';
import { SKILL_IDS, resolveCooldown, resolveDashDamage, resolveSpinDamage, tickCooldowns, DASH_KNOCKBACK } from './skills';
import { resolveSkillHitbox } from './combat';
import type { CombatEnv } from './combat';
import { addExperience, LEVEL_ATTACK_GAIN, LEVEL_HP_GAIN, recomputeStats } from './leveling';
import { WaveManager } from './waves';
import { clearRun, loadMeta, loadRun, saveMeta, saveRun } from './save';
import { updatePlayer } from './player';
import { Emitter } from '../engine/emitter';
import { Rng } from '../engine/rng';
import { InputManager, type ActionName } from '../engine/input';
import type {
  Enemy,
  GamePhase,
  HudSnapshot,
  Player,
  PlayerModifiers,
  SkillId,
  UpgradeId
} from './types';

interface WorldEvents {
  /** 任何会影响 UI 的状态变化（相位、暂停、选择项等）。 */
  changed: void;
  /** 需要让 React 立刻刷新的提示（例如升级）。 */
  notice: string;
}

const SKILL_ACTION: Record<string, SkillId> = {
  skill1: 'spin',
  skill2: 'dash',
  skill3: 'heal'
};

/**
 * 游戏世界：唯一的可变状态容器。
 * React 只读取快照 + 触发意图，Canvas 只读取状态绘制，
 * 所有规则（相位、时间、冷却、存档）都在这里收口。
 */
export class World {
  readonly input: InputManager;
  readonly effects = new Effects();
  readonly enemies = new EnemyManager();
  readonly events = new Emitter<WorldEvents>();
  readonly rng = new Rng();

  player: Player = createPlayer();
  mods: PlayerModifiers = createModifiers();

  phase: GamePhase = 'menu';
  /** 手动暂停（ESC / P）。 */
  paused = false;
  /** 窗口失焦导致的自动暂停。 */
  autoPaused = false;
  /** 切回窗口后的准备倒计时，>0 时世界完全冻结。 */
  resumeCountdown = 0;

  wave = 1;
  kills = 0;
  totalKills = 0;
  elapsed = 0;
  bestWave = 1;
  runsPlayed = 0;

  upgradeChoices: UpgradeId[] = [];
  private pendingLevelUps = 0;
  private levelHpBonus = 0;
  private levelAttackBonus = 0;

  waveSummary: { wave: number; kills: number; time: number } | null = null;
  lastRun: { wave: number; level: number; kills: number } | null = null;
  hasSave = false;

  private readonly waves = new WaveManager();
  private readonly env: CombatEnv;
  private autosaveTimer = 0;
  private waveTime = 0;
  private disposed = false;

  constructor(input: InputManager) {
    this.input = input;
    this.env = {
      player: this.player,
      enemies: this.enemies.enemies,
      effects: this.effects,
      rng: this.rng,
      mods: this.mods,
      onEnemyKilled: (enemy) => this.handleEnemyKilled(enemy),
      onPlayerDied: () => this.handlePlayerDied()
    };

    const meta = loadMeta();
    this.bestWave = meta.bestWave;
    this.totalKills = meta.totalKills;
    this.runsPlayed = meta.runs;

    const save = loadRun();
    if (save) {
      this.hasSave = true;
      this.lastRun = { wave: save.wave, level: save.level, kills: save.kills };
    }
    this.spawnPlayerAtStart();
  }

  // ---------------------------------------------------------------- 生命周期

  /** 从标题界面开始：resume 为 true 时读取存档继续，否则开新档。 */
  startRun(resume: boolean): void {
    if (resume && this.hasSave) {
      const save = loadRun();
      if (save) {
        this.applySave(save.wave, save.level, save.xp, save.xpToNext, save.hp, save.kills, save.elapsed, save.mods, save.levelHpBonus, save.levelAttackBonus);
        this.beginWave(save.wave);
        this.phase = 'playing';
        this.emitChanged();
        return;
      }
    }
    if (!resume) {
      clearRun();
      this.runsPlayed += 1;
      saveMeta({ bestWave: this.bestWave, totalKills: this.totalKills, runs: this.runsPlayed });
      this.resetRunState();
      this.beginWave(1);
      this.phase = 'playing';
      this.emitChanged();
    }
  }

  /** 本波结算完成 → 进入下一波（需求 5 / 6）。 */
  startNextWave(): void {
    if (this.phase !== 'waveClear') return;
    this.waveSummary = null;
    this.beginWave(this.wave + 1);
    this.phase = 'playing';
    this.emitChanged();
  }

  /** 升级三选一（需求 5）。必须选完才能继续。 */
  chooseUpgrade(id: UpgradeId): void {
    if (this.phase !== 'levelUp') return;
    const upgrade = getUpgrade(id);
    if (upgrade && (this.mods.taken[id] ?? 0) < upgrade.maxStacks) {
      upgrade.apply(this.mods);
      // 生命类加成同时回复等量生命，让选择手感更直接。
      if (id === 'vitality') this.player.hp += 20;
      recomputeStats(this.player, this.mods, this.levelHpBonus, this.levelAttackBonus);
      if (this.player.hp > this.player.maxHp) this.player.hp = this.player.maxHp;
    }

    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    if (this.pendingLevelUps > 0) {
      // 一次拿到多级经验：连续弹几次三选一。
      this.upgradeChoices = rollUpgradeChoices(this.rng, this.mods);
    } else {
      this.upgradeChoices = [];
      this.phase = 'playing';
    }
    this.persistRun();
    this.emitChanged();
  }

  togglePause(force?: boolean): void {
    if (this.phase !== 'playing') return;
    this.paused = force ?? !this.paused;
    if (this.paused) this.persistRun();
    this.emitChanged();
  }

  /** 从暂停 / 自动暂停中恢复；若是自动暂停则给几秒准备时间（需求 8）。 */
  resume(): void {
    if (this.phase === 'gameOver' || this.phase === 'menu') return;
    if (this.autoPaused) {
      this.autoPaused = false;
      this.paused = false;
      this.resumeCountdown = this.phase === 'playing' ? RESUME_PREP_TIME : 0;
    } else {
      this.paused = false;
    }
    this.emitChanged();
  }

  /** 窗口失焦 / 回到页面（需求 8）。 */
  setSuspended(suspended: boolean): void {
    if (suspended) {
      if (this.phase === 'playing' || this.phase === 'waveClear' || this.phase === 'levelUp') {
        this.autoPaused = true;
        this.persistRun();
      }
      return;
    }
    if (this.autoPaused) {
      this.autoPaused = false;
      this.paused = false;
      // 给玩家几秒准备时间，倒计时期间时间不流动。
      this.resumeCountdown = this.phase === 'playing' ? RESUME_PREP_TIME : 0;
      this.emitChanged();
    }
  }

  /** 阵亡后重开（清档）。 */
  restart(): void {
    this.runsPlayed += 1;
    this.resetRunState();
    this.beginWave(1);
    this.phase = 'playing';
    this.emitChanged();
  }

  /** 回到标题界面并保留存档。 */
  toMenu(): void {
    this.persistRun();
    this.hasSave = true;
    this.lastRun = { wave: this.wave, level: this.player.level, kills: this.kills };
    this.phase = 'menu';
    this.paused = false;
    this.autoPaused = false;
    this.resumeCountdown = 0;
    this.emitChanged();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enemies.reset();
    this.effects.clear();
    this.events.clear();
  }

  // ---------------------------------------------------------------- 每帧驱动

  update(dt: number): void {
    if (this.disposed) return;

    // 暂停 / 自动暂停：时间完全不推进（需求 6 / 8）。
    if (this.paused || this.autoPaused) return;

    if (this.resumeCountdown > 0) {
      this.resumeCountdown = Math.max(0, this.resumeCountdown - dt);
      this.input.endFrame(dt);
      if (this.resumeCountdown === 0) this.emitChanged();
      return;
    }

    if (this.input.wasPressed('pause') && this.phase === 'playing') {
      this.togglePause(true);
      this.input.endFrame(dt);
      return;
    }

    switch (this.phase) {
      case 'menu':
      case 'gameOver':
        // 只让残余粒子自然消失，不推进任何战斗逻辑。
        this.effects.update(dt);
        break;
      case 'waveClear':
      case 'levelUp':
        this.effects.update(dt);
        break;
      case 'playing':
        this.simulate(dt);
        break;
      default:
        break;
    }

    this.input.endFrame(dt);
  }

  private simulate(dt: number): void {
    const player = this.player;
    tickCooldowns(player, dt);

    const moveDir = (this.input.isHeld('right') ? 1 : 0) - (this.input.isHeld('left') ? 1 : 0);
    const skillRequests: SkillId[] = [];
    for (const [action, id] of Object.entries(SKILL_ACTION)) {
      if (this.input.wasPressed(action as ActionName)) {
        if (player.cooldowns[id] > 0) {
          this.effects.text(player.x + player.w / 2, player.y - 12, `${SKILLS[id].name}冷却中`, '#9fb0c4', 5);
        } else {
          this.effects.text(player.x + player.w / 2, player.y - 12, SKILLS[id].name, SKILLS[id].color, 6);
        }
        skillRequests.push(id);
      }
    }

    this.env.mods = this.mods;
    updatePlayer(player, dt, {
      input: {
        jumpPressed: this.input.wasPressed('jump'),
        jumpHeld: this.input.isHeld('jump'),
        attackPressed: this.input.wasPressed('attack'),
        moveDir,
        skillRequests
      },
      mods: this.mods,
      effects: this.effects,
      env: this.env,
      canAct: true
    });

    // 持续型的技能判定（旋风斩 / 冲锋）。
    if (player.state === 'spin') {
      resolveSkillHitbox(player, this.mods, this.env, resolveSpinDamage(player, this.mods), 70);
    } else if (player.state === 'dash') {
      resolveSkillHitbox(player, this.mods, this.env, resolveDashDamage(player, this.mods), DASH_KNOCKBACK);
    }

    this.waves.update(dt, this.enemies.aliveCount, (kind) => this.trySpawn(kind));
    this.enemies.update(dt, player, this.env, true, this.effects);
    this.effects.update(dt);

    if (player.x < 0) player.x = 0;
    if (player.x + player.w > 1920) player.x = 1920 - player.w;
    if (player.y > GROUND_Y + 40) {
      // 兜底：意外掉出地面时送回场地。
      player.y = GROUND_Y - player.h - 2;
      player.vy = 0;
    }

    this.elapsed += dt;
    this.waveTime += dt;
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL) {
      this.autosaveTimer = 0;
      this.persistRun();
    }

    if (player.state === 'dead') {
      this.phase = 'gameOver';
      this.finishRun();
      return;
    }

    // 本波清空 → 结算相位（此时不能攻击，时间也不再推进）。
    if (this.waves.remaining === 0 && this.enemies.aliveCount === 0) {
      this.waveSummary = { wave: this.wave, kills: this.waves.killCount, time: this.waveTime };
      this.phase = 'waveClear';
      if (this.wave > this.bestWave) this.bestWave = this.wave;
      saveMeta({ bestWave: this.bestWave, totalKills: this.totalKills, runs: this.runsPlayed });
      this.persistRun();
      this.emitChanged();
    }
  }

  // ---------------------------------------------------------------- 事件回调

  private trySpawn(kind: Enemy['kind']): boolean {
    const x = this.enemies.findSpawnX(kind, this.player, this.rng);
    if (x === null) return false;
    const enemy = this.enemies.spawn(kind, this.wave, x, this.rng);
    if (!enemy) return false;
    this.effects.burst(x + enemy.w / 2, GROUND_Y - enemy.h * 0.4, 6, '#c9b6ff', {
      speed: 60,
      size: 2,
      life: 0.4,
      gravity: 60
    });
    return true;
  }

  private handleEnemyKilled(enemy: Enemy): void {
    this.kills += 1;
    this.totalKills += 1;
    this.waves.registerKill();
    const gain = Math.max(1, Math.round(enemy.xp * (1 + this.mods.xpGain)));
    this.effects.text(enemy.x + enemy.w / 2, enemy.y - 14, `+${gain} exp`, '#c9b6ff', 5);

    const levels = addExperience(this.player, gain);
    if (levels > 0) this.handleLevelUp(levels);
  }

  private handleLevelUp(levels: number): void {
    for (let i = 0; i < levels; i += 1) {
      this.levelHpBonus += LEVEL_HP_GAIN;
      this.levelAttackBonus += LEVEL_ATTACK_GAIN;
    }
    recomputeStats(this.player, this.mods, this.levelHpBonus, this.levelAttackBonus);
    this.player.hp = this.player.maxHp; // 升级回满血（需求 5）
    this.effects.ring(
      this.player.x + this.player.w / 2,
      this.player.y + this.player.h * 0.5,
      18,
      10,
      '#ffe066',
      0.9
    );
    this.effects.text(this.player.x + this.player.w / 2, this.player.y - 16, 'LEVEL UP!', '#ffe066', 6);

    this.pendingLevelUps += levels;
    this.hasSave = true;
    if (this.phase === 'playing') {
      this.upgradeChoices = rollUpgradeChoices(this.rng, this.mods);
      this.phase = 'levelUp';
      this.events.emit('notice', '升级！选择一个加成');
      this.persistRun();
      this.emitChanged();
    }
  }

  private handlePlayerDied(): void {
    // 死亡动画播放一小段后再进结算界面（在 simulate 中切换相位）。
  }

  private finishRun(): void {
    clearRun();
    this.hasSave = false;
    this.lastRun = { wave: this.wave, level: this.player.level, kills: this.kills };
    if (this.wave > this.bestWave) this.bestWave = this.wave;
    saveMeta({ bestWave: this.bestWave, totalKills: this.totalKills, runs: this.runsPlayed });
    this.emitChanged();
  }

  // ---------------------------------------------------------------- 内部工具

  private resetRunState(): void {
    this.player = createPlayer();
    this.mods = createModifiers();
    this.env.player = this.player;
    this.env.enemies = this.enemies.enemies;
    this.env.mods = this.mods;
    this.levelHpBonus = 0;
    this.levelAttackBonus = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.waveTime = 0;
    this.wave = 1;
    this.waveSummary = null;
    this.upgradeChoices = [];
    this.pendingLevelUps = 0;
    this.paused = false;
    this.autoPaused = false;
    this.resumeCountdown = 0;
    this.autosaveTimer = 0;
    this.waves.reset();
    this.enemies.reset();
    this.enemies.trimPool();
    this.effects.clear();
    this.spawnPlayerAtStart();
  }

  private spawnPlayerAtStart(): void {
    this.player.x = PLAYER_START_X;
    this.player.y = GROUND_Y - this.player.h;
    this.player.vx = 0;
    this.player.vy = 0;
  }

  private applySave(
    wave: number,
    level: number,
    xp: number,
    xpToNext: number,
    hp: number,
    kills: number,
    elapsed: number,
    mods: PlayerModifiers,
    levelHpBonus: number,
    levelAttackBonus: number
  ): void {
    this.enemies.reset();
    this.effects.clear();
    this.waves.reset();
    this.player = createPlayer();
    this.env.player = this.player;
    this.env.enemies = this.enemies.enemies;
    this.mods = mods;
    this.env.mods = mods;
    this.levelHpBonus = levelHpBonus;
    this.levelAttackBonus = levelAttackBonus;
    this.player.level = level;
    this.player.xp = xp;
    this.player.xpToNext = xpToNext || xpForLevel(level);
    recomputeStats(this.player, mods, levelHpBonus, levelAttackBonus);
    this.player.hp = Math.min(this.player.maxHp, Math.max(1, hp));
    this.kills = kills;
    this.elapsed = elapsed;
    this.waveTime = 0;
    this.wave = Math.max(1, wave);
    this.paused = false;
    this.autoPaused = false;
    this.spawnPlayerAtStart();
  }

  private beginWave(wave: number): void {
    this.wave = wave;
    this.waveTime = 0;
    this.waves.begin(wave, this.rng);
    this.player.cooldowns.spin = Math.min(this.player.cooldowns.spin, 1);
    this.player.cooldowns.dash = Math.min(this.player.cooldowns.dash, 1);
    this.player.cooldowns.heal = Math.min(this.player.cooldowns.heal, 2);
    this.player.invuln = Math.max(this.player.invuln, 1);
    this.player.state = 'idle';
    this.player.stateTime = 0;
    this.spawnPlayerAtStart();
  }

  private persistRun(): void {
    if (this.phase === 'menu' || this.phase === 'gameOver') return;
    saveRun({
      wave: this.wave,
      level: this.player.level,
      xp: this.player.xp,
      xpToNext: this.player.xpToNext,
      hp: Math.max(1, Math.round(this.player.hp)),
      levelHpBonus: this.levelHpBonus,
      levelAttackBonus: this.levelAttackBonus,
      kills: this.kills,
      elapsed: this.elapsed,
      mods: this.mods
    });
    this.hasSave = true;
  }

  private emitChanged(): void {
    this.events.emit('changed', undefined);
  }

  // ---------------------------------------------------------------- UI 快照

  getSnapshot(): HudSnapshot {
    const choices = this.upgradeChoices.map((id) => {
      const up = getUpgrade(id);
      return {
        id,
        name: up?.name ?? id,
        description: up?.description ?? '',
        rarity: up?.rarity ?? 'common'
      };
    });

    return {
      phase: this.phase,
      paused: this.paused,
      autoPaused: this.autoPaused,
      resumeCountdown: this.resumeCountdown,
      hp: Math.max(0, Math.round(this.player.hp)),
      maxHp: Math.round(this.player.maxHp),
      level: this.player.level,
      xp: Math.round(this.player.xp),
      xpToNext: Math.round(this.player.xpToNext),
      wave: this.wave,
      enemiesLeft: this.enemies.aliveCount + this.waves.remaining,
      kills: this.kills,
      totalKills: this.totalKills,
      elapsed: this.elapsed,
      cooldowns: {
        spin: { remaining: this.player.cooldowns.spin, total: resolveCooldown('spin', this.mods) },
        dash: { remaining: this.player.cooldowns.dash, total: resolveCooldown('dash', this.mods) },
        heal: { remaining: this.player.cooldowns.heal, total: resolveCooldown('heal', this.mods) }
      },
      upgradeChoices: this.upgradeChoices,
      upgradeLabels: choices,
      waveSummary: this.waveSummary,
      bestWave: this.bestWave,
      hasSave: this.hasSave,
      lastRun: this.lastRun
    };
  }

  /** 供渲染层使用的只读视图。 */
  get view() {
    return {
      player: this.player,
      enemies: this.enemies.enemies,
      effects: this.effects,
      phase: this.phase,
      skillIds: SKILL_IDS,
      maxAlive: MAX_ALIVE_ENEMIES
    };
  }
}
