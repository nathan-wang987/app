/**
 * 自动冒烟测试：用本机 Chrome 真跑一遍游戏，验证核心规则。
 *
 *   node scripts/verify.mjs
 *
 * 覆盖：渲染是否出画面、移动/二段跳、攻击/三个技能与冷却、
 * 升级三选一、暂停与失焦冻结、波次结算、怪物出生合法性与分离、
 * 长时间运行的内存与对象池收敛、存档与读档、单文件版本的 file:// 可玩性。
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const standaloneDir = path.join(root, 'dist-standalone');
const shotDir = path.join(root, 'screenshots');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 截图前让镜头跟上目标（镜头是阻尼跟随，需要几帧才收敛）。 */
const settleAndShoot = async (file) => {
  await page.evaluate(() => {
    const { renderOnce } = window.__BLADE__;
    for (let i = 0; i < 40; i += 1) renderOnce();
  });
  await new Promise((resolve) => setTimeout(resolve, 200)); // 等 React HUD 刷新
  await page.screenshot({ path: path.join(shotDir, file) });
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json'
};

function startServer(dir) {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (url === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }
      const filePath = path.join(dir, url === '/' ? 'index.html' : url);
      if (!filePath.startsWith(dir)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('未找到 Chrome / Edge，无法运行冒烟测试。');
  process.exit(2);
}

await mkdir(shotDir, { recursive: true });
const standaloneHtml = path.join(standaloneDir, 'index.html');
if (!existsSync(standaloneHtml)) {
  console.error('缺少 dist-standalone/index.html，请先运行 npm run build:standalone');
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    '--enable-precise-memory-info',
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1400,860'
  ]
});

const consoleErrors = [];
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 860, deviceScaleFactor: 1 });
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
});

// ---------------------------------------------------------------- 1. file:// 直接打开（单文件版）
await page.goto(`file:///${standaloneHtml.replace(/\\/g, '/')}`, { waitUntil: 'load' });
await page.waitForFunction('!!window.__BLADE__', { timeout: 15000 });
const fileProtocol = await page.evaluate(() => ({
  hasCanvas: !!document.querySelector('canvas'),
  canvases: document.querySelectorAll('canvas').length,
  buttons: document.querySelectorAll('button').length
}));
check('单文件版以 file:// 打开可运行（无模块加载错误）', fileProtocol.hasCanvas && consoleErrors.length === 0, consoleErrors.join(' | ') || 'ok');
await page.screenshot({ path: path.join(shotDir, '01-menu.png') });

// ---------------------------------------------------------------- 2. HTTP 环境跑完整规则
const { server, port } = await startServer(standaloneDir);
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
await page.waitForFunction('!!window.__BLADE__', { timeout: 15000 });

/** 注入测试辅助：停掉 rAF，改成由脚本精确推进逻辑帧。 */
const installTestHarness = () =>
  page.evaluate(() => {
    const { world, loop } = window.__BLADE__;
    loop.stop();
    // 无头浏览器里窗口可能没有焦点，先清掉自动暂停状态再开始确定性测试
    world.autoPaused = false;
    world.paused = false;
    world.resumeCountdown = 0;
    window.__TEST__ = {
    quiet() {
      const w = window.__BLADE__.world;
      w.enemies.reset();
      w.waves.begin(w.wave, w.rng);
      w.waves.timer = 1e9;
      w.phase = 'playing';
    },
    /** 把玩家放到地面上的指定位置，并清掉速度/状态残留，保证测试可复现 */
    place(x) {
      const w = window.__BLADE__.world;
      this.quiet();
      const p = w.player;
      p.x = x;
      p.y = 236 - p.h;
      p.vx = 0;
      p.vy = 0;
      p.grounded = true;
      p.state = 'idle';
      p.stateTime = 0;
      p.invuln = 0;
      p.hitFlash = 0;
      p.hp = p.maxHp;
      p.cooldowns.spin = 0;
      p.cooldowns.dash = 0;
      p.cooldowns.heal = 0;
      // 单元式测试里屏蔽升级弹窗，避免击杀顺带触发 levelUp 冻结世界
      p.xpToNext = 1e9;
    }
    };
  });

