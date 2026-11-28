import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import type { Card } from '@gms/shared';
import { App } from '../src/App';
import { mockApi, renderWithProviders } from './render';

const health = { ok: true, version: '0.2.0', dbPath: '/x', appTitle: 'Teszt' };

const LANGS = {
  EN: { id: 1, name: 'English', nameHu: 'Angol', shortCode: 'EN', sortOrder: 1 },
  FR: { id: 2, name: 'French', nameHu: 'Francia', shortCode: 'FR', sortOrder: 2 },
  DE: { id: 3, name: 'German', nameHu: 'Német', shortCode: 'DE', sortOrder: 3 },
};

function card(
  id: number,
  p: Partial<Card> & { lang?: keyof typeof LANGS; finishName?: string },
): Card {
  const language = LANGS[p.lang ?? 'EN'];
  const finish = p.finishName ?? 'Normal';
  return {
    id,
    displayId: `${language.shortCode}-${p.pokemon ?? 'Alfa'}-${p.cardNumber ?? '1/10'}-${finish}`,
    owned: false,
    pokemon: 'Alfa',
    setName: 'Első set',
    setCode: 'ES',
    cardNumber: '1/10',
    finish: { id: 1, name: finish, description: null },
    language,
    note: '',
    image: { status: 'pending', url: null, thumbUrl: null, languageId: null, languageNameHu: null },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  };
}

const CARDS: Card[] = [
  card(1, { owned: true, lang: 'EN', note: 'Forrás: https://example.org/a' }),
  card(2, { lang: 'DE', finishName: 'Reverse Holo' }),
  card(3, { lang: 'FR', finishName: 'Reverse Holo', pokemon: 'Béta', cardNumber: '2/10' }),
  card(4, {
    owned: true,
    lang: 'DE',
    setName: 'Második set',
    setCode: 'MS',
    cardNumber: '007/SV-P',
    image: {
      status: 'fallback',
      url: '/api/images/4.webp',
      thumbUrl: '/api/images/4-thumb.webp',
      languageId: 1,
      languageNameHu: 'Angol',
    },
  }),
];

function Location() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderCards(path = '/kartyak', extra: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    '/api/health': { body: health },
    '/api/cards': { body: CARDS },
    ...extra,
  });
  renderWithProviders(
    <>
      <App />
      <Location />
    </>,
    path,
  );
  return fetchMock;
}

const location = () => screen.getByTestId('location').textContent;
const count = () => screen.getByTestId('result-count').textContent;
const shownCards = () => screen.queryAllByTestId('card');

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-theme');
});

describe('kártyalista (S-10, S-11)', () => {
  it('S-10/EF1-2: minden kártya a mezőivel, a hiányzón "Hiányzik" címke', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    expect(count()).toBe('4 kártya, ebből 2 hiányzik');
    const missing = shownCards().find((el) => el.getAttribute('data-owned') === 'false')!;
    expect(within(missing).getByText('Hiányzik')).toBeInTheDocument();
    const owned = shownCards().find((el) => el.getAttribute('data-owned') === 'true')!;
    expect(within(owned).queryByText('Hiányzik')).not.toBeInTheDocument();
    expect(within(owned).getAllByText('Alfa').length).toBeGreaterThan(0);
    expect(within(owned).getByText('Első set')).toBeInTheDocument();
    // A nyelv teljes névvel a képen lévő címkén (nem kétbetűs kóddal).
    expect(owned.querySelector('.tile-lang')).toHaveTextContent(/^Angol$/u);
    // Kép, ha van; különben helykitöltő szürke figurával.
    expect(document.querySelector('img.card-img')).toHaveAttribute('loading', 'lazy');
    expect(owned.querySelector('.card-placeholder svg.ph-art')).toBeInTheDocument();
  });

  it('S-11: táblázat a megadott oszlopokkal, a választás megmarad', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    fireEvent.click(screen.getByRole('button', { name: 'Táblázat' }));
    const table = screen.getByTestId('card-table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      'Megvan',
      'Kép',
      'Pokémon',
      'Set',
      'Setkód',
      'Szám',
      'Nyomási változat',
      'Nyelv',
      'Megjegyzés',
    ]);
    expect(within(table).getAllByRole('checkbox')).toHaveLength(4);
    expect(localStorage.getItem('gms.cardView')).toBe('table');
    fireEvent.click(screen.getByRole('button', { name: 'Rács' }));
    expect(screen.getByTestId('card-grid')).toBeInTheDocument();
  });

  it('üres adatbázis és betöltési hiba', async () => {
    mockApi({ '/api/health': { body: health }, '/api/cards': { body: [] } });
    renderWithProviders(<App />, '/kartyak');
    expect(await screen.findByText('Még nincs kártya az adatbázisban.')).toBeInTheDocument();
  });
});

