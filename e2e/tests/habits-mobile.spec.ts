import { test, expect, devices } from '@playwright/test'

// Mobile-specific habits tests — run at Pixel 7 viewport.
// These tests verify the mobile date-arrow navigation and responsive layout.

test.use({ ...devices['Pixel 7'] })

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/habits')
  await page.waitForURL('**/habits')
})

test.describe('Habits — mobile layout', () => {
  test('mobile date display shows today; prev-day arrow navigates to yesterday', async ({ page }) => {
    // The mobile date display should be visible (the desktop week strip is hidden)
    const dateDisplay = page.getByTestId('mobile-date-display')
    await expect(dateDisplay).toBeVisible()

    // next-day arrow should be disabled (can't go to a future date)
    const nextDay = page.getByTestId('next-day')
    await expect(nextDay).toBeDisabled()

    // Go back one day
    await page.getByTestId('prev-day').click()

    // Past-day banner should now appear
    await expect(page.getByTestId('past-day-banner')).toBeVisible()

    // next-day arrow is now enabled (can return to today)
    await expect(nextDay).toBeEnabled()
  })

  test('FAB is visible and tappable on mobile', async ({ page }) => {
    const fab = page.getByTestId('add-habit-fab')
    await expect(fab).toBeVisible()
    await fab.tap()
    await expect(page.getByRole('heading', { name: 'New Habit' })).toBeVisible()
  })
})
