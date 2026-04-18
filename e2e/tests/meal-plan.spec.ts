// Meal Plan ghost row E2E tests.
// These tests create plan entries on the Meal Planning page and then verify
// that ghost rows appear in the Calorie Log, and that logging them works correctly.

import { test, expect } from '@playwright/test'

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
})

test.describe('Meal plan ghost rows', () => {
  test('food entry ghost row appears in calorie log and can be logged', async ({ page }) => {
    // Create a breakfast food entry for today in the Meal Planning page
    await page.goto('/meal-plan')
    await page.waitForSelector('text=Meal Planning')

    // Click today's Breakfast add button — scoped by data-today and data-meal attributes.
    const addBreakfastBtn = page.locator('[data-testid="meal-add-btn"][data-today="true"][data-meal="breakfast"]')
    await addBreakfastBtn.click()

    // MealPlanEntrySheet opens — Food tab is default
    await expect(page.getByRole('heading', { name: /add to breakfast/i })).toBeVisible()

    // Fill in item name (placeholder matches MealPlanEntrySheet food tab)
    await page.locator('input[placeholder="e.g. Banana Smoothie"]').fill('E2E Oatmeal')

    // Fill calories — triple-click to select existing value then type, which reliably
    // fires React onChange on controlled number inputs.
    await page.locator('input[placeholder="0"]').click({ clickCount: 3 })
    await page.keyboard.type('350')

    // Ensure the Save button is enabled before clicking (guards against canSave being false)
    await expect(page.getByRole('button', { name: /add to plan/i })).toBeEnabled()

    // Save — wait for the API response so any server error surfaces in the test output
    const [apiResp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/meal-plan/entries') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /add to plan/i }).click(),
    ])
    expect(apiResp.status(), `API POST /api/meal-plan/entries failed: ${await apiResp.text()}`).toBeLessThan(400)
    // Playwright's toBeVisible() does not reliably detect opacity:0 elements as hidden.
    // Use toHaveCSS to check the computed opacity directly — 0 means the sheet is closed.
    await expect(page.locator('[data-testid="meal-plan-entry-sheet"]')).toHaveCSS('opacity', '0')

    // Navigate to calorie log
    await page.goto('/calorie-log')
    await page.waitForSelector('text=Calorie Log')

    // Ghost row should appear in the Breakfast section
    const ghostRow = page.locator('[data-testid="meal-plan-ghost-row"]').filter({ hasText: 'E2E Oatmeal' })
    await expect(ghostRow).toBeVisible()
    await expect(ghostRow).toContainText('350 cal')

    // Click the Log button on the ghost row
    await ghostRow.getByRole('button', { name: /log/i }).first().click()

    // LogFromPlanSheet should open with item name pre-filled
    await expect(page.getByRole('heading', { name: /log planned item/i })).toBeVisible()
    // Scope to the LogFromPlanSheet form to avoid matching the hidden AddItemSheet calories input
    const calInput = page.locator('form').filter({ hasText: /log planned item/i }).locator('input[placeholder="0"]')
    await expect(calInput).toHaveValue('350')

    // Submit
    await page.getByRole('button', { name: /log item/i }).click()
    await expect(page.getByRole('heading', { name: /log planned item/i })).not.toBeVisible()

    // Ghost row should be gone
    await expect(ghostRow).not.toBeVisible()

    // Real item should appear
    await expect(page.getByText('E2E Oatmeal')).toBeVisible()
  })

  test('takeout ghost row opens AddItemSheet with amber banner', async ({ page }) => {
    // Create a takeout entry for today's dinner
    await page.goto('/meal-plan')
    await page.waitForSelector('text=Meal Planning')

    // Find today's Dinner add button — scoped by data-today and data-meal attributes.
    const addDinnerBtn = page.locator('[data-testid="meal-add-btn"][data-today="true"][data-meal="dinner"]')
    await addDinnerBtn.click()

    // Switch to Takeout tab
    await page.getByRole('button', { name: /takeout/i }).click()

    // Fill in takeout details (placeholders match MealPlanEntrySheet takeout tab)
    await page.locator('input[placeholder="e.g. Chipotle"]').fill('E2E Sushi')

    // Calorie limit — triple-click + type to reliably fire React onChange
    await page.locator('input[placeholder="0"]').click({ clickCount: 3 })
    await page.keyboard.type('900')

    // Check "No sides" — wrapped by a <label> so getByLabel works
    await page.getByLabel(/no sides/i).check()

    // Ensure Save is enabled before clicking
    await expect(page.getByRole('button', { name: /add to plan/i })).toBeEnabled()

    // Save — wait for the API response so any server error surfaces in the test output
    const [apiResp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/meal-plan/entries') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /add to plan/i }).click(),
    ])
    expect(apiResp.status(), `API POST /api/meal-plan/entries failed: ${await apiResp.text()}`).toBeLessThan(400)
    await expect(page.locator('[data-testid="meal-plan-entry-sheet"]')).toHaveCSS('opacity', '0')

    // Navigate to calorie log
    await page.goto('/calorie-log')

    // Ghost row should appear in Dinner showing the takeout name
    const ghostRow = page.locator('[data-testid="meal-plan-ghost-row"]').filter({ hasText: 'E2E Sushi' })
    await expect(ghostRow).toBeVisible()

    // Click Log — should open AddItemSheet (not LogFromPlanSheet)
    await ghostRow.getByRole('button', { name: /log/i }).first().click()

    // AddItemSheet should be open with amber banner showing the takeout name
    await expect(page.getByText(/planned takeout/i)).toBeVisible()

    // Enter actual calories and save
    await page.fill('input[placeholder="0"]', '850')
    await page.getByRole('button', { name: /save item/i }).click()

    // Ghost row should be gone
    await expect(ghostRow).not.toBeVisible()
  })
})
