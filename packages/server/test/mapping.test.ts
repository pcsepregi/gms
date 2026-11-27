import { describe, expect, it } from 'vitest';
import { buildNote, isCheckStatus, isPlainNotOwned, parseOwned } from '../src/import/mapping.js';
import { cardNumberText, cellLink, cellText } from '../src/import/cells.js';

describe('Have? leképezés', () => {
  it('S-01/EF2 (T-IMP-02): YES, yes, " Yes " megvan; NO, üres, N/A nincs meg', () => {
    expect(['YES', 'yes', ' Yes '].map(parseOwned)).toEqual([true, true, true]);
    expect(['NO', '', 'N/A'].map(parseOwned)).toEqual([false, false, false]);
  });

  it('csak a NO és az üres "egyértelmű" nincs meg', () => {
    expect(isPlainNotOwned(' no ')).toBe(true);
    expect(isPlainNotOwned('')).toBe(true);
    expect(isPlainNotOwned('N/A')).toBe(false);
  });

  it('CHECK státusz', () => {
    expect(isCheckStatus(' check ')).toBe(true);
    expect(isCheckStatus('CONFIRMED')).toBe(false);
  });
});

describe('megjegyzés (T-IMP-04, S-01/EF4)', () => {
  it('CHECK + Notes + link', () => {
    expect(buildNote({ check: true, notes: ' Jegyzet ', link: 'https://x.y/z' })).toBe(
      'Ellenőrizendő.\n\nJegyzet\n\nForrás: https://x.y/z',
    );
  });
  it('csak Notes', () => {
    expect(buildNote({ check: false, notes: 'Jegyzet', link: '' })).toBe('Jegyzet');
  });
  it('csak link', () => {
    expect(buildNote({ check: false, notes: '', link: 'https://x.y' })).toBe('Forrás: https://x.y');
  });
  it('egyik sem', () => {
    expect(buildNote({ check: false, notes: '  ', link: '' })).toBe('');
  });
});

describe('cellaértékek', () => {
  it('szöveg, szám, logikai, dátum, üres', () => {
    expect(cellText('a')).toBe('a');
    expect(cellText(12)).toBe('12');
    expect(cellText(true)).toBe('true');
    expect(cellText(new Date('2024-05-06T10:00:00Z'))).toBe('2024-05-06');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText({ error: '#N/A' })).toBe('');
  });

  it('formázott szöveg, hivatkozás, képlet eredménye', () => {
    expect(cellText({ richText: [{ text: 'Lech' }, { text: 'onk' }] })).toBe('Lechonk');
    expect(cellText({ text: 'link szöveg', hyperlink: 'https://a.b' })).toBe('link szöveg');
    expect(cellText({ formula: 'A1&B1', result: 'AB' })).toBe('AB');
  });

  it('hivatkozásnál a cél URL', () => {
    expect(cellLink({ text: 'katt', hyperlink: 'https://a.b/c' })).toBe('https://a.b/c');
    expect(cellLink({ text: 'csak szöveg', hyperlink: '' })).toBe('csak szöveg');
    expect(cellLink('https://plain')).toBe('https://plain');
  });

  it('S-01/EF3 (T-IMP-03): számként tárolt kártyaszám vezető nullákkal', () => {
    expect(cardNumberText(7, '000')).toBe('007');
    expect(cardNumberText(7, 'General')).toBe('7');
    expect(cardNumberText(7)).toBe('7');
    expect(cardNumberText(1.5, '000')).toBe('1.5');
    expect(cardNumberText({ formula: 'A1', result: 9 }, '00')).toBe('09');
    expect(cardNumberText('007/SV-P')).toBe('007/SV-P');
  });
});
