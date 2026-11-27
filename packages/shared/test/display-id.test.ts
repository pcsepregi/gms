import { describe, expect, it } from 'vitest';
import { assignDisplayIds, baseDisplayId, type DisplayIdInput } from '../src/display-id.js';

const card = (over: Partial<DisplayIdInput> = {}): DisplayIdInput => ({
  languageCode: 'EN',
  pokemon: 'Lechonk',
  cardNumber: '154/198',
  finishName: 'Reverse Holo',
  setCode: 'SVI',
  setName: 'Scarlet & Violet',
  ...over,
});

describe('display_id (T-EDT-04)', () => {
  it('alapformátum, szóköz helyett aláhúzás', () => {
    expect(baseDisplayId(card())).toBe('EN-Lechonk-154/198-Reverse_Holo');
    expect(baseDisplayId(card({ pokemon: 'Oinkologne ex' }))).toBe(
      'EN-Oinkologne_ex-154/198-Reverse_Holo',
    );
  });

  it('egyedi esetben nincs utótag', () => {
    expect(assignDisplayIds([card(), card({ finishName: 'Normal' })])).toEqual([
      'EN-Lechonk-154/198-Reverse_Holo',
      'EN-Lechonk-154/198-Normal',
    ]);
  });

  it('ütközésnél setkód utótag', () => {
    expect(assignDisplayIds([card(), card({ setCode: 'PAF', setName: 'Paldean Fates' })])).toEqual([
      'EN-Lechonk-154/198-Reverse_Holo-SVI',
      'EN-Lechonk-154/198-Reverse_Holo-PAF',
    ]);
  });

  it('setkód hiányában a setnév az utótag', () => {
    expect(
      assignDisplayIds([card({ setCode: null }), card({ setCode: ' ', setName: 'Promo Box' })]),
    ).toEqual([
      'EN-Lechonk-154/198-Reverse_Holo-Scarlet_&_Violet',
      'EN-Lechonk-154/198-Reverse_Holo-Promo_Box',
    ]);
  });

  it('ha a setkód sem egyedi, sorszám kerül a végére', () => {
    expect(assignDisplayIds([card(), card({ setName: 'Másik' })])).toEqual([
      'EN-Lechonk-154/198-Reverse_Holo-SVI-1',
      'EN-Lechonk-154/198-Reverse_Holo-SVI-2',
    ]);
  });
});
