/** Logo de SubirFactura: encuadre de cámara + recibo (captura tu factura) con
 *  degradado de marca + wordmark. Simple, original y escalable. */
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
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="frdLogoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#0073ea" />
            <stop offset="0.55" stopColor="#6c6cff" />
            <stop offset="1" stopColor="#a25ddc" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="28" fill="url(#frdLogoGrad)" />
        <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M24 34 L24 28 Q24 24 28 24 L34 24" />
          <path d="M66 24 L72 24 Q76 24 76 28 L76 34" />
          <path d="M24 66 L24 72 Q24 76 28 76 L34 76" />
          <path d="M66 76 L72 76 Q76 76 76 72 L76 66" />
        </g>
        <path
          d="M40 38 L60 38 Q62 38 62 40 L62 58 L58 62 L54 58 L50 62 L46 58 L42 62 L38 58 L38 40 Q38 38 40 38 Z"
          fill="#fff"
        />
        <polygon points="50,40 43,49 57,49" fill="#0073ea" />
        <rect x="48" y="47" width="4" height="11" rx="1" fill="#0073ea" />
      </svg>
      {withWordmark && (
        <span className="logo-word">
          <span className="gradient">Subir</span>Factura
        </span>
      )}
    </span>
  );
}
