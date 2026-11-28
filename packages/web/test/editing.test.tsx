import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import type { Card, Lookups } from '@gms/shared';
import { App } from '../src/App';
import { mockApi, renderWithProviders } from './render';

const health = { ok: true, version: '0.3.0', dbPath: '/x', appTitle: 'Teszt' };

const EN = { id: 1, name: 'English', nameHu: 'Angol', shortCode: 'EN', sortOrder: 1 };
const DE = { id: 3, name: 'German', nameHu: 'Német', shortCode: 'DE', sortOrder: 3 };

const LOOKUPS: Lookups = {
  languages: [
    { ...EN, imageCode: 'en' },
    { ...DE, imageCode: 'de' },
  ],
  finishes: [
    { id: 1, name: 'Normal', description: 'Sima nyomat.', sortOrder: 1 },
    { id: 2, name: 'Reverse Holo', description: 'Fordított fólia.', sortOrder: 2 },
  ],
  pokemon: ['Alfa', 'Béta'],
  sets: [
    { name: 'Első set', codes: ['ES'] },
    { name: 'Kétkódú set', codes: ['K1', 'K2'] },
  ],
};

function card(id: number, p: Partial<Card> = {}): Card {
  return {
    id,
    displayId: `EN-Alfa-1/10-Normal`,
    owned: false,
    onTheWay: false,
    pokemon: 'Alfa',
    setName: 'Első set',
    setCode: 'ES',
    cardNumber: '1/10',
    finish: { id: 1, name: 'Normal', description: 'Sima nyomat.' },
    language: EN,
    note: '',
    image: { status: 'exact', url: null, thumbUrl: null, languageId: null, languageNameHu: null },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  };
}

const CARDS = [
  card(1),
  card(2, { pokemon: 'Béta', displayId: 'DE-Béta-2/10-Normal', language: DE, cardNumber: '2/10' }),
];

