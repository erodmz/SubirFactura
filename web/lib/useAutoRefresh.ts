import { useEffect } from 'react';

/**
 * Mantiene la vista en sync con el backend sin refrescar a mano:
 * - re-consulta al volver el foco a la pestaña (window focus) o al volver
 *   visible (cambiar de app/pestaña y regresar);
 * - hace polling suave mientras la pestaña está visible.
 *
 * `refetch` debe ser una función SILENCIOSA (que no muestre "Cargando…"),
 * para que el auto-refresh no parpadee la UI.
 */
export function useAutoRefresh(refetch: () => void, intervalMs = 20000) {
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') refetch();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refetch();
    }, intervalMs);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(id);
    };
  }, [refetch, intervalMs]);
}
