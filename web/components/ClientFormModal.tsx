'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Modal from './Modal';
import type { Client } from '../lib/types';

type RncFase = '' | 'buscando' | 'ok' | 'inactivo' | 'no-hallado';

/**
 * Alta/edición de un cliente en un modal. En alta, al escribir un RNC (9) o
 * cédula (11) válidos, la DGII autocompleta la razón social legal. En edición
 * el RNC/cédula queda de solo lectura (no lo cambia el backend) y solo se
 * ajusta el nombre.
 */
export default function ClientFormModal({
  orgId,
  edit,
  onClose,
  onSaved,
}: {
  orgId: string;
  /** Cliente a editar; si falta, es alta. */
  edit?: Client;
  onClose: () => void;
  onSaved: (c: Client) => void;
}) {
  const isEdit = !!edit;
  const [rncOCedula, setRnc] = useState(edit?.rncOCedula ?? '');
  const [razonSocial, setRazon] = useState(edit?.razonSocial ?? '');
  const [razonAuto, setRazonAuto] = useState(false);
  const [rncFase, setRncFase] = useState<{ fase: RncFase; detalle?: string }>({ fase: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const digits = rncOCedula.replace(/\D/g, '');
  const rncValido = digits.length === 9 || digits.length === 11;
  const razonValida = razonSocial.trim().length > 0;
  const puedeGuardar = (isEdit || rncValido) && razonValida && !busy;

  // Autocompletar DGII (solo en alta): debounce por tecla.
  useEffect(() => {
    if (isEdit) return;
    if (!rncValido) {
      setRncFase({ fase: '' });
      return;
    }
    let cancelado = false;
    setRncFase({ fase: 'buscando' });
    const t = setTimeout(async () => {
      try {
        const r = await api<{
          encontrado: boolean;
          razonSocial: string | null;
          estado: string | null;
          activo: boolean;
        }>(`/api/organizations/${orgId}/dgii/rnc/${digits}`);
        if (cancelado) return;
        if (r.encontrado && r.razonSocial) {
          setRazon((cur) => (cur.trim() === '' ? r.razonSocial! : cur));
          setRazonAuto(true);
          setRncFase(
            r.activo
              ? { fase: 'ok' }
              : { fase: 'inactivo', detalle: r.estado ?? 'inactivo' },
          );
        } else {
          setRncFase({ fase: 'no-hallado' });
        }
      } catch {
        if (!cancelado) setRncFase({ fase: '' });
      }
    }, 450);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [digits, rncValido, isEdit, orgId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!puedeGuardar) return;
    setBusy(true);
    setError('');
    try {
      const saved = isEdit
        ? await api<Client>(`/api/organizations/${orgId}/clients/${edit!.id}`, {
            method: 'PATCH',
            body: { razonSocial: razonSocial.trim() },
          })
        : await api<Client>(`/api/organizations/${orgId}/clients`, {
            method: 'POST',
            body: { rncOCedula: digits, razonSocial: razonSocial.trim() },
          });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="client-form" disabled={!puedeGuardar}>
            {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </>
      }
    >
      {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
      <form id="client-form" onSubmit={submit}>
        <div className="field">
          <label>RNC o cédula</label>
          <input
            value={rncOCedula}
            onChange={(e) => setRnc(e.target.value)}
            onBlur={() => setTouched(true)}
            inputMode="numeric"
            disabled={isEdit}
            className={touched && !isEdit && !rncValido ? 'invalid' : undefined}
            placeholder="Ej. 130862345 (9) o cédula (11)"
          />
          {isEdit ? (
            <span className="field-hint">El RNC/cédula no se puede cambiar.</span>
          ) : touched && !rncValido ? (
            <span className="field-hint err">Debe tener 9 dígitos (RNC) u 11 (cédula).</span>
          ) : rncFase.fase === 'buscando' ? (
            <span className="field-hint">Buscando en la DGII…</span>
          ) : rncFase.fase === 'ok' ? (
            <span className="field-hint ok">✓ Encontrado en la DGII · activo</span>
          ) : rncFase.fase === 'inactivo' ? (
            <span className="field-hint warn">⚠ La DGII lo reporta como {rncFase.detalle}</span>
          ) : rncFase.fase === 'no-hallado' ? (
            <span className="field-hint">No aparece en la DGII — escribe el nombre a mano.</span>
          ) : null}
        </div>

        <div className="field">
          <label>
            Razón social / nombre
            {razonAuto && razonSocial && (
              <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--ok)', fontWeight: 400 }}>
                · traído de la DGII
              </span>
            )}
          </label>
          <input
            value={razonSocial}
            onChange={(e) => {
              setRazon(e.target.value);
              setRazonAuto(false);
            }}
            onBlur={() => setTouched(true)}
            className={touched && !razonValida ? 'invalid' : undefined}
            placeholder="Nombre legal del contribuyente"
          />
          {touched && !razonValida && (
            <span className="field-hint err">La razón social es obligatoria.</span>
          )}
        </div>
      </form>
    </Modal>
  );
}
