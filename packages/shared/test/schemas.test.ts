import { describe, expect, it } from 'vitest';
import { cardInputSchema } from '../src/schemas.js';
import { INITIAL_LANGUAGES } from '../src/languages.js';

const valid = {
  pokemon: ' Lechonk ',
  setName: 'Scarlet & Violet',
  setCode: ' SVI ',
  cardNumber: '154/198',
  finishId: 1,
  languageId: 1,
};

describe('kártya séma', () => {
  it('levágja a szóközöket, alapértékeket ad', () => {
    const r = cardInputSchema.parse(valid);
    expect(r).toMatchObject({ pokemon: 'Lechonk', setCode: 'SVI', owned: false, note: '' });
  });

  it('üres setkód NULL', () => {
    expect(cardInputSchema.parse({ ...valid, setCode: '  ' }).setCode).toBeNull();
    expect(cardInputSchema.parse({ ...valid, setCode: undefined }).setCode).toBeNull();
  });

  it('kötelező mezők és hosszkorlátok', () => {
    expect(cardInputSchema.safeParse({ ...valid, pokemon: '   ' }).success).toBe(false);
    expect(cardInputSchema.safeParse({ ...valid, setName: 'x'.repeat(101) }).success).toBe(false);
    expect(cardInputSchema.safeParse({ ...valid, setCode: 'x'.repeat(21) }).success).toBe(false);
    expect(cardInputSchema.safeParse({ ...valid, note: 'x'.repeat(5000) }).success).toBe(true);
    expect(cardInputSchema.safeParse({ ...valid, note: 'x'.repeat(5001) }).success).toBe(false);
    expect(cardInputSchema.safeParse({ ...valid, finishId: 0 }).success).toBe(false);
  });
});

describe('nyelvtábla', () => {
  it('13 nyelv, egyedi rövid kódokkal', () => {
    expect(INITIAL_LANGUAGES).toHaveLength(13);
    expect(new Set(INITIAL_LANGUAGES.map((l) => l.shortCode)).size).toBe(13);
  });
});
