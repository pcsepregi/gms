import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Szintetikus fixture: 43 kártya, 22 megvan, 21 hiányzik; németből 4 (1 hiányzik).

test('T-DSH-02 (S-30): a nyitóoldal a dashboard, a számok helyesek', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hero-owned')).toHaveText('22');
  await expect(page.getByTestId('hero')).toContainText('/ 43');
  await expect(page.getByTestId('hero-percent')).toHaveText('51%');
  await expect(page.getByRole('heading', { name: 'Nyelvek' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Majdnem kész' })).toBeVisible();
});

test('T-DSH-06 (S-33/EF1): a Német sávra kattintva a hiányzó német lapok listája nyílik', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^Német 3 \/ 4/u }).click();
  await expect(page).toHaveURL(/\/kartyak\?nyelv=DE&allapot=hianyzik$/u);
  await expect(page.getByTestId('card')).toHaveCount(1);
});

test('T-DSH-07 (S-33/EF2): "Majdnem kész" elem a hiányzó lapokra vezet', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.closest-item').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/kartyak\?.*allapot=hianyzik/u);
});

test('T-DSH-08 (S-31/EF3): jelölés után a dashboard száma eggyel változik, majd visszaáll', async ({
  page,
  request,
}) => {
  const cards = (await (await request.get('/api/cards')).json()) as {
    id: number;
    owned: boolean;
  }[];
  const target = cards.find((c) => !c.owned)!;
  await page.goto('/');
  await expect(page.getByTestId('hero-owned')).toHaveText('22');
  await request.put(`/api/cards/${target.id}/owned`, { data: { owned: true } });
  try {
    await page.goto('/');
    await expect(page.getByTestId('hero-owned')).toHaveText('23');
    await expect(page.locator('.recent-item').first()).toBeVisible();
    await page.locator('.recent-item').first().click();
    await expect(page).toHaveURL(new RegExp(`/kartyak/${target.id}$`, 'u'));
  } finally {
    await request.put(`/api/cards/${target.id}/owned`, { data: { owned: false } });
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`T-UI-03 (S-62/EF3): a dashboardon nincs komoly akadálymentességi hiba (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.getByTestId('hero')).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    const bad = result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} – ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(bad).toEqual([]);
  });
}

test('böngésző-ikon és fülcím', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    '/favicon.svg',
  );
  for (const file of ['/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png']) {
    const res = await request.get(file);
    expect(res.status(), file).toBe(200);
  }
  await expect(page).not.toHaveTitle('GMS');
});
