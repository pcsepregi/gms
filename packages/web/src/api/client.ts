import type { ApiErrorBody } from '@gms/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiErrorBody | null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    throw new ApiError(
      res.status,
      body?.error.code ?? 'HTTP',
      body?.error.message ?? res.statusText,
      body?.error.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getJson<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { headers: { accept: 'application/json' } }));
}

export async function sendJson<T>(method: 'POST' | 'PUT' | 'PATCH', url: string, body: unknown) {
  return parse<T>(
    await fetch(url, {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** Bináris törzs (pl. feltöltött kép) a fájl saját típusával. */
export async function sendFile<T>(method: 'PUT' | 'POST', url: string, file: Blob) {
  return parse<T>(
    await fetch(url, {
      method,
      headers: { accept: 'application/json', 'content-type': file.type || 'image/png' },
      body: file,
    }),
  );
}

export async function deleteJson(url: string): Promise<void> {
  return parse<void>(
    await fetch(url, { method: 'DELETE', headers: { accept: 'application/json' } }),
  );
}

/** A `400 VALIDATION` válasz mezőnkénti hibái. */
export function errorFields(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.code === 'VALIDATION' && err.details) {
    return err.details as Record<string, string>;
  }
  return {};
}

/** A `409 DUPLICATE` válaszban a meglévő rekord azonosítója. */
export function duplicateId(err: unknown): number | null {
  if (err instanceof ApiError && err.code === 'DUPLICATE') {
    const id = (err.details as { id?: unknown } | undefined)?.id;
    return typeof id === 'number' ? id : null;
  }
  return null;
}
