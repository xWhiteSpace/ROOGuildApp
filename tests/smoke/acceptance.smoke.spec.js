import { expect, test } from '@playwright/test';

test('local Chromium opens the landing page', async ({ page }) => {
  await page.goto('/landing');
  await expect(page.getByRole('heading', { name: 'VALHALLA' })).toBeAttached();
  await expect(page.getByRole('link', { name: 'Sign in with Discord' })).toBeVisible();
});
