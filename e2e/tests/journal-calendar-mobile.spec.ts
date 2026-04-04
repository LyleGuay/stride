import { test, expect, devices } from '@playwright/test'

// Mobile-specific E2E tests for the Journal calendar date picker.
// Runs at Pixel 7 viewport — test.use must be top-level in the file
// because Pixel 7 sets defaultBrowserType which forces a new worker.

test.use({ ...devices['Pixel 7'] })

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/journal')
  await page.waitForURL('**/journal')
})

test.describe('Journal — calendar date picker (mobile)', () => {
  test('calendar picker opens via tap on mobile viewport', async ({ page }) => {
    await page.getByRole('button', { name: 'Open date picker' }).tap()
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible()
  })

  test('selecting a past month date updates the date header', async ({ page }) => {
    await page.getByRole('button', { name: 'Open date picker' }).tap()
    await page.getByRole('button', { name: 'Previous month' }).tap()
    // Day 15 always exists in every month
    await page.getByRole('button', { name: '15' }).first().tap()

    await expect(page.getByRole('button', { name: 'Previous month' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Open date picker' })).not.toContainText('Today')
  })
})
