/**
 * Kézzel karbantartható set-leképezés (technikai spec 7.2). A kulcs a setkód (nagybetűvel),
 * az érték a TCGdex set-azonosítók. Ami itt nincs, azt a képgyűjtő a setkódból, a setnévből
 * és a kártyaszám nevezőjéből (a set hivatalos lapszáma) ismeri fel automatikusan.
 *
 * A valós lefedettséget a Macen futó felderítés (docs/operations.md) mutatja meg; ide azok
 * a setek kerülnek, amelyeket az automatikus felismerés nem talál el.
 */
export const SET_MAP: Readonly<Record<string, readonly string[]>> = {};

export function mappedSetIds(setCode: string | null): readonly string[] {
  return setCode ? (SET_MAP[setCode.trim().toUpperCase()] ?? []) : [];
}
