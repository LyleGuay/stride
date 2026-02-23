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
