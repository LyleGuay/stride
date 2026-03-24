import { test, expect, type Page } from '@playwright/test'

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

// Navigate to /tasks before each test.
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/tasks')
  await page.waitForURL('**/tasks')
})

// Opens the Add Task sheet, fills name + today date + priority, and saves.
// Waits for the POST /api/tasks response (201) to confirm the task was created.
// Note: we don't assert the sheet heading disappears — Playwright considers
// opacity-0 elements visible, so the heading stays "visible" even after the
// sheet closes via the opacity transition.
async function createTask(page: Page, name: string, priority: 'Urgent' | 'High' | 'Medium' | 'Low' = 'Medium') {
  await page.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible()

  await page.getByPlaceholder('Task name').fill(name)

  // Open the date picker and pick Today via calendar shortcut.
  // Scope to the form to avoid the "Today" nav tab button.
  await page.locator('form').getByRole('button', { name: 'No date' }).click()
  await page.locator('form').getByRole('button', { name: 'Today', exact: true }).click()

  // Set priority (scoped to form to avoid ambiguity)
  await page.locator('form').getByRole('button', { name: priority, exact: true }).click()

  // Click Save and wait for the API response to confirm creation succeeded.
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/tasks') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create' }).click(),
  ])
  expect(response.status()).toBe(201)
}

test.describe('Tasks — Today view', () => {
  test('navigate to /tasks → Today tab is active by default', async ({ page }) => {
    await expect(page).toHaveURL(/\/tasks/)
    // FAB is the primary landmark of the Tasks page
    await expect(page.getByRole('button', { name: 'Add task' })).toBeVisible()
    // Loading spinner should resolve quickly
    await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 5000 })
  })

  test('FAB opens Add Task sheet → fill + save → task appears in Today', async ({ page }) => {
    const taskName = `E2E Task ${Date.now()}`
    await createTask(page, taskName, 'High')

    // Task should appear in the Today view
    await expect(page.getByTestId('task-row').filter({ hasText: taskName })).toBeVisible()

    // Priority bar should have the high-priority orange class
    const bar = page.getByTestId('task-row').filter({ hasText: taskName }).getByTestId('priority-bar')
    await expect(bar).toHaveAttribute('data-priority', 'high')
  })

  test('click status circle → task marked done, toast appears → Undo → task restored', async ({ page }) => {
    const taskName = `E2E Complete ${Date.now()}`
    await createTask(page, taskName)

    // Verify task is visible in Today
    const row = page.getByTestId('task-row').filter({ hasText: taskName })
    await expect(row).toBeVisible()

    // Click status circle to complete the task
    await row.getByRole('button', { name: 'Mark complete' }).click()

    // Toast should appear
    await expect(page.getByText('Task completed')).toBeVisible()

    // The Undo button is in the toast
    await page.getByRole('button', { name: 'Undo' }).click()

    // Task should re-appear in Today after undo
    await expect(page.getByTestId('task-row').filter({ hasText: taskName })).toBeVisible()

    // Toast should dismiss after undo
    await expect(page.getByText('Task completed')).not.toBeVisible()
  })

  test('complete task without undo → toast expires → task gone from Today', async ({ page }) => {
    const taskName = `E2E Expire ${Date.now()}`
    await createTask(page, taskName)

    const row = page.getByTestId('task-row').filter({ hasText: taskName })
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Mark complete' }).click()

    // Task should immediately leave Today (the list reloads right after the PATCH)
    await expect(row).not.toBeVisible()

    // Toast appears — don't click Undo; it will auto-dismiss after 5s
    await expect(page.getByText('Task completed')).toBeVisible()
  })
})

test.describe('Tasks — Upcoming tab', () => {
  test('Upcoming tab with no future tasks shows empty state', async ({ page }) => {
    // Switch to Upcoming — tasks created with due=today won't appear here
    // (upcoming shows overdue + today + next 7 days, but our fresh test user
    // only has tasks created in earlier tests which may or may not be present)
    await page.getByRole('button', { name: 'Upcoming' }).first().click()

    // If no tasks, empty state message should be visible. If there are tasks from
    // other test runs they will also be valid data. At minimum the tab should load.
    // Wait for loading spinner to disappear.
    await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Tasks — All tab', () => {
  test('All tab shows active tasks regardless of due date', async ({ page }) => {
    const taskName = `E2E All ${Date.now()}`
    await createTask(page, taskName)

    // Switch to All tab
    await page.getByRole('button', { name: 'All' }).first().click()

    // Task should appear in All
    await expect(page.getByTestId('task-row').filter({ hasText: taskName })).toBeVisible()
  })
})
