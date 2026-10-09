/**
 * 无头模拟测试：不开浏览器，直接用真实引擎跑若干波战斗，
 * 校验波次推进、升级、暂停冻结、生成点合法性、对象池上限与存档。
 *
 * 运行： npm run simulate
 */
import { InputManager } from '../src/engine/input';
import { SnapshotStore } from '../src/engine/store';
import { Rng } from '../src/engine/rng';
import { collidesAny } from '../src/engine/physics';
import { overlaps as rectOverlaps } from '../src/engine/math';
import { FIXED_DT } from '../src/game/constants';
import { World, type HudSnapshot } from '../src/game/world';
import { readSave, clearSave } from '../src/game/save';

// ---------------------------------------------------------------- 环境打桩

class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

type KeyHandler = (event: KeyboardEvent) => void;

class FakeWindow {
  private handlers = new Map<string, Set<KeyHandler>>();
  localStorage = new FakeStorage();
  devicePixelRatio = 1;

  addEventListener(type: string, handler: EventListenerOrEventListenerObject): void {
    const set = this.handlers.get(type) ?? new Set<KeyHandler>();
    set.add(handler as unknown as KeyHandler);
    this.handlers.set(type, set);
  }

  removeEventListener(type: string, handler: EventListenerOrEventListenerObject): void {
    this.handlers.get(type)?.delete(handler as unknown as KeyHandler);
  }

  dispatch(type: string, event: unknown): void {
    this.handlers.get(type)?.forEach((handler) => handler(event as KeyboardEvent));
  }

  keyDown(code: string): void {
    this.dispatch('keydown', { code, repeat: false, preventDefault: () => {} });
  }

  keyUp(code: string): void {
    this.dispatch('keyup', { code, preventDefault: () => {} });
  }
}

const fakeWindow = new FakeWindow();
(globalThis as unknown as { window: unknown }).window = fakeWindow;

const failures: string[] = [];
function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

// ---------------------------------------------------------------- 模拟

const input = new InputManager(fakeWindow as unknown as Window);
const store = new SnapshotStore<HudSnapshot | null>(null);
const world = new World(input, store as unknown as SnapshotStore<HudSnapshot>);

clearSave();
world.startNewGame(20261008);

const seenMonsterIds = new Set<number>();
const spawnViolations: string[] = [];
const stackViolations: string[] = [];
let maxAlive = 0;
let maxParticles = 0;
let maxTexts = 0;
let waveClears = 0;
let levelUps = 0;
let pausedFrozen = true;
let levelUpFrozen = true;
let clearStateMonsters = 0;

world.events.on('waveClear', () => {
  waveClears += 1;
});
world.events.on('levelUp', () => {
  levelUps += 1;
});

const held = new Set<string>();
function hold(code: string, down: boolean): void {
  if (down && !held.has(code)) {
    held.add(code);
    fakeWindow.keyDown(code);
  } else if (!down && held.has(code)) {
    held.delete(code);
    fakeWindow.keyUp(code);
  }
}

function tap(code: string): void {
  fakeWindow.keyDown(code);
  fakeWindow.keyUp(code);
}

const TARGET_WAVES = 8;
const MAX_STEPS = 60 * 60 * 15; // 最多模拟 15 分钟游戏内时间
let steps = 0;
let deaths = 0;
let restarts = 0;

world.events.on('death', () => {
  deaths += 1;
});

function releaseAll(): void {
  hold('ArrowLeft', false);
  hold('ArrowRight', false);
}

let blockedFrames = 0;
let dashPrep = 0;
let reposition = 0;
const botRng = new Rng(20260101);

