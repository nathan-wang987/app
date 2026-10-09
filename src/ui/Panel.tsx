import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
  footer?: ReactNode;
}

/** 像素风格的通用弹窗容器 */
export function Panel({ title, subtitle, children, className = '', wide = false, footer }: PanelProps) {
  return (
    <div className={`panel ${wide ? 'panel--wide' : ''} ${className}`.trim()}>
      {title ? (
        <header className="panel__header">
          <h2 className="panel__title">{title}</h2>
          {subtitle ? <p className="panel__subtitle">{subtitle}</p> : null}
        </header>
      ) : null}
      <div className="panel__body">{children}</div>
      {footer ? <footer className="panel__footer">{footer}</footer> : null}
    </div>
  );
}

interface PixelButtonProps {
  children: ReactNode;
  onClick: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  hint?: string;
  disabled?: boolean;
}

export function PixelButton({ children, onClick, kind = 'ghost', hint, disabled }: PixelButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${kind}`}
      disabled={disabled}
      onClick={(event) => {
        // 避免按钮保持焦点后把空格/方向键吞掉，影响游戏操作
        event.currentTarget.blur();
        onClick();
      }}
    >
      <span className="btn__label">{children}</span>
      {hint ? <span className="btn__hint">{hint}</span> : null}
    </button>
  );
}
