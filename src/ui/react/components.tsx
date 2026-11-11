import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { React } from './runtime';

export function Button({
  primary = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={`neo-button${primary ? ' neo-button-primary' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="neo-field">
      <div className="neo-field-caption">
        <span className="neo-field-label">{label}</span>
        {description && <span className="neo-muted">{description}</span>}
      </div>
      <div className="neo-field-control">{children}</div>
    </div>
  );
}

export function Status({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div
      className={error ? 'neo-status neo-status-error' : 'neo-status'}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="neo-kbd">{children}</kbd>;
}
