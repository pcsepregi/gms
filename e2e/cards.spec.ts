import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// A szintetikus fixture: 43 kártya, 22 megvan, 21 hiányzik; németből 4 (1 hiányzik).
const cards = (page: Page) => page.getByTestId('card');
const count = (page: Page) => page.getByTestId('result-count');

async function openList(page: Page, query = '') {
  await page.goto(`/kartyak${query}`);
  await expect(cards(page).first()).toBeVisible();
}

test.describe('kártyalista (S-10, S-11)', () => {
  test('T-LST-01/02: minden kártya a mezőivel, a hiányzók jelölve', async ({ page }) => {
    await openList(page);
    await expect(cards(page)).toHaveCount(43);
    await expect(count(page)).toHaveText('43 kártya, ebből 21 hiányzik');
    const missing = page.locator('[data-testid=card][data-owned=false]');
    await expect(missing).toHaveCount(21);
    await expect(missing.first().getByText('Hiányzik')).toBeVisible();
    await expect(
      page.locator('[data-testid=card][data-owned=true]').first().getByText('Hiányzik'),
    ).toHaveCount(0);
    const promo = cards(page).filter({ hasText: '007/SV-P' });
    for (const text of ['Oinkologne ex', 'SV Black Star Promos', 'SVP', 'Holo', 'Angol']) {
      await expect(promo.getByText(text, { exact: true }).first()).toBeVisible();
    }
  });

  test('T-LST-03 (S-10/EF3): görgetés közben nincs 50 ms-nál hosszabb blokk', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'A longtask mérés csak Chromiumban érhető el.');
    await openList(page);
    await page.evaluate(() => {
      (window as unknown as { __long: number[] }).__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          (window as unknown as { __long: number[] }).__long.push(e.duration);
      }).observe({ type: 'longtask' });
    });
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(30);
    }
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    expect(long.filter((d) => d > 50)).toEqual([]);
  });

  test('T-LST-04 (S-10/EF4): kártyára kattintva megnyílik a részletek panel', async ({ page }) => {
    await openList(page);
    await cards(page).filter({ hasText: '007/SV-P' }).getByRole('link').click();
    await expect(page).toHaveURL(/\/kartyak\/\d+$/u);
    const panel = page.getByTestId('card-details');
    await expect(panel.getByRole('heading', { name: 'Oinkologne ex' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'https://example.org/promo/007' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/kartyak$/u);
    await expect(panel).toHaveCount(0);
  });

  test('T-LST-05 (S-11): táblázat nézet, újratöltés után is táblázat', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'Táblázat' }).click();
    const table = page.getByTestId('card-table');
    await expect(table.getByRole('columnheader')).toHaveText([
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
    await page.reload();
    await expect(page.getByTestId('card-table')).toBeVisible();
    await page.getByRole('button', { name: 'Rács' }).click();
    await expect(page.getByTestId('card-grid')).toBeVisible();
  });
});

