'use client';

import { useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  /** Celda personalizada (badges, enlaces…). Si falta, muestra el valor de texto. */
  render?: (row: T) => React.ReactNode;
  /** Valor para ordenar y para el texto por defecto de la celda. Si falta, la columna no es ordenable. */
  value?: (row: T) => string | number | null;
  /** Valor para el CSV. Si falta, usa `value`. Columnas de acción se omiten del CSV. */
  csv?: (row: T) => string | number | null;
  align?: 'left' | 'right';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  emptyText?: string;
  /** Si se define, muestra el botón "Exportar CSV" con este nombre de archivo (sin extensión). */
  exportFileName?: string;
  /** Fila de totales opcional (pie de tabla). */
  footer?: React.ReactNode;
  /** Si se define, la fila es clicable (abre detalle, etc.). */
  onRowClick?: (row: T) => void;
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const cols = columns.filter((c) => c.csv || c.value);
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.header)).join(',');
  const body = rows
    .map((r) => cols.map((c) => esc((c.csv ?? c.value)!(r))).join(','))
    .join('\n');
  return `${head}\n${body}`;
}

export default function DataTable<T>({
  columns,
  rows,
  getKey,
  pageSize = 20,
  initialSort,
  emptyText = 'Sin resultados',
  exportFileName,
  footer,
  onRowClick,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'es') * dir;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(col: Column<T>) {
    if (!col.value) return;
    setPage(0);
    setSort((s) =>
      s?.key === col.key
        ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: 'asc' },
    );
  }

  function exportCsv() {
    const csv = toCsv(columns, sorted);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {exportFileName && rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="secondary" onClick={exportCsv} style={{ margin: 0 }}>
            ⬇ Exportar CSV
          </button>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const activeSort = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c)}
                    style={{
                      textAlign: c.align ?? 'left',
                      cursor: c.value ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    {c.header}
                    {c.value && (
                      <span style={{ opacity: activeSort ? 1 : 0.3, marginLeft: 4 }}>
                        {activeSort ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={getKey(row)}
                className={onRowClick ? 'row-click' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                    {c.render ? c.render(row) : c.value ? c.value(row) : null}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="muted">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
          {footer}
        </table>
      </div>
      {sorted.length > pageSize && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 12,
            flexWrap: 'wrap',
          }}
        >
          <span className="muted" style={{ fontSize: 13 }}>
            {sorted.length} resultado(s) · página {current + 1} de {pageCount}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              style={{ margin: 0 }}
            >
              ← Anterior
            </button>
            <button
              className="secondary"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
              style={{ margin: 0 }}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
