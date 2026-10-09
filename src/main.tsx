import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

function mount(): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('缺少 #root 容器');
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// 兼容脚本被放在 <head> 的情况：等 DOM 就绪再挂载。
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