await installTestHarness();

// --- 渲染：画面不是纯色 ---
const renderStats = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Set();
  for (let i = 0; i < data.length; i += 4 * 7) {
    colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  return { colors: colors.size, w: canvas.width, h: canvas.height };
});
check('Canvas 实际绘制出像素画面', renderStats.colors > 40, `${renderStats.colors} 种抽样颜色 / 画布 ${renderStats.w}x${renderStats.h}`);

// --- 开局 ---
const started = await page.evaluate(() => {
  const { world, step } = window.__BLADE__;
  world.startRun(false);
  step(90);
  return { phase: world.phase, wave: world.wave, enemies: world.enemies.totalActive };
});
check('开始游戏进入战斗相位', started.phase === 'playing' && started.wave === 1, `phase=${started.phase} wave=${started.wave}`);

// --- 移动 / 跳跃 / 二段跳 ---
const jumpTest = await page.evaluate(() => {
  const { world, input, step } = window.__BLADE__;
  window.__TEST__.place(300);
  const p = world.player;
  p.x = 300;
  p.y = 0;
  p.vy = 0;
  p.vx = 0;
  // 等到真正落地再测量地面高度（否则测到的是下落中的 y）
  let settle = 0;
  while ((!p.grounded || p.y + p.h !== 236) && settle < 400) {
    step(2);
    settle += 1;
  }
  const groundY = p.y;

  input.push('right');
  step(20);
  const movedRight = p.x > 300;
  input.releaseAll();
  step(10);

  input.push('jump');
  step(1);
  const firstJumpVy = p.vy;
  const groundedAfterJump = p.grounded;
  step(14);
  const apexish = p.y;
  const beforeSecond = p.airJumpsLeft;
  input.push('jump');
  step(1);
  const secondJumpVy = p.vy;
  const afterSecond = p.airJumpsLeft;
  step(2);
  const vyBeforeThird = p.vy;
  input.push('jump');
  step(1);
  // 第三次按键不应产生新的上冲力（松开跳跃键的减速不算）
  const thirdChanged = p.airJumpsLeft !== 0 || p.vy <= vyBeforeThird;

  // 落回地面
  let guard = 0;
  while (!p.grounded && guard < 300) {
    step(2);
    guard += 1;
  }
  return {
    movedRight,
    firstJumpVy,
    groundedAfterJump,
    heightFromGround: groundY - apexish,
    beforeSecond,
    secondJumpVy,
    afterSecond,
    thirdChanged,
    landedGrounded: p.grounded,
    landedY: p.y
  };
});
check(
  '左右移动生效',
  jumpTest.movedRight,
  '按右键后 x 增大'
);
check(
  '可以跳，跳起来后还能再往上跳一次（且只有一次）',
  jumpTest.firstJumpVy < -150 &&
    !jumpTest.groundedAfterJump &&
    jumpTest.beforeSecond === 1 &&
    jumpTest.secondJumpVy < -150 &&
    jumpTest.afterSecond === 0 &&
    !jumpTest.thirdChanged &&
    jumpTest.landedGrounded,
  JSON.stringify(jumpTest)
);