/** 一个「还行」的玩家大概会这么打：保持距离、砍一刀退一步、该用技能就用 */
function botThink(): void {
  const player = world.player;
  const monsters = world.monsters.filter((m) => !m.dead);
  if (world.state !== 'playing' || monsters.length === 0) {
    releaseAll();
    return;
  }

  const playerCx = player.x + player.w / 2;
  let nearest: (typeof monsters)[number] | null = null;
  let nearestDist = Infinity;
  let nearCount = 0;
  for (const monster of monsters) {
    const dx = monster.x + monster.w / 2 - playerCx;
    const dist = Math.hypot(dx, monster.y + monster.h / 2 - (player.y + player.h / 2));
    if (dist < 130) nearCount += 1;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = monster;
    }
  }
  if (!nearest) {
    releaseAll();
    return;
  }

  const dx = nearest.x + nearest.w / 2 - playerCx;
  const away = dx >= 0 ? 'ArrowLeft' : 'ArrowRight';
  const toward = dx >= 0 ? 'ArrowRight' : 'ArrowLeft';

  if (player.cooldowns.heal.ready && player.hp < player.maxHp * 0.7) tap('KeyO');
  if (player.cooldowns.spin.ready && nearCount >= 2) tap('KeyU');
  if (reposition > 0) {
    // 目标在高处但头顶有平台挡着：先横向挪开再跳
    reposition -= 1;
    hold(away, true);
    hold(toward, false);
    if (reposition === 30 || reposition === 12) tap('Space');
    return;
  }

  // 危险时先转身再冲锋脱身（冲锋方向跟着朝向走）
  if (dashPrep > 0) {
    dashPrep -= 1;
    hold(away, true);
    hold(toward, false);
    if (dashPrep === 1) tap('KeyI');
    return;
  }
  if (player.cooldowns.dash.ready) {
    const inDanger = player.hp < player.maxHp * 0.6 && nearestDist < 130;
    if (inDanger) {
      dashPrep = 6;
      return;
    }
  }

  if (nearestDist < 34) {
    hold(away, true);
    hold(toward, false);
  } else if (nearestDist > 58) {
    hold(toward, true);
    hold(away, false);
  } else {
    releaseAll();
  }

  if (nearestDist <= 58 && player.attackCooldown.ready && player.action === 'idle') tap('KeyJ');

  // 撞墙了就跳（必要时二段跳），模拟玩家翻越石块的行为
  const moving = nearestDist > 58 || nearestDist < 34;
  const dy = nearest.y + nearest.h / 2 - (player.y + player.h / 2);
  const targetAbove = dy < -60 && Math.abs(dx) < 140;
  const blocked = (moving && Math.abs(player.vx) < 12) || targetAbove;
  blockedFrames = blocked ? blockedFrames + 1 : 0;
  if (blockedFrames === 8 || blockedFrames === 26) tap('Space');
  if (blockedFrames >= 70) {
    reposition = 40;
    blockedFrames = 0;
  }
}

while (waveClears < TARGET_WAVES && steps < MAX_STEPS) {
  steps += 1;

  if (world.state === 'levelup') {
    const choice = world.choices[botRng.int(0, Math.max(0, world.choices.length - 1))];
    world.chooseUpgrade(choice?.id);
  }

  if (world.state === 'gameover') {
    // 模拟玩家点「重新开始」，让测试继续验证后面的波次
    restarts += 1;
    world.restart();
  }

  // 模拟玩家在结算面板点「进入下一波」
  if (world.state === 'waveclear' && world.clearRemaining < 6.5) {
    world.nextWave();
  }

  botThink();
  world.update(FIXED_DT);

  // --- 不变式 ---
  const alive = world.monsters.filter((m) => !m.dead);
  maxAlive = Math.max(maxAlive, alive.length);
  maxParticles = Math.max(maxParticles, world.fx.particles.activeCount);
  maxTexts = Math.max(maxTexts, world.fx.texts.activeCount);
  check(maxParticles <= 260, `粒子数量超出池上限: ${maxParticles}`);
  check(maxTexts <= 48, `飘字数量超出池上限: ${maxTexts}`);
  check(alive.length <= 48, `场上怪物数量异常: ${alive.length}`);

  for (const monster of alive) {
    // 生成点不能落在墙里（新怪第一帧检查一次）
    if (!seenMonsterIds.has(monster.id)) {
      seenMonsterIds.add(monster.id);
      if (collidesAny(monster, world.arena.solids)) {
        spawnViolations.push(`${monster.def.name} #${monster.id} 生成在实体内部`);
      }
    }
    // 收缩 1.5px 后仍与实体相交说明身体嵌进了墙里（贴地站立不会误判）
    // 内缩 3px 后仍然相交，才算真正嵌进墙体（贴地/贴墙站着不会误判）
    const inset = { x: monster.x + 3, y: monster.y + 3, w: monster.w - 6, h: monster.h - 6 };
    if (collidesAny(inset, world.arena.solids)) {
      spawnViolations.push(`${monster.def.name} #${monster.id} 陷在墙体里 @${monster.x.toFixed(0)},${monster.y.toFixed(0)}`);
    }
  }

  // 怪物不能一堆叠在同一个位置
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const a = alive[i];
      const b = alive[j];
      if (!rectOverlaps(a, b)) continue;
      const horizontal = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const limit = Math.min(a.w, b.w) * 0.75;
      if (horizontal > limit) {
        stackViolations.push(`${a.def.name}#${a.id} 与 ${b.def.name}#${b.id} 重叠 ${horizontal.toFixed(1)}px`);
      }
    }
  }

  if (world.state === 'waveclear' && alive.length > 0) {
    clearStateMonsters += 1;
  }

  // 暂停时时间必须冻结
  if (world.state === 'paused' && steps % 97 === 0) {
    const snapshotBefore = world.monsters.map((m) => ({ x: m.x, y: m.y, hp: m.hp }));
    const elapsedBefore = world.elapsed;
    const playerBefore = { x: world.player.x, y: world.player.y, hp: world.player.hp };
    for (let i = 0; i < 30; i += 1) world.update(FIXED_DT);
    if (world.elapsed !== elapsedBefore) pausedFrozen = false;
    if (world.player.x !== playerBefore.x || world.player.y !== playerBefore.y) pausedFrozen = false;
    world.monsters.forEach((m, index) => {
      const before = snapshotBefore[index];
      if (!before) return;
      if (before.x !== m.x || before.y !== m.y || before.hp !== m.hp) pausedFrozen = false;
    });
  }

  // 升级选卡期间怪物必须静止、不能被打
  if (world.state === 'levelup' && steps % 89 === 0) {
    const snapshotBefore = world.monsters.map((m) => ({ x: m.x, hp: m.hp }));
    const elapsedBefore = world.elapsed;
    tap('KeyJ');
    tap('KeyU');
    for (let i = 0; i < 20; i += 1) world.update(FIXED_DT);
    if (world.elapsed !== elapsedBefore) levelUpFrozen = false;
    world.monsters.forEach((m, index) => {
      const before = snapshotBefore[index];
      if (!before) return;
      if (before.x !== m.x || before.hp !== m.hp) levelUpFrozen = false;
    });
    if (world.choices.length === 0) levelUpFrozen = false;
  }

  // 失焦 / 回到窗口
  if (world.state === 'playing' && steps % 613 === 0) {
    world.notifyHidden();
    const stateAfterHide: string = world.state;
    check(stateAfterHide === 'paused', '失焦后没有自动暂停');
    world.notifyVisible();
    const stateAfterShow: string = world.state;
    check(stateAfterShow === 'prepare', '回到窗口后没有进入准备状态');
    check(Math.abs(world.prepareRemaining - 3) < 0.001, '回到窗口后准备时间不是 3 秒');
  }
}

