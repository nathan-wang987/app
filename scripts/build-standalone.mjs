/**
 * 生成“双击就能玩”的单文件版本：dist-standalone/index.html
 *
 * 做法：用 Vite 打包成 IIFE（不产生 import/export），把 JS 与 CSS 全部内联进 HTML，
 * 并把 <script type="module" crossorigin> 改成普通 <script>，
 * 这样直接以 file:// 打开也不会被模块 CORS 拦住。
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const outDir = path.join(root, 'dist-standalone');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  root,
  base: './',
  configFile: false,
  logLevel: 'warn',
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2019',
    outDir,
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    sourcemap: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});

const htmlPath = path.join(outDir, 'index.html');
let html = await readFile(htmlPath, 'utf8');

// 1) 转成经典脚本：file:// 下不会被 ES Module 的 CORS 策略拦截。
html = html
  .replace(/\s+type="module"/g, '')
  .replace(/\s+crossorigin(=("|')[^"']*("|'))?/g, '')
  .replace(/<link rel="modulepreload"[^>]*>/g, '');

// 2) 经典脚本不再延迟执行，必须移到 </body> 之前，确保 #root 已存在。
const headEnd = html.indexOf('</head>');
const inlineScripts = [];
const head = html.slice(0, headEnd).replace(/<script[^>]*>[\s\S]*?<\/script>/g, (match) => {
  inlineScripts.push(match);
  return '';
});
html = head + html.slice(headEnd).replace('</body>', `${inlineScripts.join('\n')}\n  </body>`);

await writeFile(htmlPath, html, 'utf8');

console.log(`单文件版本已生成：${path.relative(root, htmlPath)} (${(html.length / 1024).toFixed(0)} KB)`);
