import { describe, expect, it } from 'vitest';
import {
  cardInputSchema,
  deriveShortCode,
  fieldErrors,
  finishInputSchema,
  finishPatchSchema,
  languageInputSchema,
} from '../src/schemas.js';

describe('fieldErrors', () => {
  it('mezőnként az első üzenet; hiányzó mező "Kötelező mező.", hibás típus "Hibás érték."', () => {
    const input = {
      pokemon: '',
      setName: 'x',
      cardNumber: '1',
      finishId: 'a',
      extra: 1,
    };
    const res = cardInputSchema.safeParse(input);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(fieldErrors(res.error, input)).toMatchObject({
      pokemon: 'Kötelező mező.',
      finishId: 'Hibás érték.',
      languageId: 'Kötelező mező.',
      _: 'Ismeretlen mező: extra',
    });
  });

  it('nem objektum bemenet: "_" kulcs', () => {
    const res = finishInputSchema.safeParse(null);
    expect(res.success).toBe(false);
    if (!res.success) expect(fieldErrors(res.error)).toEqual({ _: 'Kötelező mező.' });
  });
});

describe('finish és nyelv sémák', () => {
  it('finish: név tisztítva, üres leírás → null, túl hosszú leírás hiba', () => {
    expect(finishInputSchema.parse({ name: '  Galaxy   Holo ', description: '  ' })).toEqual({
      name: 'Galaxy Holo',
      description: null,
    });
    expect(finishInputSchema.parse({ name: 'X' })).toEqual({ name: 'X', description: null });
    expect(finishPatchSchema.parse({ description: ' Leírás ' })).toEqual({ description: 'Leírás' });
    expect(finishPatchSchema.safeParse({ description: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('nyelv: a rövid kód nagybetűs, legfeljebb 6 betű/szám; a magyar név elhagyható', () => {
    expect(
      languageInputSchema.parse({ name: 'Dutch', nameHu: ' Holland ', shortCode: 'nl' }),
    ).toEqual({
      name: 'Dutch',
      nameHu: 'Holland',
      shortCode: 'NL',
    });
    expect(languageInputSchema.parse({ name: 'Dutch', nameHu: ' ', shortCode: '' })).toEqual({
      name: 'Dutch',
      nameHu: undefined,
      shortCode: undefined,
    });
    expect(languageInputSchema.safeParse({ name: 'Dutch', shortCode: 'ab-c' }).success).toBe(false);
  });
});

describe('deriveShortCode', () => {
  it('két betű ékezet nélkül; foglaltnál hosszabb előtag, végül sorszám', () => {
    expect(deriveShortCode('Ëlvish', new Set())).toBe('EL');
    expect(deriveShortCode('English 2', new Set(['EN']))).toBe('ENG');
    expect(deriveShortCode('Eno', new Set(['EN', 'ENO']))).toBe('EN2');
    expect(deriveShortCode('Ab', new Set(['AB', 'AB2']))).toBe('AB3');
    expect(deriveShortCode('日本', new Set())).toBe('X');
  });
});
