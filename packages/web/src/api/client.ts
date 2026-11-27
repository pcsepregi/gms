import type { ApiErrorBody } from '@gms/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
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
    );
  }
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
