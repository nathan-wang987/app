/**
 * 开发模式冒烟检查：启动 vite dev server，用真实浏览器打开，
 * 确认（含 React StrictMode 双挂载）没有报错、能开始游戏、canvas 有画面。
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].find((p) => existsSync(p));

if (!CHROME) {
  console.error('未找到浏览器');
  process.exit(2);
}

const devServer = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'dev', '--', '--port', '5188', '--strictPort'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
);

// 记录 PID，收尾时只结束这个进程（遵守“不要按进程名批量结束”的约定）
console.log(`dev server PID: ${devServer.pid}`);

const waitForServer = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:5188/');
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

let exitCode = 0;
try {
  if (!(await waitForServer())) throw new Error('dev server 启动超时');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await page.goto('http://127.0.0.1:5188/', { waitUntil: 'load' });
  await page.waitForFunction('!!window.__BLADE__', { timeout: 20000 });
  const result = await page.evaluate(async () => {
    const { world } = window.__BLADE__;
    world.autoPaused = false;
    world.paused = false;
    world.startRun(false);
    await new Promise((r) => setTimeout(r, 1200));
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4 * 11) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return {
      phase: world.phase,
      enemies: world.enemies.totalActive,
      elapsed: world.elapsed,
      colors: colors.size,
      canvases: document.querySelectorAll('canvas').length,
      skillButtons: document.querySelectorAll('.skill-card').length
    };
  });
  await browser.close();

  const ok =
    errors.length === 0 &&
    result.phase === 'playing' &&
    result.elapsed > 0.8 &&
    result.colors > 40 &&
    result.canvases === 1 &&
    result.skillButtons === 4;
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) console.log('错误：', errors.join(' | '));
  console.log(ok ? 'PASS 开发模式正常（无报错、单 canvas、能开打）' : 'FAIL 开发模式检查未通过');
  if (!ok) exitCode = 1;
} catch (error) {
  console.error('dev-check 异常：', error);
  exitCode = 1;
} finally {
  // 只结束本次任务启动的这个进程树（npm → vite），不按进程名批量清理。
  try {
    // 只结束本次任务启动的这个进程树（npm → vite），不按进程名批量清理。
    if (process.platform === 'win32' && devServer.pid) {
      execFileSync('taskkill', ['/pid', String(devServer.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      devServer.kill();
    }
  } catch {
    /* 进程可能已退出 */
  }
}

process.exit(exitCode);
