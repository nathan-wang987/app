/**
 * 把 vite build 的产物（dist/index.html + assets/*）合并成一个可以直接用
 * 浏览器打开的单文件页面。产物里所有资源都内联，file:// 下也能运行。
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('[inline-build] 找不到 dist/index.html，请先执行 vite build');
  process.exit(1);
}

const readAsset = (ref) => {
  const cleaned = ref.replace(/^[./\\]+/, '');
  const file = path.join(distDir, cleaned);
  if (!fs.existsSync(file)) {
    throw new Error(`[inline-build] 引用的资源不存在: ${ref}`);
  }
  return fs.readFileSync(file, 'utf8');
};

let html = fs.readFileSync(indexPath, 'utf8');
const used = new Set();

html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  if (!href) return tag;
  used.add(href);
  return `<style>\n${readAsset(href)}\n</style>`;
});

html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_tag, src) => {
  used.add(src);
  // 内联为普通脚本（非 module），file:// 协议下同样可以执行
  return `<script>\n${readAsset(src)}\n</script>`;
});

// 清掉 vite 可能插入的 modulepreload
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>\s*/g, '');

fs.writeFileSync(indexPath, html, 'utf8');

for (const ref of used) {
  const file = path.join(distDir, ref.replace(/^[./\\]+/, ''));
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
  }
}
const assetsDir = path.join(distDir, 'assets');
if (fs.existsSync(assetsDir)) {
  fs.rmSync(assetsDir, { recursive: true, force: true });
}

const size = (fs.statSync(indexPath).size / 1024).toFixed(1);
console.log(`[inline-build] 单文件产出完成: dist/index.html (${size} KB)`);
