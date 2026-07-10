'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
}

/** Dropdown moderno (botón tipo pill + popover). Reemplaza el <select> nativo. */
export default function Dropdown({
  value,
  options,
  onChange,
  icon,
  ariaLabel,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  icon?: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        className="dd-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {icon && <span className="dd-icon">{icon}</span>}
        <span className="dd-cur">{current?.label ?? '—'}</span>
        <span className="dd-chev" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          ▾
        </span>
      </button>
      {open && (
        <div className="dd-menu" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`dd-item${o.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="dd-item-label">
                {o.label}
                {o.hint && <span className="dd-item-hint">{o.hint}</span>}
              </span>
              {o.value === value && <span className="dd-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
