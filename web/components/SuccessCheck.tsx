/**
 * Check de éxito animado: el círculo y la palomita se dibujan (stroke-dash).
 * Para confirmaciones — guardado, aprobado, plan cambiado. Discreto y rápido.
 */
export default function SuccessCheck({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="success-check"
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden
    >
      <circle
        className="ring"
        cx="13"
        cy="13"
        r="11.5"
        stroke="var(--ok)"
        strokeWidth="2.4"
        strokeLinecap="round"
        transform="rotate(-90 13 13)"
      />
      <path
        className="tick"
        d="M7.5 13.4l3.7 3.7 7.3-7.6"
        stroke="var(--ok)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
