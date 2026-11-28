import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { ImportSummary } from '@gms/shared';
import { App } from '../src/App';
import { mockApi, renderWithProviders } from './render';

const summary: ImportSummary = {
  importedAt: '2026-11-27T12:00:00.000Z',
  sourceFile: 'sample-master.xlsx',
  total: 43,
  owned: 22,
  missing: 21,
  byLanguage: [
    { name: 'English', nameHu: 'Angol', shortCode: 'EN', owned: 3, all: 4 },
    { name: 'German', nameHu: 'Német', shortCode: 'DE', owned: 2, all: 4 },
  ],
  finishesFromDictionary: 4,
  newFinishes: ['Holo'],
  needsCheck: 2,
  warnings: ['47. sor: a kártyaszám számként volt tárolva'],
};

const health = {
  ok: true,
  version: '0.1.0',
  dbPath: '/x/gms.sqlite',
  appTitle: 'Teszt gyűjtemény',
};

afterEach(() => vi.unstubAllGlobals());

describe('Beállítások oldal (S-02/EF3)', () => {
  it('megmutatja az import összesítőt', async () => {
    mockApi({
      '/api/health': { body: health },
      '/api/import/summary': { body: summary },
    });
    renderWithProviders(<App />, '/beallitasok');

    const box = await screen.findByTestId('import-summary');
    expect(within(box).getByTestId('summary-total')).toHaveTextContent('43');
    expect(within(box).getByTestId('summary-owned')).toHaveTextContent('22');
    expect(within(box).getByTestId('summary-missing')).toHaveTextContent('21');
    expect(within(box).getByText('Német').closest('tr')).toHaveTextContent('2 / 4');
    expect(within(box).getByText(/Új nyomási változatok/u)).toHaveTextContent('Holo');
    expect(within(box).getByText(/Figyelmeztetések \(1\)/u)).toBeInTheDocument();
    expect(await screen.findByText('Teszt gyűjtemény')).toBeInTheDocument();
    expect(await screen.findByText(/Verzió: 0\.1\.0/u)).toBeInTheDocument();
  });

  it('import előtt: "Még nem volt import."', async () => {
    mockApi({
      '/api/health': { body: health },
      '/api/import/summary': {
        status: 404,
        body: { error: { code: 'NOT_IMPORTED', message: 'Még nem volt import.' } },
      },
    });
    renderWithProviders(<App />, '/beallitasok');
    expect(await screen.findByText('Még nem volt import.')).toBeInTheDocument();
    expect(screen.queryByTestId('import-summary')).not.toBeInTheDocument();
  });

  it('szerverhiba: hibaüzenet', async () => {
    mockApi({
      '/api/health': { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } },
      '/api/import/summary': { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } },
    });
    renderWithProviders(<App />, '/beallitasok');
    expect(await screen.findByRole('alert')).toHaveTextContent('Az adatok nem tölthetők be.');
    expect(screen.getByText('GMS')).toBeInTheDocument();
  });
});

describe('Áttekintés oldal', () => {
  it('megvan / összes kártya', async () => {
    mockApi({
      '/api/health': { body: health },
      '/api/cards': {
        body: [
          { owned: true, image: { status: 'exact' } },
          { owned: false, image: { status: 'none' } },
          { owned: true, image: { status: 'exact' } },
        ],
      },
    });
    renderWithProviders(<App />, '/');
    expect(await screen.findByText('2 / 3 kártya megvan')).toBeInTheDocument();
  });

  it('üres adatbázis', async () => {
    mockApi({ '/api/health': { body: health }, '/api/cards': { body: [] } });
    renderWithProviders(<App />, '/');
    expect(await screen.findByText(/Még nincs kártya/u)).toBeInTheDocument();
  });

  it('hiba nem JSON válasznál is', async () => {
    mockApi({ '/api/health': { body: health } });
    renderWithProviders(<App />, '/');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