test.describe('keresés, szűrés, URL (S-12 … S-16)', () => {
  test('T-SRC-05 (S-12/EF1): gépelés után legfeljebb 150 ms-on belül frissül a lista', async ({
    page,
  }) => {
    await openList(page);
    const elapsed = await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>('input[type=search]')!;
      const out = document.querySelector('[data-testid=result-count]')!;
      const before = out.textContent;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const t0 = performance.now();
      return new Promise<number>((resolve) => {
        new MutationObserver(() => {
          if (out.textContent !== before) resolve(performance.now() - t0);
        }).observe(out, { childList: true, characterData: true, subtree: true });
        setter.call(input, 'nemet reverse');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    expect(elapsed).toBeLessThan(150);
    await expect(count(page)).toHaveText(/^2 kártya/u);
  });

  test('T-SRC-06 (S-12/EF5): a "/" a keresőbe ugrik, az Esc törli', async ({ page }) => {
    await openList(page);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    const search = page.getByRole('searchbox', { name: 'Keresés' });
    await expect(search).toBeFocused();
    // A "007" a 007/SV-P promót és a vezető nullás 007-es lapot is megtalálja.
    await page.keyboard.type('007');
    await expect(cards(page)).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await expect(cards(page)).toHaveCount(43);
  });

  test('T-SRC-07 (S-12/EF6): nincs találat, a "Szűrők törlése" működik', async ({ page }) => {
    await page.goto('/kartyak?q=nincsilyenkartya');
    await expect(page.getByTestId('empty-state')).toContainText(
      'Nincs a feltételeknek megfelelő kártya.',
    );
    await page.getByRole('button', { name: 'Szűrők törlése' }).click();
    await expect(cards(page)).toHaveCount(43);
  });

  test('T-FLT-03 (S-13/EF4): szűrés után helyes a darabszám', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'Nyelv', exact: true }).click();
    await page
      .getByRole('group', { name: 'Nyelv' })
      .getByRole('checkbox', { name: /Német/u })
      .click();
    await page.keyboard.press('Escape');
    await expect(count(page)).toHaveText('4 kártya, ebből 1 hiányzik');
    await page.getByRole('button', { name: 'Hiányzik', exact: true }).click();
    await expect(count(page)).toHaveText('1 kártya, ebből 1 hiányzik');
    await expect(page).toHaveURL(/nyelv=DE&allapot=hianyzik$/u);
  });

  test('T-URL-01 (S-16/EF1-2): a szűrt lista URL-je új lapon ugyanazt mutatja', async ({
    page,
    context,
  }) => {
    await openList(page);
    await page.getByRole('searchbox', { name: 'Keresés' }).fill('reverse');
    await page.getByRole('button', { name: 'Hiányzik', exact: true }).click();
    // Csupa hiányzó lap: "N kártya, ebből N hiányzik".
    await expect(count(page)).toHaveText(/^(\d+) kártya, ebből \1 hiányzik$/u);
    await expect(count(page)).not.toHaveText(/^43 /u);
    const text = await count(page).textContent();
    const other = await context.newPage();
    await other.goto(page.url());
    await expect(count(other)).toHaveText(text!);
    await expect(other.getByRole('searchbox', { name: 'Keresés' })).toHaveValue('reverse');
    await expect(other.getByText('Állapot: Hiányzik')).toBeVisible();
  });

  test('T-URL-02 (S-16/EF3): a Vissza gomb az előző szűrési állapotra lép', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'Hiányzik', exact: true }).click();
    await expect(count(page)).toHaveText('21 kártya, ebből 21 hiányzik');
    await page.getByRole('button', { name: 'Pokémon', exact: true }).click();
    await page
      .getByRole('group', { name: 'Pokémon' })
      .getByRole('checkbox', { name: /^Oinkologne\s*\d/u })
      .click();
    await expect(page).toHaveURL(/pokemon=Oinkologne/u);
    await expect(count(page)).not.toHaveText('21 kártya, ebből 21 hiányzik');
    await page.goBack();
    await expect(count(page)).toHaveText('21 kártya, ebből 21 hiányzik');
    await page.goBack();
    await expect(count(page)).toHaveText('43 kártya, ebből 21 hiányzik');
  });
});

