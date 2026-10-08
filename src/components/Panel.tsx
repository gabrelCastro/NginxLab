import type { ReactNode } from 'react'

export function Panel({ title, eyebrow, actions, children, className = '' }: { title: string; eyebrow?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div className="min-w-0">
          {eyebrow && <p className="panel-eyebrow">{eyebrow}</p>}
          <h2 className="panel-title">{title}</h2>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function IconButton({ label, onClick, children, active = false, disabled = false }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return <button type="button" className={`icon-button ${active ? 'icon-button-active' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
}
