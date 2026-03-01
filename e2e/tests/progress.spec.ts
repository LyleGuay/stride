import { test, expect } from '@playwright/test'

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

// Log in and navigate to the calorie log before each test.
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
})

test.describe('Progress tab', () => {
  test('Progress tab loads and shows range selector', async ({ page }) => {
    // Click the "Progress" tab button in the segment control
    await page.getByRole('button', { name: 'Progress' }).click()

    // Period Summary card should appear with all five range pills
    await expect(page.getByText('Period Summary')).toBeVisible()
    await expect(page.getByRole('button', { name: '1M' })).toBeVisible()
    await expect(page.getByRole('button', { name: '6M' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'YTD' })).toBeVisible()
    await expect(page.getByRole('button', { name: '1Y' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
  })

  test('switching range updates the selector', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()

    // Wait for Period Summary card to be visible
    await expect(page.getByText('Period Summary')).toBeVisible()

    // Click "YTD" — selector should update
    await page.getByRole('button', { name: 'YTD' }).click()

    // The Calories card should still render (chart or no-data placeholder)
    await expect(page.getByText('Calories')).toBeVisible()

    // Click "All"
    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.getByText('Calories')).toBeVisible()
  })

  test('FAB opens log-weight modal with today pre-filled', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByText('Period Summary')).toBeVisible()

    // Click the FAB (fixed bottom-right button)
    await page.locator('button.fixed.bottom-6.right-6').click()

    // Log Weight modal should open
    await expect(page.getByRole('heading', { name: 'Log Weight' })).toBeVisible()

    // Date field should default to today in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10)
    const dateInput = page.locator('#lw-date')
    await expect(dateInput).toHaveValue(today)
  })

  test('log a weight entry — entry appears in weight table', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByText('Period Summary')).toBeVisible()

    // Open the log-weight modal
    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('heading', { name: 'Log Weight' })).toBeVisible()

    // Enter a weight value
    const testWeight = '175.5'
    await page.locator('#lw-weight').fill(testWeight)

    // Save
    await page.getByRole('button', { name: 'Save Weight' }).click()

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Log Weight' })).not.toBeVisible()

    // Switch weight card to "Table" view and verify the entry is listed
    await page.getByRole('button', { name: /table/i }).click()
    await expect(page.getByRole('cell', { name: testWeight })).toBeVisible()
  })
})
