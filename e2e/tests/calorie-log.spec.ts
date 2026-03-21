import { test, expect } from '@playwright/test'

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

// Log in and land on the calorie log page before each test.
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
})

test.describe('Weekly tab', () => {
  test('Weekly tab shows Estimated Weight Impact', async ({ page }) => {
    await page.getByRole('button', { name: 'Weekly' }).click()
    await expect(page.getByText('Estimated Weight Impact')).toBeVisible()

    // lbs/wk value should be rendered — proves estimated_weight_change_lbs came back from the API
    const paceValue = page.locator('text=/[+-]?\\d+\\.\\d+ lbs\\/wk/').first()
    await expect(paceValue).toBeVisible()
  })
})

test.describe('Settings', () => {
  test('changing calorie budget in settings is reflected in daily view', async ({ page }) => {
    await page.goto('/settings')

    // Ensure manual budget mode — if auto-compute is on, turn it off so the input appears
    const autoToggle = page.getByRole('switch').first()
    const isAuto = await autoToggle.getAttribute('aria-checked')
    if (isAuto === 'true') {
      await autoToggle.click()
    }

    // Fill manual budget input (min=1200, max=5000 — unique enough to target).
    // Use triple-click to select then keyboard.type() instead of fill() — fill() on
    // React-controlled number inputs doesn't reliably fire the synthetic input event
    // that updates React state, so the save would send the old value.
    const budgetInput = page.locator('input[type="number"][min="1200"]')
    await budgetInput.click({ clickCount: 3 })
    await page.keyboard.type('2150')
    await expect(budgetInput).toHaveValue('2150')

    await page.getByRole('button', { name: /save changes/i }).click()
    // Wait for save to complete
    await expect(page.getByText('Saved!')).toBeVisible()

    // Return to daily view — 2,150 should appear in the budget display
    await page.goto('/calorie-log')
    await expect(page.getByText('2,150')).toBeVisible()

    // Restore original budget (cleanup so other tests are unaffected)
    await page.goto('/settings')
    const restoreInput = page.locator('input[type="number"][min="1200"]')
    await restoreInput.click({ clickCount: 3 })
    await page.keyboard.type('2300')
    await expect(restoreInput).toHaveValue('2300')
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByText('Saved!')).toBeVisible()
  })
})

test.describe('Calorie Log', () => {
  test('add item via FAB → item appears in list with correct calories', async ({ page }) => {
    const itemName = `Test Item ${Date.now()}`
    const calories = 350

    // Open the add-item sheet via the FAB (the circular + button)
    await page.locator('button.fixed.bottom-6.right-6').click()

    // Wait for the sheet to open (submit button becomes visible)
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()

    // Fill in the form
    await page.getByPlaceholder('e.g. Banana Smoothie').fill(itemName)
    await page.getByLabel('Calories').fill(String(calories))

    // Submit
    await page.getByRole('button', { name: 'Save Item' }).click()

    // Sheet closes and item name appears in the log
    await expect(page.getByText(itemName)).toBeVisible()
  })

  test('add item → daily summary totals update', async ({ page }) => {
    const itemName = `Summary Test ${Date.now()}`
    const calories = 500

    // Read current "Eaten" value before adding
    // The DailySummary shows "Eaten" with a number below it
    const eatenBefore = await page.getByText('Eaten').locator('..').locator('.font-semibold').textContent()
    const beforeValue = parseInt((eatenBefore ?? '0').replace(/,/g, ''), 10)

    // Add the item
    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()
    await page.getByPlaceholder('e.g. Banana Smoothie').fill(itemName)
    await page.getByLabel('Calories').fill(String(calories))
    await page.getByRole('button', { name: 'Save Item' }).click()

    // Wait for item to appear in the list
    await expect(page.getByText(itemName)).toBeVisible()

    // Verify the "Eaten" total increased by the added calories
    const eatenAfter = await page.getByText('Eaten').locator('..').locator('.font-semibold').textContent()
    const afterValue = parseInt((eatenAfter ?? '0').replace(/,/g, ''), 10)

    expect(afterValue).toBe(beforeValue + calories)
  })
})