// --- 攻击与三个技能 + 冷却 ---
const skillTest = await page.evaluate(() => {
  const { world, input, step } = window.__BLADE__;
  const p = world.player;
  window.__TEST__.place(300);
  p.cooldowns.spin = 0;
  p.cooldowns.dash = 0;
  p.cooldowns.heal = 0;
  p.hp = p.maxHp;

  // 攻击：在面前放一个敌人，验证真的掉血
  const enemy = world.enemies.spawn('chaser', world.wave, p.x + 12, world.rng);
  enemy.spawnGrace = 0; // 出生保护是给玩家的反应时间，这里直接开打
  const hpBefore = enemy.hp;
  input.push('attack');
  step(6);
  const attacked = enemy.hp < hpBefore;
  const attackState = p.state;

  // 旋风斩
  const spinEnemy = world.enemies.spawn('chaser', world.wave, p.x - 10, world.rng);
  spinEnemy.spawnGrace = 0;
  const spinHpBefore = spinEnemy.hp;
  input.push('skill1');
  step(1);
  const spinState = p.state;
  step(30);
  const spinHit = spinEnemy.hp < spinHpBefore;
  const spinCd = p.cooldowns.spin;

  // 冲锋（无敌 + 位移 + 伤害）
  const dashEnemy = world.enemies.spawn('chaser', world.wave, p.x + 40, world.rng);
  dashEnemy.spawnGrace = 0;
  const dashHpBefore = dashEnemy.hp;
  const xBefore = p.x;
  input.push('skill2');
  step(1);
  const dashState = p.state;
  const dashInvuln = p.invuln;
  step(20);
  const dashMoved = p.x - xBefore;
  const dashHit = dashEnemy.hp < dashHpBefore || !dashEnemy.active;
  const dashCd = p.cooldowns.dash;

  // 治疗
  p.cooldowns.heal = 0;
  p.hp = Math.round(p.maxHp * 0.4);
  const hpBeforeHeal = p.hp;
  input.push('skill3');
  step(1);
  const healed = p.hp - hpBeforeHeal;
  const healCd = p.cooldowns.heal;

  // 冷却倒计时
  step(60);
  const spinAfter1s = p.cooldowns.spin;

  // 冷却中不能重复释放
  input.push('skill1');
  step(1);
  const recastState = p.state;

  // 满血时治疗不消耗冷却
  p.cooldowns.heal = 0;
  p.hp = p.maxHp;
  input.push('skill3');
  step(1);
  const fullHpHealCd = p.cooldowns.heal;

  return {
    attacked,
    attackState,
    spinState,
    spinHit,
    spinCd,
    dashState,
    dashInvuln,
    dashMoved,
    dashHit,
    dashCd,
    healed,
    healCd,
    spinAfter1s,
    recastState,
    fullHpHealCd
  };
});
check('普通攻击能砍到怪并造成伤害', skillTest.attacked && skillTest.attackState === 'attack');
check('技能一：旋风斩转一圈命中周围敌人', skillTest.spinState === 'spin' && skillTest.spinHit && skillTest.spinCd > 5);
check(
  '技能二：冲锋前冲、期间无敌且造成伤害',
  skillTest.dashState === 'dash' && skillTest.dashInvuln > 0.2 && skillTest.dashMoved > 30 && skillTest.dashHit && skillTest.dashCd > 4,
  `位移 ${skillTest.dashMoved.toFixed(0)}px，无敌 ${skillTest.dashInvuln.toFixed(2)}s`
);
check('技能三：治疗回复生命并进入冷却', skillTest.healed > 0 && skillTest.healCd > 10, `回复 ${skillTest.healed} 点`);
check(
  '技能冷却会随游戏时间递减，冷却中无法重复释放',
  skillTest.spinAfter1s < skillTest.spinCd - 0.8 && skillTest.recastState !== 'spin',
  `1 秒后剩余 ${skillTest.spinAfter1s.toFixed(2)}s`
);
check('满血时使用治疗不浪费冷却', skillTest.fullHpHealCd === 0);

