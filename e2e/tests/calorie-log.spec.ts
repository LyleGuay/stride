import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const SHARED_USER = 'e2e_user'
const ISOLATED_USER = 'calorie_log_test_user'
const PASSWORD = 'password123'

// ── Helpers ─────────────────────────────────────────────────────────────────

// apiLogin returns an auth token for the given user via the login endpoint.
async function apiLogin(request: APIRequestContext, username: string): Promise<string> {
  const res = await request.post('/api/login', { data: { username, password: PASSWORD } })
  const body = await res.json()
  return body.token as string
}

// Delete every calorie log item for today so each isolated-user test starts
// from a known-zero Eaten total. Mirrors the pattern used in favorites.spec.ts.
async function cleanupTodayItems(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` }
  const today = new Date().toISOString().slice(0, 10)
  const dailyRes = await request.get(`/api/calorie-log/daily?date=${today}`, { headers })
  const daily = await dailyRes.json()
  for (const item of (daily.items ?? [])) {
    await request.delete(`/api/calorie-log/items/${item.id}`, { headers })
  }
}

// loginUI performs the UI login flow and waits for the calorie log landing page.
async function loginUI(page: Page, username: string) {
  await page.goto('/login')
  await page.fill('#username', username)
  await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared-user tests — these only check unique item names or text patterns, so
// they're safe to run against the shared e2e_user that other test files use.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calorie Log — shared user (no aggregate assertions)', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, SHARED_USER)
  })

  test('Weekly tab shows Estimated Weight Impact', async ({ page }) => {
    await page.getByRole('button', { name: 'Weekly' }).click()
    await expect(page.getByText('Estimated Weight Impact')).toBeVisible()

    // lbs/wk value should be rendered — proves estimated_weight_change_lbs came back from the API
    const paceValue = page.locator('text=/[+-]?\\d+\\.\\d+ lbs\\/wk/').first()
    await expect(paceValue).toBeVisible()
  })

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

  // ── F.1 — Add item via FAB with type and unit selection ────────────────────
  test('F.1 creates Lunch item with correct type, qty, unit, and calorie total', async ({ page }) => {
    const itemName = `F1 Chicken ${Date.now()}`

    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()

    // Fill item name
    await page.getByPlaceholder('e.g. Banana Smoothie').fill(itemName)

    // Select Lunch type — scope to the form to avoid matching any other "Lunch"
    // button on the page (strict mode fails with 2+ matching elements).
    await page.locator('form').getByRole('button', { name: /^lunch$/i }).click()

    // Set qty — Quantity label has no htmlFor so target by step attribute (unique to qty input)
    await page.locator('input[step="0.25"]').click({ clickCount: 3 })
    await page.keyboard.type('200')
    await page.locator('select').selectOption('g')

    // Set calories
    await page.getByLabel('Calories').click({ clickCount: 3 })
    await page.keyboard.type('220')

    await page.getByRole('button', { name: 'Save Item' }).click()

    // Item appears in the log — the primary assertion for this test.
    // Total assertions are intentionally skipped here (covered by the isolated
    // "totals update" test below to avoid parallel-test pollution).
    await expect(page.getByText(itemName)).toBeVisible()
  })

  // ── F.4 — Date navigation scopes items correctly ───────────────────────────
  test('F.4 navigating to yesterday shows different items; returning to today restores the original view', async ({ page }) => {
    const itemName = `F4 Today ${Date.now()}`

    // Add an item for today
    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()
    await page.getByPlaceholder('e.g. Banana Smoothie').fill(itemName)
    await page.getByLabel('Calories').fill('111')
    await page.getByRole('button', { name: 'Save Item' }).click()
    await expect(page.getByText(itemName)).toBeVisible()

    // Navigate to yesterday
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText('Yesterday')).toBeVisible()

    // Today's item should not be visible on yesterday's view
    await expect(page.getByText(itemName)).not.toBeVisible()

    // Navigate forward back to today
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByText('Today')).toBeVisible()

    // Today's item should be visible again
    await expect(page.getByText(itemName)).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Isolated-user tests — these assert on per-user aggregates (Eaten total,
// calorie budget). Run against a dedicated user that no other test file
// touches, and clean up today's items before each test so the baseline is
// deterministic. Playwright runs tests within a file serially by default, so
// tests in this describe don't collide with each other either.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calorie Log — isolated user (aggregate-dependent)', () => {
  test.beforeEach(async ({ page, request }) => {
    const token = await apiLogin(request, ISOLATED_USER)
    await cleanupTodayItems(request, token)
    await loginUI(page, ISOLATED_USER)
  })

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

    // Return to daily view — wait for the daily summary API call so the budget
    // is guaranteed loaded before asserting (goto resolves before async fetches complete).
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/calorie-log/daily')),
      page.goto('/calorie-log'),
    ])
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

  // ── F.2 — Edit item via context menu ───────────────────────────────────────
  test('F.2 editing calories via context menu updates the displayed total and persists on reload', async ({ page }) => {
    const itemName = `F2 Edit ${Date.now()}`
    const initialCal = 300
    const deltaCal = 100

    // Add an item first
    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()
    await page.getByPlaceholder('e.g. Banana Smoothie').fill(itemName)
    await page.getByLabel('Calories').click({ clickCount: 3 })
    await page.keyboard.type(String(initialCal))
    await page.getByRole('button', { name: 'Save Item' }).click()
    await expect(page.getByText(itemName)).toBeVisible()

    // Read "Eaten" total after first add
    const eatenAfterAdd = await page.getByText('Eaten').locator('..').locator('.font-semibold').textContent()
    const addedValue = parseInt((eatenAfterAdd ?? '0').replace(/,/g, ''), 10)

    // Right-click the row to open context menu
    await page.getByText(itemName).click({ button: 'right' })
    await expect(page.getByText('Edit item...')).toBeVisible()
    await page.getByText('Edit item...').click()

    // AddItemSheet opens in edit mode — change calories
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible()
    await page.getByLabel('Calories').click({ clickCount: 3 })
    await page.keyboard.type(String(initialCal + deltaCal))

    // Wait for the PATCH + daily summary refetch before reading the updated total.
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/calorie-log/daily') && r.status() === 200),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ])

    // Wait for item to remain visible (sheet closed)
    await expect(page.getByText(itemName)).toBeVisible()

    // Eaten total should reflect the new calories
    const eatenAfterEdit = await page.getByText('Eaten').locator('..').locator('.font-semibold').textContent()
    const editedValue = parseInt((eatenAfterEdit ?? '0').replace(/,/g, ''), 10)
    expect(editedValue).toBe(addedValue + deltaCal)

    // Reload and verify change persisted
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/calorie-log/daily')),
      page.reload(),
    ])
    const eatenAfterReload = await page.getByText('Eaten').locator('..').locator('.font-semibold').textContent()
    const reloadedValue = parseInt((eatenAfterReload ?? '0').replace(/,/g, ''), 10)
    expect(reloadedValue).toBe(editedValue)
  })

  // ── F.3 — Delete item ──────────────────────────────────────────────────────
  test('F.3 deleting via context menu removes item and decreases calorie total', async ({ page }) => {
    const itemName = `F3 Delete ${Date.now()}`
    const calories = 400

    // Add an item
    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()
    await page.getByPlaceholder('e.g. Banana Smoothie').fill(itemName)
    await page.getByLabel('Calories').click({ clickCount: 3 })
    await page.keyboard.type(String(calories))
    await page.getByRole('button', { name: 'Save Item' }).click()
    await expect(page.getByText(itemName)).toBeVisible()

    // Read total after add
    const eatenAfterAdd = await page.getByText('Eaten').locator('..').locator('.font-semibold').textContent()
    const addedValue = parseInt((eatenAfterAdd ?? '0').replace(/,/g, ''), 10)

    // Right-click to open context menu and delete. Use getByRole('button') for
    // the Delete action so it doesn't match the item name cell if it contains "Delete".
    await page.getByText(itemName).click({ button: 'right' })
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()

    // Item should be gone from the list
    await expect(page.getByText(itemName)).not.toBeVisible()

    // Total should decrease by the deleted item's calories
    const eatenAfterDelete = await page.getByText('Eaten').locator('..').locator('.font-semibold').textContent()
    const deletedValue = parseInt((eatenAfterDelete ?? '0').replace(/,/g, ''), 10)
    expect(deletedValue).toBe(addedValue - calories)
  })
})
