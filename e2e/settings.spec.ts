import { expect, test } from '@playwright/test';

test('T-IMP-12 (S-02/EF3): a Beállítások oldalon látszik az import összesítő', async ({ page }) => {
  await page.goto('/beallitasok');
  const summary = page.getByTestId('import-summary');
  await expect(summary).toBeVisible();
  await expect(summary.getByTestId('summary-total')).toHaveText('43');
  await expect(summary.getByTestId('summary-owned')).toHaveText('22');
  await expect(summary.getByTestId('summary-missing')).toHaveText('21');
  await expect(summary.getByRole('row', { name: /Német/u })).toContainText('3 / 4');
});

test('ET-04: a nyitóoldal betölt, a menüből elérhetők a Beállítások', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect((await health.json()).ok).toBe(true);
  await page.goto('/');
  await expect(page.getByText('22 / 43 kártya megvan')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Beállítások' })).toBeVisible();
  await page.getByRole('link', { name: 'Beállítások' }).click();
  await expect(page).toHaveURL(/\/beallitasok$/u);
});