function Location() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderApp(path: string, extra: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    '/api/health': { body: health },
    '/api/cards': { body: CARDS },
    '/api/lookups': { body: LOOKUPS },
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

const form = () => screen.getByTestId('card-form');
/** A mező a felirata szerint; a nem kötelező mezők felirata " nem kötelező" utótagot kap. */
const field = (label: string) =>
  within(form()).getByLabelText(new RegExp(`^${label}( nem kötelező)?$`, 'u'));
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const submit = () => within(form()).getByRole('button', { name: /Felvétel|Mentés/u });
const location = () => screen.getByTestId('location').textContent;

function bodyOf(fetchMock: ReturnType<typeof mockApi>, method: string, url: string) {
  const call = fetchMock.mock.calls.find(
    ([u, init]) => u === url && (init as RequestInit | undefined)?.method === method,
  );
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

async function openNew(extra: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = renderApp('/kartyak/uj', extra);
  await screen.findByRole('heading', { name: 'Új kártya' });
  await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(2));
  return fetchMock;
}

async function fillValid() {
  type('Pokémon', 'Gamma');
  type('Set', 'Első set');
  type('Kártyaszám', '3/10');
  type('Nyomási változat', 'Normal');
  type('Nyelv', 'Angol');
  await waitFor(() => expect(submit()).toBeEnabled());
}

describe('új kártya űrlap (S-21)', () => {
  it('az "Új kártya" gomb megnyitja az űrlapot, a Mégse bezárja', async () => {
    renderApp('/kartyak?allapot=hianyzik');
    fireEvent.click(await screen.findByRole('link', { name: 'Új kártya' }));
    expect(location()).toBe('/kartyak/uj?allapot=hianyzik');
    expect(await screen.findByRole('heading', { name: 'Új kártya' })).toBeInTheDocument();
    fireEvent.click(within(form()).getByRole('button', { name: 'Mégse' }));
    expect(location()).toBe('/kartyak?allapot=hianyzik');
    expect(screen.queryByTestId('card-form')).not.toBeInTheDocument();
  });

  it('T-CRD-02: kötelező mezők üresen → a mentés tiltott, mezőnként magyar hibaüzenet', async () => {
    await openNew();
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId('form-status')).toHaveTextContent(
      'Még hiányzik: Pokémon, Set, Kártyaszám, Nyomási változat, Nyelv.',
    );
    for (const label of ['Pokémon', 'Set', 'Kártyaszám', 'Nyomási változat', 'Nyelv']) {
      fireEvent.blur(field(label));
    }
    const errors = within(form()).getAllByText('Kötelező mező.');
    expect(errors).toHaveLength(5);
    expect(field('Kártyaszám')).toHaveAttribute('aria-invalid', 'true');
    // A setkód és a megjegyzés nem kötelező.
    expect(field('Setkód')).not.toHaveAttribute('aria-invalid');
  });

  it('T-CRD-04: a kombinált mező felajánlja a meglévő értékeket, szűr, új érték is elfogadott', async () => {
    await openNew();
    const input = field('Pokémon');
    fireEvent.focus(input);
    const list = screen.getByRole('listbox', { name: 'Pokémon: javaslatok' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Alfa', 'Béta']);
    // Ékezet nélkül is talál.
    type('Pokémon', 'bet');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Béta']);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('Béta');
    // Pontos egyezésnél a lista nem takarja el a következő mezőt.
    type('Pokémon', 'beta');
    expect(screen.queryByRole('listbox', { name: 'Pokémon: javaslatok' })).not.toBeInTheDocument();
    // Új érték: jelzés, de elfogadja.
    type('Pokémon', 'Pikachu');
    expect(within(form()).getByText(/Új Pokémon/u)).toBeInTheDocument();
    // Escape csak a listát zárja, a panelt nem.
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByTestId('card-form')).toBeInTheDocument();
  });

  it('T-CRD-05: ismert set választásakor a setkód kitöltődik, több kódú setnél nem', async () => {
    await openNew();
    fireEvent.focus(field('Set'));
    fireEvent.mouseDown(screen.getByRole('option', { name: /Első set/u }));
    expect(field('Set')).toHaveValue('Első set');
    expect(field('Setkód')).toHaveValue('ES');
    type('Set', 'Kétkódú set');
    expect(field('Setkód')).toHaveValue('ES');
    // A kézzel beírt kódot nem írja felül.
    type('Setkód', '');
    type('Set', 'Kétkódú set');
    expect(field('Setkód')).toHaveValue('');
    type('Setkód', 'SAJAT');
    type('Set', 'Első set');
    expect(field('Setkód')).toHaveValue('SAJAT');
  });

  it('a finish leírása súgóként, ismeretlen finish és nyelv jelzése', async () => {
    await openNew();
    type('Nyomási változat', 'reverse holo');
    expect(field('Nyomási változat')).toHaveAccessibleDescription('Fordított fólia.');
    type('Nyomási változat', 'Galaxis');
    expect(within(form()).getByText(/Új nyomási változat/u)).toBeInTheDocument();
    type('Nyelv', 'nemet');
    expect(within(form()).queryByText(/Új nyelv/u)).not.toBeInTheDocument();
    type('Nyelv', 'Holland');
    expect(within(form()).getByText(/Új nyelv/u)).toBeInTheDocument();
  });

  it('T-DUP-02: létező kártya adatai → figyelmeztetés linkkel, a mentés tiltott', async () => {
    await openNew();
    type('Pokémon', ' alfa ');
    type('Set', 'ELSŐ SET');
    type('Kártyaszám', '1/10');
    type('Nyomási változat', 'normal');
    type('Nyelv', 'EN');
    const warning = await screen.findByTestId('duplicate-warning');
    expect(warning).toHaveTextContent('Ez a kártya már szerepel:EN-Alfa-1/10-Normal');
    expect(within(warning).getByRole('link', { name: 'Megnyitás' })).toHaveAttribute(
      'href',
      '/kartyak/1',
    );
    expect(submit()).toBeDisabled();
    type('Kártyaszám', '1/11');
    expect(screen.queryByTestId('duplicate-warning')).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it('T-CRD-01: mentés → POST, értesítés, a részletek panel nyílik', async () => {
    const created = card(9, {
      pokemon: 'Gamma',
      cardNumber: '3/10',
      displayId: 'EN-Gamma-3/10-Normal',
    });
    const fetchMock = await openNew({ 'POST /api/cards': { status: 201, body: created } });
    await fillValid();
    type('Megjegyzés', 'Első példány');
    fireEvent.click(submit());
    await waitFor(() => expect(location()).toBe('/kartyak/9'));
    expect(bodyOf(fetchMock, 'POST', '/api/cards')).toEqual({
      owned: false,
      pokemon: 'Gamma',
      setName: 'Első set',
      setCode: 'ES',
      cardNumber: '3/10',
      finishId: 1,
      languageId: 1,
      note: 'Első példány',
    });
    expect(await screen.findByText('Felvéve: Gamma 3/10 (EN)')).toBeInTheDocument();
  });

  it('T-CRD-06 (felület): új finish és új nyelv előbb a szótárba kerül, majd a kártya velük', async () => {
    const fetchMock = await openNew({
      'POST /api/finishes': {
        status: 201,
        body: { id: 7, name: 'Galaxis', description: null, sortOrder: 3 },
      },
      'POST /api/languages': {
        status: 201,
        body: {
          id: 14,
          name: 'Holland',
          nameHu: 'Holland',
          shortCode: 'HO',
          imageCode: null,
          sortOrder: 14,
        },
      },
      'POST /api/cards': { status: 201, body: card(9) },
    });
    await fillValid();
    type('Nyomási változat', 'Galaxis');
    type('Nyelv', 'Holland');
    fireEvent.click(submit());
    await waitFor(() => expect(location()).toBe('/kartyak/9'));
    expect(bodyOf(fetchMock, 'POST', '/api/finishes')).toEqual({ name: 'Galaxis' });
    expect(bodyOf(fetchMock, 'POST', '/api/languages')).toEqual({ name: 'Holland' });
    expect(bodyOf(fetchMock, 'POST', '/api/cards')).toMatchObject({ finishId: 7, languageId: 14 });
  });

  it('szerver oldali hibák: 409 → figyelmeztetés, 400 → mezőnkénti hiba', async () => {
    let reply: { status: number; body: unknown } = {
      status: 409,
      body: {
        error: {
          code: 'DUPLICATE',
          message: 'x',
          details: { id: 2, displayId: 'DE-Béta-2/10-Normal' },
        },
      },
    };
    await openNew({ 'POST /api/cards': () => reply });
    await fillValid();
    fireEvent.click(submit());
    expect(await screen.findByTestId('duplicate-warning')).toHaveTextContent('DE-Béta-2/10-Normal');
    reply = {
      status: 400,
      body: { error: { code: 'VALIDATION', message: 'x', details: { cardNumber: 'Hibás szám.' } } },
    };
    type('Kártyaszám', '4/10');
    fireEvent.click(submit());
    expect(await within(form()).findByText('Hibás szám.')).toBeInTheDocument();
  });
});

describe('szerkesztés és törlés (S-23, S-24)', () => {
  async function openDetails(extra: Parameters<typeof mockApi>[0] = {}) {
    const fetchMock = renderApp('/kartyak/1', extra);
    const panel = await screen.findByTestId('card-details');
    await within(panel).findByRole('heading', { name: 'Alfa' });
    return { fetchMock, panel };
  }

  it('T-EDT-01: a panelen minden mező szerkeszthető, mentés után a lista mutatja', async () => {
    const saved = card(1, { pokemon: 'Alfa', cardNumber: '1/12', note: 'jegyzet' });
    let patched = false;
    const { fetchMock, panel } = await openDetails({
      'PATCH /api/cards/1': () => {
        patched = true;
        return { body: saved };
      },
      '/api/cards': () => ({ body: patched ? [saved, CARDS[1]] : CARDS }),
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Szerkesztés' }));
    expect(within(panel).getByRole('heading', { name: 'Kártya szerkesztése' })).toBeInTheDocument();
    expect(field('Pokémon')).toHaveValue('Alfa');
    expect(field('Nyelv')).toHaveValue('Angol');
    expect(field('Nyomási változat')).toHaveValue('Normal');
    type('Kártyaszám', '1/12');
    type('Megjegyzés', 'jegyzet');
    await waitFor(() => expect(submit()).toBeEnabled());
    fireEvent.click(submit());
    await within(panel).findByRole('heading', { name: 'Alfa' });
    expect(bodyOf(fetchMock, 'PATCH', '/api/cards/1')).toMatchObject({
      cardNumber: '1/12',
      note: 'jegyzet',
    });
    expect(await screen.findByText('Mentve: Alfa 1/12 (EN)')).toBeInTheDocument();
    expect(within(panel).getAllByText('1/12').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('card-grid')).getAllByText('1/12').length).toBeGreaterThan(0);
    expect(within(panel).getByText('jegyzet')).toBeInTheDocument();
  });

  it('szerkesztésben az Escape és a Mégse visszavisz a részletekhez', async () => {
    const { panel } = await openDetails();
    fireEvent.click(within(panel).getByRole('button', { name: 'Szerkesztés' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(panel).getByRole('heading', { name: 'Alfa' })).toBeInTheDocument();
    expect(location()).toBe('/kartyak/1');
  });

  it('T-EDT-02: megjegyzés 5000 karakter menthető, 5001 nem', async () => {
    const { panel } = await openDetails();
    fireEvent.click(within(panel).getByRole('button', { name: 'Szerkesztés' }));
    type('Megjegyzés', 'a'.repeat(5000));
    expect(within(form()).getByText('5000 / 5000')).toBeInTheDocument();
    await waitFor(() => expect(submit()).toBeEnabled());
    type('Megjegyzés', 'a'.repeat(5001));
    expect(submit()).toBeDisabled();
    fireEvent.blur(field('Megjegyzés'));
    expect(within(form()).getByText('Legfeljebb 5000 karakter.')).toBeInTheDocument();
  });

  it('T-EDT-02: a megjegyzésben lévő link kattintható, rel="noopener"', async () => {
    renderApp('/kartyak/1', {
      '/api/cards': { body: [card(1, { note: 'Lásd https://example.org/x itt' })] },
    });
    const link = await screen.findByRole('link', { name: 'https://example.org/x' });
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('T-DEL-02: Törlés → megerősítés; Mégse esetén nem változik semmi', async () => {
    const { fetchMock, panel } = await openDetails();
    fireEvent.click(within(panel).getByRole('button', { name: 'Törlés' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Biztosan törlöd?' });
    expect(dialog).toHaveTextContent('A kártya és a képe törlődik.');
    expect(within(dialog).getByRole('button', { name: 'Mégse' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mégse' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // Escape is Mégse, és a panel nyitva marad.
    fireEvent.click(within(panel).getByRole('button', { name: 'Törlés' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-details')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);
  });

  it('T-DEL-01: megerősítés után DELETE, a panel bezárul, értesítés', async () => {
    const { fetchMock, panel } = await openDetails({
      'DELETE /api/cards/1': { status: 204, body: null },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Törlés' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Törlés' }));
    await waitFor(() => expect(location()).toBe('/kartyak'));
    expect(
      fetchMock.mock.calls.some(
        ([u, init]) => u === '/api/cards/1' && (init as RequestInit)?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(await screen.findByText('Törölve: Alfa 1/10 (EN)')).toBeInTheDocument();
  });

  it('sikertelen törlés: hibaüzenet, a kártya marad', async () => {
    const { panel } = await openDetails({
      'DELETE /api/cards/1': { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Törlés' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Törlés' }),
    );
    expect(await screen.findByText('A törlés nem sikerült.')).toBeInTheDocument();
    expect(location()).toBe('/kartyak/1');
  });
});

describe('finish-szótár a Beállításokban (S-64)', () => {
  function renderSettings(extra: Parameters<typeof mockApi>[0] = {}) {
    return renderApp('/beallitasok', {
      '/api/import/summary': {
        status: 404,
        body: { error: { code: 'NOT_IMPORTED', message: '' } },
      },
      ...extra,
    });
  }

  it('a lista leírásokkal és darabszámmal; a leírás szerkeszthető', async () => {
    const fetchMock = renderSettings({
      'PATCH /api/finishes/2': { body: { ...LOOKUPS.finishes[1], description: 'Új leírás.' } },
    });
    const dict = await screen.findByTestId('finish-dictionary');
    const row = within(dict).getByRole('row', { name: /Reverse Holo/u });
    expect(row).toHaveTextContent('Fordított fólia.');
    await waitFor(() =>
      expect(within(dict).getByRole('row', { name: /Normal/u })).toHaveTextContent('2'),
    );
    fireEvent.click(within(row).getByRole('button', { name: 'Szerkesztés: Reverse Holo' }));
    const box = within(dict).getByLabelText('Leírás szerkesztése: Reverse Holo');
    fireEvent.change(box, { target: { value: 'Új leírás.' } });
    fireEvent.click(within(dict).getByRole('button', { name: 'Mentés' }));
    await screen.findByText('Leírás mentve.');
    expect(bodyOf(fetchMock, 'PATCH', '/api/finishes/2')).toEqual({ description: 'Új leírás.' });
  });

  it('új finish felvétele; létező névre hibaüzenet', async () => {
    let reply: { status: number; body: unknown } = {
      status: 201,
      body: { id: 9, name: 'Galaxis', description: 'Csillagos', sortOrder: 3 },
    };
    const fetchMock = renderSettings({ 'POST /api/finishes': () => reply });
    const form = await screen.findByTestId('new-finish');
    const add = within(form).getByRole('button', { name: 'Hozzáadás' });
    expect(add).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Név'), { target: { value: 'Galaxis' } });
    fireEvent.change(within(form).getByLabelText(/Leírás/u), { target: { value: 'Csillagos' } });
    fireEvent.click(add);
    await screen.findByText('Felvéve: Galaxis');
    expect(bodyOf(fetchMock, 'POST', '/api/finishes')).toEqual({
      name: 'Galaxis',
      description: 'Csillagos',
    });
    expect(within(form).getByLabelText('Név')).toHaveValue('');

    reply = {
      status: 409,
      body: { error: { code: 'DUPLICATE', message: 'x', details: { id: 2 } } },
    };
    fireEvent.change(within(form).getByLabelText('Név'), { target: { value: 'reverse holo' } });
    fireEvent.click(add);
    expect(
      await within(form).findByText('Ilyen nevű nyomási változat már van.'),
    ).toBeInTheDocument();
  });
});
