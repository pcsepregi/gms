import { describe, expect, it } from 'vitest';
import { cleanText, keyText, naturalKey } from '../src/normalize.js';

describe('normalizálás', () => {
  it('levágja és összevonja a szóközöket', () => {
    expect(cleanText('  Scarlet   &\tViolet ')).toBe('Scarlet & Violet');
  });

  it('kis-/nagybetűtől független kulcsszöveg', () => {
    expect(keyText(' LeChonk ')).toBe('lechonk');
  });

  it('S-22/EF2 (T-DUP-01): "Lechonk " és "lechonk", SVI kis-/nagybetűvel azonos kulcs', () => {
    const a = naturalKey({
      pokemon: 'Lechonk ',
      setName: 'Scarlet & Violet',
      cardNumber: '154/198',
      finishId: 2,
      languageId: 1,
    });
    const b = naturalKey({
      pokemon: 'lechonk',
      setName: ' scarlet &  violet',
      cardNumber: '154/198',
      finishId: 2,
      languageId: 1,
    });
    expect(a).toBe(b);
  });

  it('más finish vagy nyelv más kulcs', () => {
    const base = {
      pokemon: 'Lechonk',
      setName: 'SVI',
      cardNumber: '1',
      finishId: 1,
      languageId: 1,
    };
    expect(naturalKey(base)).not.toBe(naturalKey({ ...base, finishId: 2 }));
    expect(naturalKey(base)).not.toBe(naturalKey({ ...base, languageId: 2 }));
  });
});
