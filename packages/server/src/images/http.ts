/** A képgyűjtő HTTP-kliense: egyszerre egy kérés, a kérések között szünet (spec 7.1). */

/** Hálózati szintű hiba (nincs kapcsolat, időtúllépés): nincs értelme a további kéréseknek. */
export class NetworkError extends Error {}

/** A forrás hibát adott (5xx, 429). */
export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Http {
  /** JSON; `null`, ha a forrás 404-et ad. */
  json<T>(url: string): Promise<T | null>;
  text(url: string, maxBytes?: number): Promise<string | null>;
  bytes(url: string): Promise<Buffer | null>;
}

export interface HttpOptions {
  fetchImpl?: typeof fetch;
  /** Két kérés kezdete között eltelő legkisebb idő. */
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function createHttp(opts: HttpOptions = {}): Http {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const delayMs = opts.delayMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const userAgent = opts.userAgent ?? 'GMS-local-collection-app';

  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  /** Sorba állítja a kérést, hogy egyszerre csak egy fusson, szünettel. */
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = lastStart + delayMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastStart = Date.now();
      return task();
    });
    chain = run.catch(() => undefined);
    return run;
  }

  async function get(url: string): Promise<Response | null> {
    return serial(async () => {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { 'user-agent': userAgent, accept: '*/*' },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'follow',
        });
      } catch (err) {
        throw new NetworkError(`${url}: ${(err as Error).message}`);
      }
      if (res.status === 404 || res.status === 403) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new SourceError(`${url}: HTTP ${res.status}`, res.status);
      }
      return res;
    });
  }

  async function readBody(res: Response, url: string, max: number): Promise<Buffer> {
    try {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > max) throw new SourceError(`${url}: túl nagy válasz`, 413);
      return buf;
    } catch (err) {
      if (err instanceof SourceError) throw err;
      throw new NetworkError(`${url}: ${(err as Error).message}`);
    }
  }

  return {
    async json<T>(url: string) {
      const res = await get(url);
      if (!res) return null;
      const body = await readBody(res, url, 20 * 1024 * 1024);
      try {
        return JSON.parse(body.toString('utf8')) as T;
      } catch {
        throw new SourceError(`${url}: érvénytelen JSON`, 502);
      }
    },
    async text(url, maxBytes = 2 * 1024 * 1024) {
      const res = await get(url);
      return res ? (await readBody(res, url, maxBytes)).toString('utf8') : null;
    },
    async bytes(url) {
      const res = await get(url);
      return res ? readBody(res, url, MAX_IMAGE_BYTES) : null;
    },
  };
}
