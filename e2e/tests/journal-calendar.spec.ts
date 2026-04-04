import { test, expect } from '@playwright/test'

// E2E tests for the Journal calendar date picker popover (desktop viewport).
// Mobile tests are in journal-calendar-mobile.spec.ts.
// The picker opens when the date label in the daily tab header is clicked.
// Tests cover: open/close, date selection, and mood dot rendering after entry creation.

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

// Navigate to /journal before each test.
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/journal')
  await page.waitForURL('**/journal')
})

test.describe('Journal — calendar date picker', () => {
  test('clicking the date label opens the calendar popover', async ({ page }) => {
    await page.getByRole('button', { name: 'Open date picker' }).click()

    // Calendar header buttons and day-of-week labels confirm the picker is rendered
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible()
    await expect(page.getByText('Mon')).toBeVisible()
  })

  test('selecting a past date via the calendar closes the picker and updates the date header', async ({ page }) => {
    await page.getByRole('button', { name: 'Open date picker' }).click()

    // Go back one month so we are selecting a clearly past date
    await page.getByRole('button', { name: 'Previous month' }).click()

    // Day 15 always exists in every month; first() avoids ambiguity with multiple visible buttons
    await page.getByRole('button', { name: '15' }).first().click()

    // Picker should have closed after selection
    await expect(page.getByRole('button', { name: 'Previous month' })).not.toBeVisible()

    // The date header should no longer read "Today" since we navigated to last month
    await expect(page.getByRole('button', { name: 'Open date picker' })).not.toContainText('Today')
  })

  test('after creating an entry, the calendar shows a mood dot for today', async ({ page }) => {
    // Create an entry with a Happy emotion tag so today has a scored dot
    await page.getByTestId('add-entry-fab').click()
    await page.getByPlaceholder(/What's on your mind/).fill(`Calendar dot test ${Date.now()}`)
    await page.getByRole('button', { name: /Happy/ }).click()
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByTestId('entry-card').first()).toBeVisible()

    // Open the calendar — the cache is invalidated by the save so it re-fetches
    await page.getByRole('button', { name: 'Open date picker' }).click()
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible()

    // At least one colored dot should be visible (inline background-color style is set for days
    // that have entries; gray-300 = #d1d5db for logged-only, green-400 = #4ade80 for Happy)
    const dots = page.locator('span[style*="background-color"]')
    await expect(dots.first()).toBeVisible()
  })
})
