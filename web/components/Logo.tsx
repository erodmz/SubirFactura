/** Logo de FacturaRD: marca geométrica (mini-tablero) con degradado +
 *  wordmark. Estilo Monday — colorido, simple, escalable. */
export default function Logo({
  size = 28,
  withWordmark = true,
}: {
  size?: number;
  withWordmark?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="frdLogoGrad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0073ea" />
            <stop offset="0.55" stopColor="#6c6cff" />
            <stop offset="1" stopColor="#a25ddc" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#frdLogoGrad)" />
        <rect x="7" y="17" width="4.5" height="8" rx="2.25" fill="#fff" opacity="0.95" />
        <rect x="13.75" y="12" width="4.5" height="13" rx="2.25" fill="#fff" opacity="0.85" />
        <rect x="20.5" y="7" width="4.5" height="18" rx="2.25" fill="#fff" opacity="0.72" />
      </svg>
      {withWordmark && (
        <span className="logo-word">
          Factura<span className="gradient">RD</span>
        </span>
      )}
    </span>
  );
}