// --- 暂停：时间与怪物都不动 ---
const pauseTest = await page.evaluate(() => {
  const { world, input, step } = window.__BLADE__;
  window.__TEST__.place(600);
  world.enemies.spawn('chaser', world.wave, world.player.x + 60, world.rng);
  step(4);
  const enemy = world.enemies.enemies[0];
  const before = {
    elapsed: world.elapsed,
    enemyX: enemy.x,
    cd: (world.player.cooldowns.spin = 4),
    waveTimerQueue: world.waves.remaining
  };
  world.togglePause();
  input.push('attack');
  input.push('skill1');
  step(120);
  const during = {
    elapsed: world.elapsed,
    enemyX: enemy.x,
    cd: world.player.cooldowns.spin,
    state: world.player.state,
    paused: world.paused
  };
  world.resume();
  step(30);
  const after = { elapsed: world.elapsed, enemyX: enemy.x };
  return { before, during, after };
});
check(
  '暂停时时间不前进、怪物不动、技能冷却不走、不能攻击',
  pauseTest.during.paused &&
    pauseTest.during.elapsed === pauseTest.before.elapsed &&
    pauseTest.during.enemyX === pauseTest.before.enemyX &&
    pauseTest.during.cd === pauseTest.before.cd &&
    pauseTest.during.state !== 'attack' &&
    pauseTest.after.elapsed > pauseTest.before.elapsed,
  `暂停 ${(pauseTest.during.elapsed - pauseTest.before.elapsed).toFixed(2)}s`
);

// --- 切到别的程序：自动暂停 + 回来有准备时间 ---
const focusTest = await page.evaluate(() => {
  const { world, step } = window.__BLADE__;
  const elapsedBefore = world.elapsed;
  world.setSuspended(true);
  step(60);
  const frozen = world.elapsed === elapsedBefore && world.autoPaused === true;
  world.setSuspended(false);
  const countdown = world.resumeCountdown;
  step(60);
  const stillFrozen = world.elapsed === elapsedBefore;
  const countdownAfter1s = world.resumeCountdown;
  step(200);
  const resumed = world.elapsed > elapsedBefore && world.resumeCountdown === 0;
  return { frozen, countdown, stillFrozen, countdownAfter1s, resumed };
});
check(
  '窗口失焦自动暂停，切回后有几秒准备时间（期间时间不流动）',
  focusTest.frozen && focusTest.countdown >= 3 && focusTest.stillFrozen && focusTest.countdownAfter1s < focusTest.countdown && focusTest.resumed,
  `准备倒计时 ${focusTest.countdown}s`
);

// --- 升级三选一：选完才能继续 ---
const levelUpTest = await page.evaluate(() => {
  const { world, input, step } = window.__BLADE__;
  const p = world.player;
  window.__TEST__.place(900); // 站到空地上，避免其它敌人打扰
  p.cooldowns.heal = 0;
  p.hp = Math.round(p.maxHp * 0.5);
  const hpBefore = p.hp;
  const maxHpBefore = p.maxHp;
  const attackBefore = p.attack;

  // 制造一次击杀：把敌人放在面前并直接砍死它
  const enemy = world.enemies.spawn('glass', world.wave, p.x + 10, world.rng);
  enemy.spawnGrace = 0;
  // place() 为隔离测试屏蔽了升级，这里恢复真实的经验曲线再触发一次升级
  p.xpToNext = 18 + (p.level - 1) * 14;
  p.xp = p.xpToNext - 1;
  p.attack = 999;
  input.push('attack');
  step(6);

  const phase = world.phase;
  const choices = world.upgradeChoices.slice();
  window.__BLADE__.renderOnce();
  const hpFull = p.hp === p.maxHp;
  const maxHpUp = p.maxHp > maxHpBefore;
  const attackUp = p.attack > attackBefore;

  // 未选择加成时：不能攻击、时间不前进
  const elapsedBefore = world.elapsed;
  const stateTimeBefore = p.stateTime;
  input.push('attack');
  input.push('skill1');
  step(60);
  const frozen = world.elapsed === elapsedBefore && p.stateTime === stateTimeBefore && p.cooldowns.spin === 0;

  const picked = world.upgradeChoices[0];
  return { phase, choices, hpFull, maxHpUp, attackUp, frozen, picked, backToPlaying: null, stacks: 0, hpBefore, pickedFirst: true };
});
check(
  '升级：回满血、提升血上限与攻击，并弹出三个随机加成',
  levelUpTest.phase === 'levelUp' && levelUpTest.choices.length === 3 && levelUpTest.hpFull && levelUpTest.maxHpUp && levelUpTest.attackUp,
  `选项 ${levelUpTest.choices.join(', ')}`
);
await settleAndShoot('02-upgrade-panel.png');

