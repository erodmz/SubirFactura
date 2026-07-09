'use client';

import type { ReactNode } from 'react';

/** Switch moderno (reemplaza checkboxes). Accesible: role="switch" + teclado. */
export default function Toggle({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  id?: string;
}) {
  return (
    <label className={`switch${disabled ? ' is-disabled' : ''}`}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      {label != null && <span className="switch-label">{label}</span>}
    </label>
  );
}