test.describe('jelölés (S-20)', () => {
  const promoGerman = (page: Page) => cards(page).filter({ hasText: 'Synthetic League Promo' });

  test('T-OWN-01/02/06: rácsból, panelről és táblázatból; újratöltés után is megmarad; a nyitóoldal is követi', async ({
    page,
  }) => {
    await openList(page, '?q=reverse+holo+angol');
    const card = cards(page).first();
    await expect(card).toHaveAttribute('data-owned', 'false');
    await card.getByRole('button', { name: /^Megvan:/u }).click();
    await expect(card).toHaveAttribute('data-owned', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'Megvan:' })).toBeVisible();

    await page.reload();
    await expect(cards(page).first()).toHaveAttribute('data-owned', 'true');
    await page.goto('/');
    await expect(page.getByText('23 / 43 kártya megvan')).toBeVisible();

    // Panelről vissza.
    await openList(page, '?q=reverse+holo+angol');
    await cards(page).first().getByRole('link').click();
    const sw = page.getByTestId('card-details').getByRole('switch', { name: 'Megvan' });
    await expect(sw).toBeChecked();
    await sw.click({ force: true });
    await expect(sw).not.toBeChecked();
    await page.keyboard.press('Escape');

    // Táblázatból oda-vissza.
    await page.getByRole('button', { name: 'Táblázat' }).click();
    const box = page.getByTestId('card-table').getByRole('checkbox').first();
    await box.click();
    await expect(box).toBeChecked();
    await box.click();
    await expect(box).not.toBeChecked();
    await page.getByRole('button', { name: 'Rács' }).click();

    await page.reload();
    await expect(cards(page).first()).toHaveAttribute('data-owned', 'false');
    await page.goto('/');
    await expect(page.getByText('22 / 43 kártya megvan')).toBeVisible();
  });

  test('T-OWN-03 (S-20/EF3): Visszavonás 5 mp-en belül, az adatbázisban is', async ({
    page,
    request,
  }) => {
    await openList(page, '?q=synthetic+league');
    const card = promoGerman(page);
    await expect(card).toHaveAttribute('data-owned', 'true');
    await card.getByRole('button', { name: /^Megvan:/u }).click();
    await expect(card).toHaveAttribute('data-owned', 'false');
    await page.getByRole('button', { name: 'Visszavonás' }).click();
    await expect(card).toHaveAttribute('data-owned', 'true');
    await expect
      .poll(async () => {
        const all = (await (await request.get('/api/cards')).json()) as {
          setName: string;
          owned: boolean;
        }[];
        return all.find((c) => c.setName === 'Synthetic League Promo')?.owned;
      })
      .toBe(true);
  });

  test('T-PRF-05: jelölés kattintástól a látható változásig < 100 ms', async ({ page }) => {
    await openList(page, '?q=synthetic+league');
    const measure = () =>
      page.evaluate(async () => {
        const tile = document.querySelector<HTMLElement>('[data-testid=card]')!;
        const button = tile.querySelector<HTMLButtonElement>('button.own-toggle')!;
        const before = tile.dataset.owned;
        const t0 = performance.now();
        return new Promise<number>((resolve) => {
          new MutationObserver(() => {
            if (tile.dataset.owned !== before) resolve(performance.now() - t0);
          }).observe(tile, { attributes: true });
          button.click();
        });
      });
    expect(await measure()).toBeLessThan(100);
    await page.waitForTimeout(200);
    expect(await measure()).toBeLessThan(100); // vissza az eredeti állapotra
    await page.waitForTimeout(200);
    await expect(promoGerman(page)).toHaveAttribute('data-owned', 'true');
  });
});

test.describe('megjelenés (S-62)', () => {
  const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test('T-UI-01 (S-62/EF1): a rendszer témáját követi, és váltáskor automatikusan vált', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openList(page);
    expect(await bg(page)).toBe('rgb(245, 243, 239)');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await bg(page)).toBe('rgb(24, 23, 21)');
  });

  test('T-UI-02 (S-62/EF2): Sötétre kapcsolva újratöltés után is sötét', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openList(page);
    await page
      .getByRole('group', { name: 'Megjelenés' })
      .getByRole('button', { name: 'Sötét' })
      .click();
    expect(await bg(page)).toBe('rgb(24, 23, 21)');
    await page.reload();
    expect(await bg(page)).toBe('rgb(24, 23, 21)');
    await expect(page.getByRole('button', { name: 'Sötét' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Rendszer' }).click();
    expect(await bg(page)).toBe('rgb(245, 243, 239)');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`T-UI-03 (S-62/EF3): nincs komoly akadálymentességi hiba (${scheme})`, async ({
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
      await openList(page, '?allapot=hianyzik');
      await check('rács');
      await page.getByRole('button', { name: 'Nyelv', exact: true }).click();
      await check('szűrő');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Táblázat' }).click();
      await check('táblázat');
      await page.getByTestId('card-table').getByRole('link').first().click();
      await expect(page.getByTestId('card-details')).toBeVisible();
      await check('panel');
      await page.goto('/');
      await expect(page.getByText(/kártya megvan/u)).toBeVisible();
      await check('nyitóoldal');
      await page.goto('/beallitasok');
      await expect(page.getByTestId('import-summary')).toBeVisible();
      await check('beállítások');
    });
  }
});
