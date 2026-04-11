import { test, expect, devices, type Page } from '@playwright/test'

// Mobile-specific task tests — run at Pixel 7 viewport.
// Verifies: FAB visible and tappable, sheet slides up from bottom,
// task row ··· menu is always visible (not hover-gated on mobile).

test.use({ ...devices['Pixel 7'] })

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/tasks')
  await page.waitForURL('**/tasks')
})

// Creates a task via the Add Task sheet and waits for the API response (201).
// Note: we don't assert the sheet heading disappears — Playwright considers
// opacity-0 elements visible, so we wait for the API response instead.
async function createTaskViaSheet(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add task' }).tap()
  await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible()
  await page.getByPlaceholder('Task name').fill(name)
  // Set due date to today so it appears in Today view
  await page.locator('form').getByRole('button', { name: 'No date' }).tap()
  // The calendar shortcuts render in a portal (outside <form>), so scope to the panel.
  await page.getByTestId('calendar-panel').getByRole('button', { name: 'Today', exact: true }).tap()
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/tasks') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create', exact: true }).tap(),
  ])
  expect(response.status()).toBe(201)
}

// Creates a daily recurring task scheduled for today via the mobile sheet.
async function createDailyRecurringTaskViaSheet(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add task' }).tap()
  await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible()
  await page.getByPlaceholder('Task name').fill(name)

  // Set scheduled date to today.
  await page.locator('form').getByRole('button', { name: 'No date' }).tap()
  // The calendar shortcuts render in a portal (outside <form>), so scope to the panel.
  await page.getByTestId('calendar-panel').getByRole('button', { name: 'Today', exact: true }).tap()

  // Open the recurrence panel and select Daily.
  await page.locator('form').getByRole('button', { name: 'None' }).tap()
  await page.getByText('Daily').tap()
  // Close the recurrence panel.
  await page.locator('form').getByRole('button', { name: /Every day/ }).tap()

  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/tasks') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create', exact: true }).tap(),
  ])
  expect(response.status()).toBe(201)
}

test.describe('Tasks — mobile layout', () => {
  test('FAB is visible and opens Add Task sheet from bottom', async ({ page }) => {
    const fab = page.getByRole('button', { name: 'Add task' })
    await expect(fab).toBeVisible()

    // Sheet slides up from bottom on mobile
    await fab.tap()
    await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible()

    // Drag handle (mobile only) should be visible
    await expect(page.locator('.sm\\:hidden .rounded-full').first()).toBeVisible()
  })

  test('task row ··· menu is always visible on mobile (not hover-gated)', async ({ page }) => {
    const taskName = `Mobile Task ${Date.now()}`
    await createTaskViaSheet(page, taskName)

    // Find the task row
    const row = page.getByTestId('task-row').filter({ hasText: taskName })
    await expect(row).toBeVisible()

    // The ··· button should be visible without hovering (opacity-100 on mobile)
    // sm:opacity-0 sm:group-hover:opacity-100 means at mobile widths it stays visible
    const menuButton = row.getByRole('button', { name: 'Task actions' })
    await expect(menuButton).toBeVisible()

    // Tapping it should open the dropdown
    await menuButton.tap()
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  test('create task via sheet → task appears in Today', async ({ page }) => {
    const taskName = `Mobile Create ${Date.now()}`
    await createTaskViaSheet(page, taskName)
    await expect(page.getByTestId('task-row').filter({ hasText: taskName })).toBeVisible()
  })
})

test.describe('Tasks — mobile recurring', () => {
  test('complete daily recurring task → stays in list → Rescheduled toast', async ({ page }) => {
    const taskName = `Mobile Recurring ${Date.now()}`
    await createDailyRecurringTaskViaSheet(page, taskName)

    const row = page.getByTestId('task-row').filter({ hasText: taskName })
    await expect(row).toBeVisible()

    // The recurring indicator (↻) should be visible on the row.
    await expect(row.getByTestId('recurring-indicator')).toBeVisible()

    // Complete the task.
    const [completeResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/complete') && r.request().method() === 'PATCH'),
      row.getByRole('button', { name: 'Mark complete' }).tap(),
    ])
    expect(completeResponse.status()).toBe(200)

    // After completion the scheduled_date advances to tomorrow, so the task leaves
    // the Today view. Verify via the "↻ Rescheduled" toast instead of row visibility.
    await expect(page.getByText(/Rescheduled/)).toBeVisible()

    // Tap Undo — scheduled date should revert to today.
    await page.getByRole('button', { name: 'Undo' }).tap()
    await expect(row.getByTestId('scheduled-chip')).toHaveText('Today')
  })
})
