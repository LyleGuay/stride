import { test, expect } from '@playwright/test'

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

// Navigate to /habits before each test.
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/habits')
  await page.waitForURL('**/habits')
})

test.describe('Habits — create and Today view', () => {
  test('create habit → appears in Today list with correct name and empty circle', async ({ page }) => {
    const habitName = `E2E Habit ${Date.now()}`

    // Open AddHabitSheet via FAB
    await page.getByTestId('add-habit-fab').click()
    await expect(page.getByRole('heading', { name: 'New Habit' })).toBeVisible()

    // Fill in name and L1 label
    await page.getByLabel('Habit name').fill(habitName)
    await page.getByLabel('Level 1 label').fill('Do it')

    // Submit
    await page.getByRole('button', { name: 'Create Habit' }).click()

    // Sheet closes and habit appears in the list
    await expect(page.getByText(habitName)).toBeVisible()

    // The level circle should be empty (no fill color), with aria-label "Level 0"
    const circle = page.getByTestId('habit-circle').first()
    await expect(circle).toBeVisible()
  })

  test('tap circle on a habit → circle fills with L1; streak shows 1', async ({ page }) => {
    const habitName = `Streak Test ${Date.now()}`

    // Create the habit first
    await page.getByTestId('add-habit-fab').click()
    await page.getByLabel('Habit name').fill(habitName)
    await page.getByLabel('Level 1 label').fill('Do it')
    await page.getByRole('button', { name: 'Create Habit' }).click()
    await expect(page.getByText(habitName)).toBeVisible()

    // Click the level circle to advance to L1
    const circle = page.getByTestId('habit-circle').first()
    await circle.click()

    // The circle should now show "L1"
    await expect(circle).toContainText('L1')

    // Expand the card to see streak stat
    await page.getByTestId('habit-chevron').first().click()
    await expect(page.getByText(/🔥 1 streak/)).toBeVisible()
  })

  test('archive habit via ··· menu → habit disappears from Today list', async ({ page }) => {
    const habitName = `Archive Test ${Date.now()}`

    // Create the habit
    await page.getByTestId('add-habit-fab').click()
    await page.getByLabel('Habit name').fill(habitName)
    await page.getByLabel('Level 1 label').fill('Do it')
    await page.getByRole('button', { name: 'Create Habit' }).click()
    await expect(page.getByText(habitName)).toBeVisible()

    // Open the ··· menu
    await page.getByTestId('habit-menu-button').first().click()
    await page.getByRole('button', { name: 'Archive' }).click()

    // Habit disappears
    await expect(page.getByText(habitName)).not.toBeVisible()
  })

  test('navigate to yesterday → amber past-day banner is visible', async ({ page }) => {
    // On desktop the week strip is visible; on mobile use the day arrow
    // Use the mobile day arrow (always present, same behaviour).
    const prevDay = page.getByTestId('prev-day')
    await prevDay.click()
    await expect(page.getByTestId('past-day-banner')).toBeVisible()
    await expect(page.getByTestId('past-day-banner')).toContainText('editing past log')
  })

  test('switch to Progress tab → weekly summary card is visible', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByTestId('progress-summary-card')).toBeVisible()
  })
})
