'use client';

import { useState } from 'react';
import Modal from './Modal';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Diálogo de confirmación estilizado (reemplaza window.confirm). Se usa con el
 * hook useConfirm: `const confirm = useConfirm()` → `if (await confirm({...}))`.
 */
export function ConfirmDialog({
  options,
  onResolve,
}: {
  options: ConfirmOptions;
  onResolve: (ok: boolean) => void;
}) {
  return (
    <Modal
      title={options.title}
      onClose={() => onResolve(false)}
      width={440}
      footer={
        <>
          <button type="button" className="secondary" onClick={() => onResolve(false)}>
            {options.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            className={options.danger ? 'danger' : ''}
            onClick={() => onResolve(true)}
          >
            {options.confirmLabel ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--text)' }}>{options.message}</p>
    </Modal>
  );
}

/**
 * Estado + render de un ConfirmDialog. Devuelve `[confirm, dialog]`: coloca
 * `dialog` en el árbol y llama `await confirm({...})` para pedir confirmación.
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setState({ options, resolve }));

  const dialog = state ? (
    <ConfirmDialog
      options={state.options}
      onResolve={(ok) => {
        state.resolve(ok);
        setState(null);
      }}
    />
  ) : null;

  return [confirm, dialog];
}
