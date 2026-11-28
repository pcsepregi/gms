import { describe, expect, it } from 'vitest';
import type { Card } from '@gms/shared';
import { pickRandom, STRIP_SIZE } from '../src/components/CardStrip';

const card = (id: number, url: string | null): Card =>
  ({ id, image: { url, thumbUrl: url, status: url ? 'exact' : 'none' } }) as unknown as Card;

describe('áttekintő képsáv: véletlen 15 kártya', () => {
  const cards = Array.from({ length: 60 }, (_, i) => card(i + 1, i % 3 === 0 ? null : `/i/${i}`));

  it('csak képes kártyák, legfeljebb 15, ismétlés nélkül', () => {
    const picked = pickRandom(cards, 42);
    expect(picked).toHaveLength(STRIP_SIZE);
    expect(picked.every((c) => c.image.url)).toBe(true);
    expect(new Set(picked.map((c) => c.id)).size).toBe(STRIP_SIZE);
  });

  it('ugyanarra a magra ugyanaz (háttérfrissítés nem keveri újra), másik magra más', () => {
    expect(pickRandom(cards, 7).map((c) => c.id)).toEqual(pickRandom(cards, 7).map((c) => c.id));
    expect(pickRandom(cards, 7).map((c) => c.id)).not.toEqual(
      pickRandom(cards, 8).map((c) => c.id),
    );
  });

  it('kevés képes kártyánál annyi, amennyi van', () => {
    expect(pickRandom(cards.slice(0, 4), 1)).toHaveLength(2);
    expect(pickRandom([], 1)).toEqual([]);
  });
});