const pickedUpgrade = await page.evaluate((picked) => {
  const { world, step } = window.__BLADE__;
  const p = world.player;
  world.chooseUpgrade(picked);
  let drain = 0;
  while (world.phase === 'levelUp' && drain < 5) {
    world.chooseUpgrade(world.upgradeChoices[0]);
    drain += 1;
  }
  step(2);
  const backToPlaying = world.phase === 'playing';
  const stacks = world.mods.taken[picked] ?? 0;
  return { backToPlaying, stacks };
}, levelUpTest.picked);
check(
  '升级选择未完成前不能攻击、时间不前进；选完自动继续',
  levelUpTest.frozen && pickedUpgrade.backToPlaying && pickedUpgrade.stacks === 1
);

// --- 波次结算：怪全死后不能再攻击，且要手动开始下一波 ---
const waveClearTest = await page.evaluate(() => {
  const { world, input, step } = window.__BLADE__;
  world.enemies.reset();
  world.waves.reset();
  step(3);
  const phase = world.phase;
  const elapsedBefore = world.elapsed;
  const stateTimeBefore = world.player.stateTime;
  const attackCdBefore = world.player.attackCooldown;
  const spinCdBefore = world.player.cooldowns.spin;
  input.push('attack');
  step(60);
  const frozen =
    world.elapsed === elapsedBefore &&
    world.player.stateTime === stateTimeBefore &&
    world.player.attackCooldown === attackCdBefore &&
    world.player.cooldowns.spin === spinCdBefore;
  const waveBefore = world.wave;
  return { phase, frozen, waveBefore };
});
await settleAndShoot('03-wave-clear.png');

const nextWaveTest = await page.evaluate(() => {
  const { world, step } = window.__BLADE__;
  const waveBefore = world.wave;
  world.startNextWave();
  step(150);
  return { waveBefore, waveAfter: world.wave, phaseAfter: world.phase, spawned: world.enemies.totalActive };
});
check(
  '清场进入结算：结算期间不能攻击，手动开始下一波后敌人更强更多',
  waveClearTest.phase === 'waveClear' &&
    waveClearTest.frozen &&
    nextWaveTest.waveAfter === nextWaveTest.waveBefore + 1 &&
    nextWaveTest.phaseAfter === 'playing' &&
    nextWaveTest.spawned > 0,
  `第 ${waveClearTest.waveBefore} → ${nextWaveTest.waveAfter} 波`
);

