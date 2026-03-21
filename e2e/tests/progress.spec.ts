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

    // Wait for the initial data load to complete before switching ranges.
    // The Calories heading only renders when !loading && !error, so this confirms
    // the initial fetch succeeded and avoids a race where the range switch fires
    // before earliestLogDate has resolved and the first fetch has started.
    await expect(page.getByRole('heading', { name: 'Calories', exact: true })).toBeVisible()

    // Click "YTD" — selector should update and data should reload
    await page.getByRole('button', { name: 'YTD' }).click()

    // The Calories card should still render (chart or no-data placeholder)
    await expect(page.getByRole('heading', { name: 'Calories', exact: true })).toBeVisible()

    // Click "All"
    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.getByRole('heading', { name: 'Calories', exact: true })).toBeVisible()
  })

  test('Period Summary shows estimated weight impact when data exists', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByText('Period Summary')).toBeVisible()

    // Switch to All-time to maximise the chance data is present
    await page.getByRole('button', { name: 'All' }).click()

    // Wait for stats to load — "Days Tracked" cell proves data arrived
    await expect(page.getByText('Days Tracked')).toBeVisible()

    // The estimated weight impact footer should render a ±X.XX lbs figure.
    // This proves the backend is computing and returning estimated_weight_change_lbs.
    await expect(page.locator('text=/[+-]?\\d+\\.\\d+ lbs/')).toBeVisible()
  })

  test('FAB opens log-weight modal with today pre-filled', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByText('Period Summary')).toBeVisible()

    // Click the FAB (fixed bottom-right button)
    await page.locator('button.fixed.bottom-6.right-6').click()

    // Log Weight modal should open
    await expect(page.getByRole('heading', { name: 'Log Weight' })).toBeVisible()

    // Date field should default to today. Compare against the input's own max
    // attribute (set by the app to todayString()) rather than computing the date
    // here — avoids UTC vs local-time skew between the test runner and the browser.
    const dateInput = page.locator('#lw-date')
    const maxDate = await dateInput.getAttribute('max')
    await expect(dateInput).toHaveValue(maxDate!)
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
