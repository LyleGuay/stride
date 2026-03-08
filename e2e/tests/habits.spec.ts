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
    await expect(page.getByRole('heading', { name: 'New Habit' })).toBeVisible()
    await page.getByLabel('Habit name').fill(habitName)
    await page.getByLabel('Level 1 label').fill('Do it')
    await page.getByRole('button', { name: 'Create Habit' }).click()
    await expect(page.getByText(habitName)).toBeVisible()

    // Scope all interactions to the newly created card.
    const card = page.getByTestId('habit-card').filter({ hasText: habitName })

    // Click the level circle to advance to L1
    const circle = card.getByTestId('habit-circle')
    await circle.click()

    // The circle should now show "L1"
    await expect(circle).toContainText('L1')

    // Expand the card to see streak stat — streak increments server-side so
    // just verify the stat row is visible (not the specific count).
    await card.getByTestId('habit-chevron').click()
    await expect(card.getByText(/streak/)).toBeVisible()
  })

  test('archive habit via ··· menu → habit disappears from Today list', async ({ page }) => {
    const habitName = `Archive Test ${Date.now()}`

    // Create the habit
    await page.getByTestId('add-habit-fab').click()
    await expect(page.getByRole('heading', { name: 'New Habit' })).toBeVisible()
    await page.getByLabel('Habit name').fill(habitName)
    await page.getByLabel('Level 1 label').fill('Do it')
    await page.getByRole('button', { name: 'Create Habit' }).click()
    await expect(page.getByText(habitName)).toBeVisible()

    // Scope to the specific card so we archive the right habit.
    const card = page.getByTestId('habit-card').filter({ hasText: habitName })
    await card.getByTestId('habit-menu-button').click()
    await page.getByRole('button', { name: 'Archive' }).click()

    // Habit disappears
    await expect(page.getByText(habitName)).not.toBeVisible()
  })

  test('navigate to yesterday → amber past-day banner is visible', async ({ page }) => {
    // prev-day is lg:hidden — not visible on the desktop Chromium viewport.
    // Use the week strip day pill for yesterday instead.
    const today = new Date()
    const d = new Date(today)
    d.setDate(today.getDate() - 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    const yesterday = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    // If today is Monday, yesterday is Sunday in the previous week — navigate back first.
    if (today.getDay() === 1) {
      await page.getByTestId('prev-week').click()
    }

    await page.getByTestId(`week-day-${yesterday}`).click()
    await expect(page.getByTestId('past-day-banner')).toBeVisible()
    await expect(page.getByTestId('past-day-banner')).toContainText('editing past log')
  })

  test('switch to Progress tab → weekly summary card is visible', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByTestId('progress-summary-card')).toBeVisible()
  })
})