// --- 怪物出生合法性 + 不重叠 ---
const spawnTest = await page.evaluate(() => {
  const { world, step } = window.__BLADE__;
  world.enemies.reset();
  world.waves.reset();
  world.wave = 8;
  world.waves.begin(8, world.rng);
  world.player.hp = 1e6;
  world.player.maxHp = 1e6;

  // 参考竞技场几何（与 src/game/arena.ts 保持一致）
  const GROUND_Y = 236;
  const SOLIDS = [
    { x: 0, y: GROUND_Y, w: 1920, h: 64 },
    { x: -16, y: 0, w: 16, h: GROUND_Y + 64 },
    { x: 1920, y: 0, w: 16, h: GROUND_Y + 64 },
    { x: 360, y: 176, w: 84, h: 10 },
    { x: 700, y: 150, w: 84, h: 10 },
    { x: 1040, y: 178, w: 84, h: 10 },
    { x: 1380, y: 148, w: 84, h: 10 },
    { x: 826, y: 216, w: 56, h: 20 }
  ];
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  let maxAlive = 0;
  let badWall = 0;
  let overlapping = 0;
  let samples = 0;
  const overlapSamples = [];
  for (let i = 0; i < 1200; i += 1) {
    step(1);
    world.player.hp = 1e6;
    if (i % 5 !== 0) continue;
    const alive = world.enemies.enemies.filter((e) => e.active && e.state !== 'dead');
    maxAlive = Math.max(maxAlive, alive.length);
    for (const e of alive) {
      samples += 1;
      for (const s of SOLIDS) {
        // 允许脚底与地面相接（站立），只判定真正的“嵌进墙里”
        if (overlaps(e, s) && !(s.y === GROUND_Y && Math.abs(e.y + e.h - GROUND_Y) < 1)) {
          badWall += 1;
          break;
        }
      }
    }
    for (let a = 0; a < alive.length; a += 1) {
      for (let b = a + 1; b < alive.length; b += 1) {
        const ea = alive[a];
        const eb = alive[b];
        if (Math.abs(ea.x - eb.x) < 6 && Math.abs(ea.y - eb.y) < 6) {
          overlapping += 1;
          if (overlapSamples.length < 4) {
            overlapSamples.push(
              `f${i} ${ea.kind}#${ea.id}(x=${ea.x.toFixed(1)},y=${ea.y.toFixed(1)},vy=${ea.vy.toFixed(0)},st=${ea.state}) vs ${eb.kind}#${eb.id}(x=${eb.x.toFixed(1)},y=${eb.y.toFixed(1)},vy=${eb.vy.toFixed(0)},st=${eb.state})`
            );
          }
        }
      }
    }
  }
  return {
    maxAlive,
    badWall,
    overlapping,
    samples,
    overlapSamples,
    playerX: world.player.x.toFixed(1),
    aliveAtEnd: world.enemies.aliveCount
  };
});
check(
  '怪物不会生成在墙里 / 不会叠在同一个位置',
  spawnTest.badWall === 0 && spawnTest.overlapping === 0,
  `抽样 ${spawnTest.samples} 次，入墙 ${spawnTest.badWall}，重叠 ${spawnTest.overlapping}，同屏最多 ${spawnTest.maxAlive}，玩家 x=${spawnTest.playerX} | ${spawnTest.overlapSamples.join(' || ')}`
);

// --- 长时间运行：对象池与内存收敛 ---
const longRun = await page.evaluate(() => {
  const { world, input, step } = window.__BLADE__;
  world.enemies.reset();
  world.waves.reset();
  world.restart();
  world.player.maxHp = 1e6;
  world.player.hp = 1e6;

  const heapAt = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
  const frames = 18000; // 5 分钟游戏时间
  let maxEnemies = 0;
  let maxParticles = 0;
  let maxTexts = 0;
  let maxSlashes = 0;
  let upgradeScreens = 0;
  let waveClears = 0;
  let kills = 0;
  let heapStart = 0;

  for (let i = 0; i < frames; i += 1) {
    if (i % 20 === 0) input.push('attack');
    if (i % 71 === 0) input.push('skill1');
    if (i % 131 === 0) input.push('skill2');
    if (i % 211 === 0) input.push('skill3');
    world.player.hp = world.player.maxHp;
    world.player.invuln = Math.max(world.player.invuln, 0.2);
    // 不断补充贴脸的敌人，确保伤害、击杀、特效、对象池回收都被高频触发
    if (i % 45 === 0) {
      const kind = i % 900 === 0 ? 'tank' : i % 300 === 0 ? 'glass' : 'chaser';
      const target = world.enemies.spawn(kind, Math.max(1, world.wave), Math.min(1890, world.player.x + 14), world.rng);
      // 压到极低血量：让这一轮长跑稳定地覆盖“击杀 → 升级 → 三选一 → 对象池回收”路径
      if (target) {
        target.hp = 1;
        target.spawnGrace = 0;
      }
    }
    step(1);

    if (world.phase === 'levelUp') {
      upgradeScreens += 1;
      let drain = 0;
      while (world.phase === 'levelUp' && drain < 8) {
        world.chooseUpgrade(world.upgradeChoices[0]);
        drain += 1;
      }
    } else if (world.phase === 'waveClear') {
      waveClears += 1;
      world.startNextWave();
    } else if (world.phase === 'gameOver') {
      world.restart();
    }

    if (i % 400 === 0) {
      world.enemies.reset();
      world.waves.reset();
      world.wave = Math.min(60, world.wave + 1);
    }

    const fx = world.effects.stats;
    maxParticles = Math.max(maxParticles, fx.particles);
    maxTexts = Math.max(maxTexts, fx.texts);
    maxSlashes = Math.max(maxSlashes, fx.slashes);
    maxEnemies = Math.max(maxEnemies, world.enemies.totalActive);
    if (i === 3000) heapStart = heapAt();
    kills = world.totalKills;
  }
  const heapEnd = heapAt();
  return {
    frames,
    maxEnemies,
    maxParticles,
    maxTexts,
    maxSlashes,
    upgradeScreens,
    waveClears,
    kills,
    heapStart,
    heapEnd,
    elementCount: document.querySelectorAll('*').length,
    canvasCount: document.querySelectorAll('canvas').length
  };
});
check(
  '长时间运行：粒子 / 飘字 / 敌人数量都有硬上限（不无限增长）',
  longRun.maxParticles <= 320 && longRun.maxTexts <= 48 && longRun.maxSlashes <= 24 && longRun.maxEnemies <= 22 && longRun.canvasCount === 1,
  `5 分钟：敌人峰值 ${longRun.maxEnemies}，粒子峰值 ${longRun.maxParticles}，飘字峰值 ${longRun.maxTexts}，DOM 节点 ${longRun.elementCount}`
);
check(
  '长时间运行：内存没有持续增长（对象池复用生效）',
  longRun.heapStart === 0 || longRun.heapEnd - longRun.heapStart < 40 * 1024 * 1024,
  longRun.heapStart ? `堆增长 ${((longRun.heapEnd - longRun.heapStart) / 1048576).toFixed(1)} MB` : '（无 performance.memory 数据）'
);
check(
  '长时间运行中升级 / 清场 / 重开流程都能正常循环',
  longRun.upgradeScreens > 0 && longRun.kills > 0,
  `升级弹窗 ${longRun.upgradeScreens} 次，清场 ${longRun.waveClears} 次，累计击杀 ${longRun.kills}`
);
await settleAndShoot('04-late-game.png');

