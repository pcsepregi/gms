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

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
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
