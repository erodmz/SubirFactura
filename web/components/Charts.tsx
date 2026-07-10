'use client';

import { useState } from 'react';

/** Paleta categórica (validada). Referencia var(--c1..8) que swap-ea en oscuro. */
export const SERIES = [
  'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)',
  'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)',
];

/** Color por estado (semántico, no cíclico). */
export const ESTADO_COLOR: Record<string, string> = {
  validada: 'var(--ok)',
  incluida_en_606: 'var(--c1)',
  reportada: 'var(--c5)',
  extraida: 'var(--c2)',
  en_revision: 'var(--m-orange)',
  procesando: 'var(--c3)',
  subida: 'var(--c3)',
  rechazada: 'var(--danger)',
  duplicada: 'var(--muted)',
};

export function Legend({
  items,
}: {
  items: { label: string; color: string; value?: number | string }[];
}) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span className="legend-item" key={i}>
          <span className="legend-swatch" style={{ background: it.color }} />
          {it.label}
          {it.value != null && <span style={{ color: 'var(--text)' }}> · {it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/** Donut categórico con hover (el centro muestra el segmento activo). */
export function Donut({
  data,
  size = 168,
  thickness = 24,
  centerLabel,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {data.map((d, i) => {
            const len = (d.value / total) * c;
            const gap = len > 4 ? 2 : 0; // 2px de surface entre segmentos
            const el = (
              <circle
                key={i}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={hover === i ? thickness + 4 : thickness}
                strokeDasharray={`${Math.max(0, len - gap)} ${c - len + gap}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width 0.1s ease' }}
              >
                <title>
                  {d.label}: {d.value}
                </title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text
          x={cx}
          y={cx - 2}
          textAnchor="middle"
          style={{ fill: 'var(--text)', fontSize: 24, fontWeight: 800 }}
        >
          {hover != null ? data[hover].value : total}
        </text>
        <text
          x={cx}
          y={cx + 16}
          textAnchor="middle"
          style={{ fill: 'var(--muted)', fontSize: 11 }}
        >
          {hover != null ? data[hover].label : centerLabel ?? 'total'}
        </text>
      </svg>
      <Legend items={data} />
    </div>
  );
}

/** Área/línea de tendencia (una serie) con hover por punto. */
export function AreaChart({
  data,
  height = 150,
  format = (v) => String(v),
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  if (n === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  const padT = 12;
  const padB = 18;
  const h = height;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const area = `${line} L ${x(n - 1)} ${h - padB} L ${x(0)} ${h - padB} Z`;

  return (
    <div style={{ position: 'relative', marginTop: 10 }}>
      <svg
        viewBox={`0 0 100 ${h}`}
        width="100%"
        height={h}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover != null && (
          <line
            x1={x(hover)}
            y1={padT - 6}
            x2={x(hover)}
            y2={h - padB}
            stroke="var(--border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* Punto marcado sobre el valor activo (HTML, alineado en %) */}
      {hover != null && (
        <span
          style={{
            position: 'absolute',
            left: `${x(hover)}%`,
            top: y(data[hover].value),
            width: 9,
            height: 9,
            marginLeft: -4.5,
            marginTop: -4.5,
            borderRadius: '50%',
            background: 'var(--brand)',
            border: '2px solid var(--card)',
            pointerEvents: 'none',
          }}
        />
      )}
      {hover != null && (
        <div className="chart-tip" style={{ left: `${x(hover)}%`, top: y(data[hover].value) }}>
          <strong>{format(data[hover].value)}</strong> · {data[hover].label}
        </div>
      )}
      {/* Columnas transparentes para el hover + etiquetas de eje. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {data.map((d, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ flex: 1, cursor: 'default' }}
            title={`${d.label}: ${format(d.value)}`}
          />
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 4 }}>
        {data.map((d, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 10,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {i % 2 === 0 || n <= 8 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontales (magnitud por categoría/cliente/proveedor). */
export function HBars({
  data,
  format = (v) => String(v),
}: {
  data: { label: string; value: number; color?: string }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            title={d.label}
            style={{
              width: 132,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--text)',
            }}
          >
            {d.label}
          </span>
          <div
            style={{
              flex: 1,
              height: 18,
              background: 'var(--bg-soft)',
              borderRadius: 5,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                height: '100%',
                background: d.color ?? 'var(--c1)',
                borderRadius: 5,
              }}
            />
          </div>
          <span
            style={{
              width: 82,
              textAlign: 'right',
              fontSize: 12.5,
              color: 'var(--muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {format(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