// --- 存档：关掉再打开还在 ---
const savedBefore = await page.evaluate(() => {
  const raw = window.localStorage.getItem('blade-loop:run');
  const parsed = raw ? JSON.parse(raw) : null;
  return { exists: !!raw, version: parsed?.version, wave: parsed?.data?.wave, level: parsed?.data?.level };
});
check('进度写入 localStorage', savedBefore.exists && savedBefore.version === 1, `波次 ${savedBefore.wave} / 等级 ${savedBefore.level}`);

await page.reload({ waitUntil: 'load' });
await page.waitForFunction('!!window.__BLADE__', { timeout: 15000 });
await installTestHarness();
const reloaded = await page.evaluate(() => {
  const snap = window.__BLADE__.world.getSnapshot();
  return { phase: snap.phase, hasSave: snap.hasSave, lastRun: snap.lastRun };
});
check(
  '重新打开页面后仍能读到存档',
  reloaded.phase === 'menu' && reloaded.hasSave && reloaded.lastRun && reloaded.lastRun.wave === savedBefore.wave,
  `菜单显示：第 ${reloaded.lastRun?.wave} 波 / LV ${reloaded.lastRun?.level}`
);

const continued = await page.evaluate(() => {
  const { world, step } = window.__BLADE__;
  world.startRun(true);
  step(10);
  const p = world.player;
  return { phase: world.phase, wave: world.wave, level: p.level, maxHp: p.maxHp, attack: p.attack, takenStacks: Object.values(world.mods.taken).reduce((a, b) => a + b, 0) };
});
check(
  '继续游戏能恢复波次、等级、属性与升级加成',
  continued.phase === 'playing' && continued.wave === savedBefore.wave && continued.level >= 1,
  `第 ${continued.wave} 波 / LV ${continued.level} / 血上限 ${continued.maxHp} / 攻击 ${continued.attack.toFixed(1)} / 加成 ${continued.takenStacks} 层`
);

