import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// A tesztek a közös fixture adatbázison futnak (43 kártya, 22 megvan), ezért minden
// létrehozott kártyát és módosított leírást visszaállítanak.
const TEST_POKEMON = ['Pikachu', 'Eevee', 'Teszt Törlés', '<script>window.__xss=1</script>'];

interface ApiCard {
  id: number;
  pokemon: string;
  displayId: string;
  owned: boolean;
  image: { status: string };
  finish: { id: number; name: string; description: string | null };
}

async function cleanup(request: APIRequestContext) {
  const cards = (await (await request.get('/api/cards')).json()) as ApiCard[];
  for (const c of cards.filter(
    (c) => TEST_POKEMON.includes(c.pokemon) || c.pokemon.startsWith('Átnevezett'),
  )) {
    await request.delete(`/api/cards/${c.id}`);
  }
}

async function createViaApi(request: APIRequestContext, pokemon: string, extra: object = {}) {
  const res = await request.post('/api/cards', {
    data: {
      pokemon,
      setName: 'Scarlet & Violet',
      setCode: 'SVI',
      cardNumber: '999/198',
      finishId: 1,
      languageId: 1,
      ...extra,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as ApiCard;
}

const form = (page: Page) => page.getByTestId('card-form');
const field = (page: Page, label: string) =>
  form(page).getByLabel(new RegExp(`^${label}( nem kötelező)?$`, 'u'));

test.afterEach(async ({ request }) => cleanup(request));

test('T-CRD-01, T-EXT-01 (S-21, S-63): új kártya új Pokémonnal; a listában, szűrőben, áttekintésben', async ({
  page,
  request,
}) => {
  await page.goto('/kartyak');
  await page.getByRole('link', { name: 'Új kártya' }).click();
  await expect(page).toHaveURL(/\/kartyak\/uj$/u);
  const save = form(page).getByRole('button', { name: 'Felvétel' });
  await expect(save).toBeDisabled();

  await field(page, 'Pokémon').fill('Pikachu');
  await field(page, 'Set').fill('scarlet');
  await page.getByRole('option', { name: /Scarlet & Violet/u }).click();
  await expect(field(page, 'Setkód')).toHaveValue('SVI');
  await field(page, 'Kártyaszám').fill('063/198');
  await field(page, 'Nyomási változat').fill('Normal');
  await field(page, 'Nyelv').fill('Angol');
  await field(page, 'Megjegyzés').fill('Ajándék lap');
  await save.click();

  await expect(page).toHaveURL(/\/kartyak\/\d+$/u);
  const panel = page.getByTestId('card-details');
  await expect(panel.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
  await expect(panel.getByText('EN-Pikachu-063/198-Normal')).toBeVisible();
  await expect(panel.getByRole('switch', { name: 'Megvan' })).not.toBeChecked();
  await page.keyboard.press('Escape');

  await expect(page.getByTestId('result-count')).toHaveText('44 kártya, ebből 22 hiányzik');
  const tile = page.getByTestId('card').filter({ hasText: 'Pikachu' });
  await expect(tile).toHaveAttribute('data-owned', 'false');

  // S-63/EF2: az új Pokémon megjelenik a szűrőben.
  await page.getByRole('button', { name: 'Pokémon', exact: true }).click();
  // Vezérelt jelölőnégyzet: click() + ellenőrzés (nem check()).
  await page.getByRole('checkbox', { name: /Pikachu/u }).click();
  await expect(page.getByRole('checkbox', { name: /Pikachu/u })).toBeChecked();
  await expect(page.getByTestId('result-count')).toHaveText('1 kártya, ebből 1 hiányzik');

  const created = ((await (await request.get('/api/cards')).json()) as ApiCard[]).find(
    (c) => c.pokemon === 'Pikachu',
  )!;
  expect(created.image.status).toBe('pending');

  await page.getByRole('link', { name: 'Áttekintés' }).click();
  await expect(page.getByText('22 / 44 kártya megvan')).toBeVisible();
});

test('T-DUP-02 (S-22): létező kártya begépelésekor figyelmeztet és nem menthető', async ({
  page,
}) => {
  await page.goto('/kartyak/uj');
  await field(page, 'Pokémon').fill('lechonk');
  await field(page, 'Set').fill('Scarlet & Violet');
  await field(page, 'Kártyaszám').fill('154/198');
  await field(page, 'Nyomási változat').fill('reverse holo');
  await field(page, 'Nyelv').fill('nemet');
  const warning = page.getByTestId('duplicate-warning');
  await expect(warning).toContainText('DE-Lechonk-154/198-Reverse_Holo');
  await expect(form(page).getByRole('button', { name: 'Felvétel' })).toBeDisabled();
  await warning.getByRole('link', { name: 'Megnyitás' }).click();
  await expect(
    page.getByTestId('card-details').getByText('DE-Lechonk-154/198-Reverse_Holo'),
  ).toBeVisible();
});

test('T-EDT-01 (S-23): minden mező szerkesztése, a lista azonnal mutatja', async ({
  page,
  request,
}) => {
  const card = await createViaApi(request, 'Eevee');
  await page.goto(`/kartyak/${card.id}`);
  const panel = page.getByTestId('card-details');
  await panel.getByRole('button', { name: 'Szerkesztés' }).click();
  await expect(panel.getByRole('heading', { name: 'Kártya szerkesztése' })).toBeVisible();

  await field(page, 'Pokémon').fill('Átnevezett Eevee');
  await field(page, 'Set').fill('SV Black Star Promos');
  await field(page, 'Setkód').fill('SVP');
  await field(page, 'Kártyaszám').fill('100/SV-P');
  await field(page, 'Nyomási változat').fill('Holo');
  await field(page, 'Nyelv').fill('Japán');
  // A kapcsoló felirata a kattintható felület (a jelölőnégyzet maga láthatatlan).
  await form(page).getByText('Megvan', { exact: true }).click();
  await expect(form(page).getByRole('switch', { name: 'Megvan' })).toBeChecked();
  await field(page, 'Megjegyzés').fill('Forrás: https://example.org/eevee');
  await form(page).getByRole('button', { name: 'Mentés' }).click();

  await expect(panel.getByRole('heading', { name: 'Átnevezett Eevee' })).toBeVisible();
  await expect(panel.getByText('JA-Átnevezett_Eevee-100/SV-P-Holo')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'https://example.org/eevee' })).toHaveAttribute(
    'rel',
    /noopener/u,
  );
  await page.keyboard.press('Escape');
  const tile = page.getByTestId('card').filter({ hasText: 'Átnevezett Eevee' });
  await expect(tile).toHaveAttribute('data-owned', 'true');
  await expect(tile).toContainText('SV Black Star Promos');
  await expect(tile).toContainText('Japán');
});

test('T-DEL-02, T-DEL-01 (S-24): Mégse esetén nincs változás, megerősítés után törlődik', async ({
  page,
}) => {
  await page.goto('/kartyak/uj');
  await field(page, 'Pokémon').fill('Teszt Törlés');
  await field(page, 'Set').fill('Scarlet & Violet');
  await field(page, 'Kártyaszám').fill('1/1');
  await field(page, 'Nyomási változat').fill('Normal');
  await field(page, 'Nyelv').fill('Angol');
  await form(page).getByRole('button', { name: 'Felvétel' }).click();
  const panel = page.getByTestId('card-details');
  await expect(panel.getByRole('heading', { name: 'Teszt Törlés' })).toBeVisible();

  await panel.getByRole('button', { name: 'Törlés' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Biztosan törlöd?' });
  await expect(dialog).toContainText('A kártya és a képe törlődik.');
  await dialog.getByRole('button', { name: 'Mégse' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: 'Teszt Törlés' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('22 / 44 kártya megvan')).toBeVisible();
  await page.goto('/kartyak?q=teszt');
  await page.getByTestId('card').getByRole('link').first().click();
  await panel.getByRole('button', { name: 'Törlés' }).click();
  await dialog.getByRole('button', { name: 'Törlés' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/kartyak\?q=teszt$/u);
  await expect(page.getByText('Törölve: Teszt Törlés 1/1 (EN)')).toBeVisible();
  await expect(page.getByTestId('card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Áttekintés' }).click();
  await expect(page.getByText('22 / 43 kártya megvan')).toBeVisible();
});

test('T-FIN-01 (S-64): finish leírás szerkesztése a Beállításokban, a kártyán is látszik', async ({
  page,
  request,
}) => {
  const lookups = await (await request.get('/api/lookups')).json();
  const holo = (
    lookups.finishes as { id: number; name: string; description: string | null }[]
  ).find((f) => f.name === 'Holo')!;
  try {
    await page.goto('/beallitasok');
    const dict = page.getByTestId('finish-dictionary');
    const row = dict.getByRole('row', { name: /^Holo/u });
    await row.getByRole('button', { name: 'Szerkesztés: Holo' }).click();
    await dict.getByLabel('Leírás szerkesztése: Holo').fill('Teljes fóliás kép.');
    await dict.getByRole('button', { name: 'Mentés' }).click();
    await expect(row).toContainText('Teljes fóliás kép.');

    await page.goto('/kartyak?q=007');
    await page.getByTestId('card').getByRole('link').first().click();
    await expect(page.getByTestId('finish-description')).toContainText('Teljes fóliás kép.');
  } finally {
    await request.patch(`/api/finishes/${holo.id}`, { data: { description: holo.description } });
  }
});

test('T-SEC-04: <script> és HTML a megjegyzésben és a setnévben szövegként jelenik meg', async ({
  page,
  request,
}) => {
  const card = await createViaApi(request, '<script>window.__xss=1</script>', {
    setName: '<img src=x onerror="window.__xss=2">',
    note: '<b>félkövér?</b> <script>window.__xss=3</script>',
  });
  await page.goto(`/kartyak/${card.id}`);
  const panel = page.getByTestId('card-details');
  await expect(panel.getByText('<b>félkövér?</b> <script>window.__xss=3</script>')).toBeVisible();
  await expect(panel.getByText('<img src=x onerror="window.__xss=2">')).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  await expect(page.locator('b', { hasText: 'félkövér?' })).toHaveCount(0);
});

test('T-UI-06: új kártya felvétele csak billentyűzettel', async ({ page }) => {
  await page.goto('/kartyak');
  await expect(page.getByTestId('card').first()).toBeVisible();
  await page.getByRole('link', { name: 'Új kártya' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Új kártya' })).toBeFocused();
  await page.keyboard.press('Tab'); // Bezárás gomb
  await page.keyboard.press('Tab');
  await expect(field(page, 'Pokémon')).toBeFocused();
  await page.keyboard.type('Pikachu');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Scarlet');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(field(page, 'Set')).toHaveValue('Scarlet & Violet');
  await page.keyboard.press('Tab');
  await expect(field(page, 'Setkód')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.type('025/198');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Normal');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Német');
  await page.keyboard.press('Enter');
  await expect(
    page.getByTestId('card-details').getByRole('heading', { name: 'Pikachu' }),
  ).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`T-UI-03: axe az űrlapon, a megerősítő ablakon és a Beállításokon (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const check = async (what: string) => {
      const result = await new AxeBuilder({ page }).analyze();
      const bad = result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${what}: ${v.id} – ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(bad).toEqual([]);
    };
    await page.goto('/kartyak/uj');
    await field(page, 'Pokémon').fill('Pikachu');
    await field(page, 'Nyomási változat').fill('Normal');
    await field(page, 'Kártyaszám').focus();
    await field(page, 'Kártyaszám').blur();
    await check('új kártya');
    await field(page, 'Set').focus();
    await expect(page.getByRole('listbox')).toBeVisible();
    await check('javaslatlista');

    await page.goto('/kartyak?q=007');
    await page.getByTestId('card').getByRole('link').first().click();
    await page.getByTestId('card-details').getByRole('button', { name: 'Szerkesztés' }).click();
    await check('szerkesztés');
    await page.getByTestId('card-details').getByRole('button', { name: 'Mégse' }).click();
    await page.getByTestId('card-details').getByRole('button', { name: 'Törlés' }).click();
    await check('megerősítés');
    await page.keyboard.press('Escape');

    await page.goto('/beallitasok');
    await expect(page.getByTestId('finish-dictionary')).toBeVisible();
    await check('beállítások');
  });
}
