import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

type Reply = { status?: number; body: unknown };
type Routes = Record<string, Reply | ((init: RequestInit | undefined) => Reply)>;

/**
 * A fetch-et a megadott útvonal → válasz térképpel helyettesíti. A kulcs lehet
 * `'/api/x'` vagy metódussal együtt `'PUT /api/x'`; az érték függvény is lehet.
 */
export function mockApi(routes: Routes) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const entry = routes[`${method} ${url}`] ?? (method === 'GET' ? routes[url] : undefined);
    const r = typeof entry === 'function' ? entry(init) : entry;
    if (!r) return new Response('nem json', { status: 404 });
    if (r.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderWithProviders(ui: ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