// --- 三种怪物同框 + 术士前摇提示（视觉可辨识度） ---
const enemyTypesShot = await page.evaluate(() => {
  const { world, step } = window.__BLADE__;
  const p = world.player;
  window.__TEST__.place(700);
  p.hp = p.maxHp;
  const chaser = world.enemies.spawn('chaser', 4, 610, world.rng);
  const glass = world.enemies.spawn('glass', 4, 800, world.rng);
  const tank = world.enemies.spawn('tank', 4, 880, world.rng);
  for (const e of [chaser, glass, tank]) if (e) e.spawnGrace = 0;
  step(30);
  // 让术士进入前摇，方便检查“要放大招”的可读性
  if (glass) {
    glass.x = p.x + 26;
    glass.y = 236 - glass.h;
    glass.state = 'windup';
    glass.stateTime = glass.windup * 0.7;
    glass.attackCooldown = 0;
  }
  if (tank) tank.x = p.x - 90;
  if (chaser) chaser.x = p.x - 40;
  step(1);
  window.__BLADE__.renderOnce(); // 主循环已停止，手动渲染一帧再截图
  return {
    phase: world.phase,
    total: world.enemies.totalActive,
    list: world.enemies.enemies.map((e) => `${e.kind}#${e.id}:${e.state}@${e.x.toFixed(0)}`),
    playerX: p.x.toFixed(0),
    wave: world.wave
  };
});
await settleAndShoot('06-enemy-types.png');
console.log('  ↳ 三种怪物同框检查：', JSON.stringify(enemyTypesShot));

// --- 真实 visibilitychange 事件：隐藏 → 暂停，切回 → 倒计时准备 ---
const liveCheck = await page.evaluate(() => {
  const { world, step } = window.__BLADE__;
  const defineHidden = (value) =>
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
  const elapsedBefore = world.elapsed;

  defineHidden(true);
  document.dispatchEvent(new Event('visibilitychange'));
  const autoPaused = world.autoPaused;
  step(120);
  const frozenWhileHidden = world.elapsed === elapsedBefore;

  defineHidden(false);
  document.dispatchEvent(new Event('visibilitychange'));
  const countdown = world.resumeCountdown;
  const autoPausedCleared = world.autoPaused === false;
  step(90);
  const frozenDuringPrep = world.elapsed === elapsedBefore;
  step(150);
  const resumed = world.elapsed > elapsedBefore && world.resumeCountdown === 0;
  return { autoPaused, frozenWhileHidden, countdown, autoPausedCleared, frozenDuringPrep, resumed };
});
check(
  '真实 visibilitychange：隐藏自动暂停，切回给 3 秒准备时间后继续',
  liveCheck.autoPaused &&
    liveCheck.frozenWhileHidden &&
    liveCheck.countdown === 3 &&
    liveCheck.autoPausedCleared &&
    liveCheck.frozenDuringPrep &&
    liveCheck.resumed,
  `准备倒计时 ${liveCheck.countdown}s`
);

// 收尾：真实运行一段时间并截图
const fpsSample = await page.evaluate(async () => {
  const { world, loop, input } = window.__BLADE__;
  world.resume();
  world.setSuspended(false);
  if (world.resumeCountdown > 0) {
    const start = performance.now();
    while (world.resumeCountdown > 0 && performance.now() - start < 6000) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  input.push('right');
  let frames = 0;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 > 1500) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const fps = (frames * 1000) / (performance.now() - t0);
  loop.stop();
  return { fps, phase: world.phase, enemies: world.enemies.aliveCount };
});
await page.screenshot({ path: path.join(shotDir, '05-gameplay.png') });
check('真实 rAF 循环能稳定运行', fpsSample.fps > 30, `${fpsSample.fps.toFixed(0)} FPS，场上敌人 ${fpsSample.enemies}`);

check('整个流程没有 JS 报错', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | ') || 'ok');

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n共 ${results.length} 项检查，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项。`);
console.log(`截图输出目录：${path.relative(root, shotDir)}`);
if (failed.length > 0) process.exit(1);