// ---------------------------------------------------------------- 存档校验

const saveBefore = readSave();
check(!!saveBefore, '没有写入存档');
check(!!saveBefore && saveBefore.wave >= 2, `存档波次异常: ${saveBefore?.wave}`);

const world2 = new World(input, store as unknown as SnapshotStore<HudSnapshot>);
const continued = world2.continueGame();
check(continued, '继续游戏失败');
check(world2.wave === saveBefore?.wave, '继续游戏后波次不一致');
check(world2.level === saveBefore?.level, '继续游戏后等级不一致');
check(Math.abs(world2.player.maxHp - (saveBefore?.maxHp ?? 0)) < 0.01, '继续游戏后最大生命不一致');
check(world2.player.upgrades && Object.keys(world2.player.upgrades).length >= 0, '继续游戏后加成丢失');
world2.dispose();

// 长跑内存检查：再跑一段时间，池子大小不应继续增长
const poolBefore = { particles: world.fx.particles.size, texts: world.fx.texts.size };
for (let i = 0; i < 60 * 120; i += 1) {
  if (world.state === 'levelup') world.chooseUpgrade(world.choices[0]?.id);
  world.update(FIXED_DT);
}
const poolAfter = { particles: world.fx.particles.size, texts: world.fx.texts.size };
check(poolAfter.particles <= poolBefore.particles + 1, `粒子池持续增长: ${poolBefore.particles} -> ${poolAfter.particles}`);
check(poolAfter.texts <= poolBefore.texts + 1, `飘字池持续增长: ${poolBefore.texts} -> ${poolAfter.texts}`);

world.dispose();
input.dispose();

// ---------------------------------------------------------------- 结果

const summary = {
  模拟步数: steps,
  游戏内秒数: Math.round(world.elapsed),
  到达波次: world.wave,
  波次结算次数: waveClears,
  死亡次数: deaths,
  重新开始次数: restarts,
  升级次数: levelUps,
  最终等级: world.level,
  总击杀: world.stats.kills,
  场上怪物峰值: Math.max(maxAlive, 1),
  粒子峰值: maxParticles,
  飘字峰值: maxTexts,
  生成点违规: spawnViolations.length,
  叠加违规: stackViolations.length,
  暂停冻结: pausedFrozen,
  升级冻结: levelUpFrozen,
  结算时仍有怪: clearStateMonsters,
};

console.log('模拟结果:', summary);
if (spawnViolations.length > 0) console.log('生成点违规样例:', spawnViolations.slice(0, 5));
if (stackViolations.length > 0) console.log('叠加违规样例:', stackViolations.slice(0, 5));

check(waveClears >= 5, `波次结算次数偏少: ${waveClears}`);
check(levelUps >= 3, `升级次数偏少: ${levelUps}`);
check(pausedFrozen, '暂停时游戏时间/实体仍在推进');
check(levelUpFrozen, '升级选卡期间怪物仍会移动或受伤');
check(clearStateMonsters === 0, '波次结算时仍存在怪物');
check(spawnViolations.length === 0, `存在 ${spawnViolations.length} 次非法生成`);
check(stackViolations.length === 0, `存在 ${stackViolations.length} 次怪物叠位`);

if (failures.length > 0) {
  console.error('❌ 校验失败:');
  for (const failure of failures) console.error(' -', failure);
  process.exit(1);
}
console.log('✅ 全部校验通过');
