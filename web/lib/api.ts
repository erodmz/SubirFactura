// Cliente HTTP del panel: adjunta el access token y, ante un 401, intenta
// renovar con el refresh token (rotación) una sola vez antes de cerrar sesión.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const TOKENS_KEY = 'facturard_tokens';
export const PENDING_INVITE_KEY = 'facturard_pending_invite';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export function saveTokens(tokens: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function getTokens(): Tokens | null {
  const raw = typeof window === 'undefined' ? null : localStorage.getItem(TOKENS_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, options: RequestInit, accessToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

async function tryRefresh(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;
  const res = await request('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) return false;
  saveTokens((await res.json()) as Tokens);
  return true;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    return new ApiError(res.status, message ?? `Error ${res.status}`);
  } catch {
    return new ApiError(res.status, `Error ${res.status}`);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };

  let res = await request(path, init, getTokens()?.accessToken);

  if (res.status === 401 && (await tryRefresh())) {
    res = await request(path, init, getTokens()?.accessToken);
  }
  if (res.status === 401) {
    clearTokens();
    window.location.href = '/login';
    throw new ApiError(401, 'Sesión expirada');
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Sube un archivo (multipart) al API con auth + refresh, y devuelve el JSON. */
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getTokens()?.accessToken ?? ''}` },
      body: formData,
    });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (res.status === 401) {
    clearTokens();
    window.location.href = '/login';
    throw new ApiError(401, 'Sesión expirada');
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

/**
 * Convierte una ruta del API en URL absoluta usable en <img src> / href.
 * El API devuelve rutas relativas (p. ej. el logo: /api/organizations/:id/logo)
 * para no depender del dominio: en producción el panel y el API comparten origen
 * (API_BASE = ''), pero en desarrollo el API vive en otro puerto.
 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Trae una imagen del API (con auth + refresh) y devuelve un object URL usable
 * en <img src>. Hace falta porque <img> no puede mandar el header Authorization
 * y las imágenes de facturas se sirven por el proxy autenticado del API (no por
 * URL firmada del almacén). Quien lo llama debe hacer URL.revokeObjectURL()
 * cuando termine, para no filtrar memoria.
 */
export async function apiObjectUrl(path: string): Promise<string> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${getTokens()?.accessToken ?? ''}` },
    });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (!res.ok) throw await parseError(res);
  return URL.createObjectURL(await res.blob());
}

/** Descarga un archivo del API (con auth + refresh) y la dispara en el navegador. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${getTokens()?.accessToken ?? ''}` },
    });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  if (res.status === 401) {
    clearTokens();
    window.location.href = '/login';
    throw new ApiError(401, 'Sesión expirada');
  }
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
