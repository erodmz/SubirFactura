'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveTokens, PENDING_INVITE_KEY, type Tokens } from '../lib/api';

// Tipos mínimos de Google Identity Services (evita el `any`).
interface GoogleId {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Botón "Entrar con Google". El navegador obtiene un ID token de Google y lo
 * manda a nuestro API (/api/auth/google), que lo VERIFICA y emite nuestros
 * tokens. No se renderiza nada si NEXT_PUBLIC_GOOGLE_CLIENT_ID no está definido,
 * así el acceso social queda apagado hasta configurarlo.
 */
export default function GoogleSignIn({ onError }: { onError?: (msg: string) => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;

    async function handle(idToken: string) {
      setBusy(true);
      try {
        const { tokens } = await api<{ tokens: Tokens }>('/api/auth/google', {
          method: 'POST',
          body: { idToken },
        });
        saveTokens(tokens);
        const pending = localStorage.getItem(PENDING_INVITE_KEY);
        router.push(pending ? `/invitations/${pending}` : '/app');
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'No se pudo entrar con Google');
        setBusy(false);
      }
    }

    function init() {
      const g = window.google?.accounts.id;
      if (!g || !ref.current) return;
      g.initialize({ client_id: CLIENT_ID, callback: (r) => handle(r.credential) });
      g.renderButton(ref.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        locale: 'es',
        width: 320,
      });
    }

    if (window.google?.accounts?.id) {
      init();
      return;
    }
    // Carga el script de Google una sola vez.
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);
    return () => script?.removeEventListener('load', init);
  }, [router, onError]);

  if (!CLIENT_ID) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="oauth-divider"><span>o</span></div>
      <div style={{ display: 'flex', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
        <div ref={ref} />
      </div>
    </div>
  );
}
