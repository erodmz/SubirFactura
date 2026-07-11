'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import Modal from './Modal';

interface InviteResult {
  inviteUrl: string;
  limitWarning?: string;
}

/** Invita a un miembro (contador o cliente) y muestra el enlace con botón Copiar. */
export default function InviteMemberModal({
  orgId,
  clientes,
  onClose,
  onInvited,
}: {
  orgId: string;
  clientes: { id: string; razonSocial: string }[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('contador');
  const [clientProfileId, setClientProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copiado, setCopiado] = useState(false);

  const emailValido = /.+@.+\..+/.test(email.trim());
  const puedeEnviar = emailValido && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!puedeEnviar) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<InviteResult>(`/api/organizations/${orgId}/invitations`, {
        method: 'POST',
        body: {
          email: email.trim(),
          rol,
          ...(rol === 'cliente' && clientProfileId ? { clientProfileId } : {}),
        },
      });
      setResult(r);
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  async function copiar() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: el usuario copia a mano */
    }
  }

  return (
    <Modal
      title="Invitar al equipo"
      onClose={onClose}
      width={480}
      footer={
        result ? (
          <button type="button" onClick={onClose}>Listo</button>
        ) : (
          <>
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" form="invite-form" disabled={!puedeEnviar}>
              {busy ? 'Generando…' : 'Generar invitación'}
            </button>
          </>
        )
      }
    >
      {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

      {result ? (
        <div>
          <p style={{ marginTop: 0 }}>
            Invitación creada para <strong>{email}</strong>. Comparte este enlace (válido 7 días):
          </p>
          <div className="copy-row">
            <input readOnly value={result.inviteUrl} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
          </div>
          {result.limitWarning && (
            <p className="field-hint warn" style={{ marginTop: 10 }}>{result.limitWarning}</p>
          )}
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit}>
          <div className="field">
            <label>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              className={touched && !emailValido ? 'invalid' : undefined}
              placeholder="persona@empresa.com"
            />
            {touched && !emailValido && (
              <span className="field-hint err">Escribe un correo válido.</span>
            )}
          </div>

          <div className="field">
            <label>Rol</label>
            <select value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="contador">Contador — gestiona clientes y facturas</option>
              <option value="cliente">Cliente — solo sube facturas de su negocio</option>
            </select>
          </div>

          {rol === 'cliente' && (
            <div className="field">
              <label>Negocio del cliente</label>
              <select value={clientProfileId} onChange={(e) => setClientProfileId(e.target.value)}>
                <option value="">— Vincular después —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razonSocial}</option>
                ))}
              </select>
              {!clientProfileId && (
                <span className="field-hint">
                  Sin negocio vinculado, el cliente no verá facturas hasta que lo agregues en
                  Clientes → Gestionar.
                </span>
              )}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