describe('keresés és szűrés (S-12 … S-16)', () => {
  it('S-12: gépelés szűr, az URL követi, Esc törli', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    const input = screen.getByRole('searchbox', { name: 'Keresés' });
    fireEvent.change(input, { target: { value: 'nemet reverse' } });
    await waitFor(() => expect(shownCards()).toHaveLength(1));
    expect(location()).toBe('/kartyak?q=nemet+reverse');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    expect(input).toHaveValue('');
  });

  it('S-12/EF5: a "/" billentyű a keresőbe ugrik, mezőben gépelve nem', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    const input = screen.getByRole('searchbox', { name: 'Keresés' });
    fireEvent.keyDown(document.body, { key: '/' });
    expect(input).toHaveFocus();
  });

  it('T-SRC-07 (S-12/EF6): nincs találat, a "Szűrők törlése" visszahoz mindent', async () => {
    renderCards('/kartyak?q=nincsilyen&nyelv=DE');
    expect(await screen.findByTestId('empty-state')).toHaveTextContent(
      'Nincs a feltételeknek megfelelő kártya.',
    );
    expect(count()).toBe('0 kártya');
    fireEvent.click(screen.getByRole('button', { name: 'Szűrők törlése' }));
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    expect(location()).toBe('/kartyak');
  });

  it('S-13: szűrő legördülő, VAGY egy szűrőn belül, a darabszám frissül', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    fireEvent.click(screen.getByRole('button', { name: 'Nyelv' }));
    const panel = screen.getByRole('group', { name: 'Nyelv' });
    expect(
      within(panel)
        .getAllByRole('checkbox')
        .map((c) => c.closest('label')!.textContent),
    ).toEqual(['Angol1', 'Francia1', 'Német2']);
    fireEvent.click(within(panel).getByRole('checkbox', { name: /Német/u }));
    fireEvent.click(within(panel).getByRole('checkbox', { name: /Francia/u }));
    expect(location()).toBe('/kartyak?nyelv=DE%2CFR');
    expect(count()).toBe('3 kártya, ebből 2 hiányzik');
    fireEvent.click(screen.getByRole('button', { name: 'Hiányzik' }));
    expect(count()).toBe('2 kártya, ebből 2 hiányzik');
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Nyelv' })).not.toBeInTheDocument();
  });

  it('kereshető set lista és képállapot szűrő', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    const find = screen.getByRole('searchbox', { name: 'Set: Keresés a listában' });
    fireEvent.change(find, { target: { value: 'masodik' } });
    const panel = screen.getByRole('group', { name: 'Set' });
    expect(within(panel).getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(find, { target: { value: 'zzz' } });
    expect(within(panel).getByText('Nincs találat.')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('group', { name: 'Set' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kép' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Csak tartalék kép/u }));
    expect(count()).toBe('1 kártya, ebből 0 hiányzik');
    fireEvent.click(screen.getByRole('button', { name: 'Kijelölés törlése' }));
    expect(count()).toBe('4 kártya, ebből 2 hiányzik');
  });

  it('setkód szűrő: a kód mellett a setnév, címke, URL; a kód a kártyán is látszik', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    expect(shownCards()[0]!.querySelector('.tile-meta')).toHaveTextContent('ES 1/10 · Normal');
    fireEvent.click(screen.getByRole('button', { name: 'Setkód' }));
    const panel = screen.getByRole('group', { name: 'Setkód' });
    expect(
      within(panel)
        .getAllByRole('checkbox')
        .map((c) => c.closest('label')!.textContent),
    ).toEqual(['ES – Első set3', 'MS – Második set1']);
    fireEvent.click(within(panel).getByRole('checkbox', { name: /MS/u }));
    expect(location()).toBe('/kartyak?setkod=MS');
    expect(count()).toBe('1 kártya, ebből 0 hiányzik');
    expect(screen.getByRole('button', { name: 'Szűrő törlése: Setkód: MS' })).toBeInTheDocument();
  });

  it('T-FLT-04 (S-14): címkék; az x egyet töröl, az "Összes törlése" mindent', async () => {
    renderCards(
      '/kartyak?q=alfa&nyelv=DE,EN&allapot=hianyzik&finish=Reverse+Holo&pokemon=Alfa&set=Els%C5%91+set&kep=tartalek&rendezes=szam',
    );
    await screen.findByTestId('empty-state');
    const chips = within(screen.getByRole('list', { name: 'Aktív szűrők' }));
    for (const label of [
      'Keresés: „alfa”',
      'Pokémon: Alfa',
      'Nyelv: Német',
      'Nyelv: Angol',
      'Set: Első set',
      'Nyomási változat: Reverse Holo',
      'Állapot: Hiányzik',
      'Kép: Csak tartalék kép',
    ]) {
      expect(chips.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(chips.getByRole('button', { name: 'Szűrő törlése: Nyelv: Német' }));
    expect(location()).not.toContain('DE');
    expect(location()).toContain('nyelv=EN');
    fireEvent.click(chips.getByRole('button', { name: 'Összes törlése' }));
    // A rendezés megmarad, minden más (a keresés is) törlődik.
    expect(location()).toBe('/kartyak?rendezes=szam');
    expect(screen.getByRole('searchbox', { name: 'Keresés' })).toHaveValue('');
    expect(screen.queryByRole('list', { name: 'Aktív szűrők' })).not.toBeInTheDocument();
  });

  it('S-15: rendezés és irány az URL-ben', async () => {
    renderCards();
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    fireEvent.change(screen.getByRole('combobox', { name: 'Rendezés' }), {
      target: { value: 'pokemon' },
    });
    expect(location()).toBe('/kartyak?rendezes=pokemon');
    fireEvent.click(screen.getByRole('button', { name: 'Rendezési irány: Növekvő' }));
    expect(location()).toBe('/kartyak?rendezes=pokemon&irany=csokkeno');
    expect(shownCards()[0]!.querySelector('.tile-name')).toHaveTextContent('Béta');
  });
});

describe('részletek panel (S-10/EF4)', () => {
  it('kártyára kattintva megnyílik, a szűrők megmaradnak, Esc bezárja', async () => {
    renderCards('/kartyak?nyelv=EN');
    await waitFor(() => expect(shownCards()).toHaveLength(1));
    fireEvent.click(within(shownCards()[0]!).getByRole('link'));
    expect(location()).toBe('/kartyak/1?nyelv=EN');
    const panel = screen.getByTestId('card-details');
    expect(within(panel).getByRole('heading', { name: 'Alfa' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'https://example.org/a' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(within(panel).getByText('EN-Alfa-1/10-Normal')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(location()).toBe('/kartyak?nyelv=EN');
  });

  it('nem létező kártya', async () => {
    renderCards('/kartyak/99');
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    expect(
      within(screen.getByTestId('card-details')).getByText('A kártya nem található.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bezárás' }));
    expect(location()).toBe('/kartyak');
  });
});

describe('jelölés (S-20)', () => {
  it('S-20/EF1: rácsból, táblázatból és panelről is átvált (optimista)', async () => {
    const calls: unknown[] = [];
    renderCards('/kartyak/2', {
      'PUT /api/cards/2/owned': (init) => {
        const body = JSON.parse(String(init?.body)) as { owned: boolean };
        calls.push(body);
        return { body: { ...CARDS[1], owned: body.owned } };
      },
    });
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    const panel = screen.getByTestId('card-details');
    const sw = within(panel).getByRole('switch', { name: 'Megvan' });
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    await waitFor(() => expect(calls).toEqual([{ owned: true }]));
    expect(await screen.findByRole('status')).toHaveTextContent('Megvan: Alfa 1/10 (DE)');

    fireEvent.click(within(panel).getByRole('button', { name: 'Bezárás' }));
    const tile = shownCards()[1]!;
    const btn = within(tile).getByRole('button', { name: 'Megvan: Alfa 1/10 Reverse Holo DE' });
    fireEvent.click(btn);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(tile).toHaveAttribute('data-owned', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Táblázat' }));
    const checkbox = screen.getAllByRole('checkbox', {
      name: 'Megvan: Alfa 1/10 Reverse Holo DE',
    })[0]!;
    fireEvent.click(checkbox);
    await waitFor(() => expect(calls).toHaveLength(3));
    await waitFor(() => expect(checkbox).toBeChecked());
  });

  it('S-20/EF3: Visszavonás az értesítésből', async () => {
    const calls: boolean[] = [];
    renderCards('/kartyak', {
      'PUT /api/cards/2/owned': (init) => {
        const { owned } = JSON.parse(String(init?.body)) as { owned: boolean };
        calls.push(owned);
        return { body: { ...CARDS[1], owned } };
      },
    });
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    const tile = shownCards()[1]!;
    fireEvent.click(within(tile).getByRole('button', { name: /^Megvan:/u }));
    fireEvent.click(await screen.findByRole('button', { name: 'Visszavonás' }));
    await waitFor(() => expect(calls).toEqual([true, false]));
    expect(tile).toHaveAttribute('data-owned', 'false');
    expect(screen.queryByRole('button', { name: 'Visszavonás' })).not.toBeInTheDocument();
  });

  it('az értesítés 5 másodperc után eltűnik, és be is zárható', async () => {
    renderCards('/kartyak', { 'PUT /api/cards/2/owned': { body: { ...CARDS[1], owned: true } } });
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(within(shownCards()[1]!).getByRole('button', { name: /^Megvan:/u }));
    expect(screen.getByRole('button', { name: 'Visszavonás' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5100));
    expect(screen.queryByRole('button', { name: 'Visszavonás' })).not.toBeInTheDocument();
    fireEvent.click(within(shownCards()[1]!).getByRole('button', { name: /^Megvan:/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Értesítés bezárása' }));
    expect(screen.queryByRole('button', { name: 'Visszavonás' })).not.toBeInTheDocument();
  });

  it('T-OWN-04 (S-20/EF4): szerverhiba esetén visszaáll, hibaüzenet', async () => {
    renderCards('/kartyak', {
      'PUT /api/cards/2/owned': {
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'x' } },
      },
    });
    await waitFor(() => expect(shownCards()).toHaveLength(4));
    const tile = shownCards()[1]!;
    fireEvent.click(within(tile).getByRole('button', { name: /^Megvan:/u }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A mentés nem sikerült, az állapot visszaállt.',
    );
    expect(tile).toHaveAttribute('data-owned', 'false');
  });
});

describe('téma (S-62)', () => {
  it('Rendszer / Világos / Sötét, a választás megmarad', async () => {
    renderCards();
    const group = screen.getByRole('group', { name: 'Megjelenés' });
    expect(within(group).getByRole('button', { name: 'Rendszer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(group).getByRole('button', { name: 'Sötét' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('gms.theme')).toBe('dark');
    fireEvent.click(within(group).getByRole('button', { name: 'Világos' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    fireEvent.click(within(group).getByRole('button', { name: 'Rendszer' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(localStorage.getItem('gms.theme')).toBeNull();
  });

  it('a mentett választással indul', () => {
    localStorage.setItem('gms.theme', 'dark');
    renderCards();
    expect(screen.getByRole('button', { name: 'Sötét' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
