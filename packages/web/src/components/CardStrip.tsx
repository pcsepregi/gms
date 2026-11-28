import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Card } from '@gms/shared';
import { useCards } from '../api/queries';
import { hu } from '../i18n/hu';

export const STRIP_SIZE = 15;

/** Determinisztikus keverés: a kártya-azonosító és az oldalbetöltéskori mag hash-e. */
function rank(id: number, seed: number): number {
  let h = (id ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Legfeljebb `n` véletlen kártya, amelynek van képe; ugyanarra a magra mindig ugyanaz. */
export function pickRandom(cards: readonly Card[], seed: number, n = STRIP_SIZE): Card[] {
  return cards
    .filter((c) => c.image.url)
    .map((c) => ({ c, r: rank(c.id, seed) }))
    .sort((a, b) => a.r - b.r || a.c.id - b.c.id)
    .slice(0, n)
    .map((x) => x.c);
}

/**
 * Az áttekintőn egy sorban 15 véletlen kártyakép; minden oldalbetöltéskor más.
 * A mag a komponens élettartamára rögzül, így a háttérfrissítés nem keveri újra.
 */
export function CardStrip() {
  const cards = useCards();
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const picked = useMemo(() => pickRandom(cards.data ?? [], seed), [cards.data, seed]);
  if (picked.length === 0) return null;
  return (
    <section className="card-strip" aria-label={hu.home.strip} data-testid="card-strip">
      <ul>
        {picked.map((c) => (
          <li key={c.id} data-owned={String(c.owned)}>
            <Link to={`/kartyak/${c.id}`} title={c.displayId}>
              <img src={c.image.thumbUrl ?? c.image.url!} alt={c.displayId} loading="lazy" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
