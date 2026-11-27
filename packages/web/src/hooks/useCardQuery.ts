import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_QUERY, queryFromParams, queryToParams, type CardQuery } from '@gms/shared';

/**
 * A lista szűrői és rendezése az URL-ben élnek (S-16): könyvjelzőzhető, és a
 * Vissza gomb az előző szűrési állapotra lép.
 */
export function useCardQuery() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => queryFromParams(params), [params]);

  const update = useCallback(
    (patch: Partial<CardQuery>, opts: { replace?: boolean } = {}) => {
      setParams((prev) => queryToParams({ ...queryFromParams(prev), ...patch }), {
        replace: opts.replace ?? false,
      });
    },
    [setParams],
  );

  /** Minden szűrő és a keresés törlése; a rendezés megmarad. */
  const clear = useCallback(() => {
    setParams((prev) => {
      const q = queryFromParams(prev);
      return queryToParams({ ...DEFAULT_QUERY, sort: q.sort, dir: q.dir });
    });
  }, [setParams]);

  return { query, params, update, clear };
}
