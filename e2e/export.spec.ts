import { expect, test } from '@playwright/test';

test('S-50/S-51: a lista Export gombja letölt, a fájlnév a szűrőkből készül', async ({ page }) => {
  await page.goto('/kartyak?allapot=hianyzik');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^GMS-hianylista-\d{4}-\d{2}-\d{2}\.csv$/u);
});

test('S-50: a Beállítások oldalon teljes XLSX export tölthető le', async ({ page }) => {
  await page.goto('/beallitasok');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel (XLSX)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^GMS-export-\d{4}-\d{2}-\d{2}\.xlsx$/u);
});

test('S-53: nincs OneDrive mappa beállítva, a mentési blokk ezt mutatja', async ({ page }) => {
  await page.goto('/beallitasok');
  await expect(page.getByTestId('backup-block')).toContainText('Nincs OneDrive mappa');
});
