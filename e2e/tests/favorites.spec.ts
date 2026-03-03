// favorites.spec.ts — E2E tests for the Favorites feature.
// Covers: saving an item as a favorite via context menu, picking a favorite
// from the inline add row dropdown (including ×qty scaling), and the presence
// of "Save as Favorite" in the context menu.
//
// Uses a dedicated test user to avoid collisions with other test files.

import { test, expect, type APIRequestContext } from '@playwright/test'

const E2E_USER     = 'favorites_test_user'
const E2E_PASSWORD = 'password123'

// ITEM_TYPES order matches the rendered section order: breakfast(0), lunch(1), dinner(2), snack(3), exercise(4).
const SNACK_IDX = 3

// Log in via the API and return the auth token.
async function apiLogin(request: APIRequestContext): Promise<string> {
  const res  = await request.post('/api/login', {
    data: { username: E2E_USER, password: E2E_PASSWORD },
  })
  const body = await res.json()
  return body.token as string
}

// Clean up: delete all favorites and today's calorie log items for the test user.
async function cleanupUserData(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` }

  const favsRes = await request.get('/api/calorie-log/favorites', { headers })
  const favs = await favsRes.json()
  for (const fav of favs) {
    await request.delete(`/api/calorie-log/favorites/${fav.id}`, { headers })
  }

  const today = new Date().toISOString().slice(0, 10)
  const dailyRes = await request.get(`/api/calorie-log/daily?date=${today}`, { headers })
  const daily = await dailyRes.json()
  for (const item of (daily.items ?? [])) {
    await request.delete(`/api/calorie-log/items/${item.id}`, { headers })
  }
}

test.describe('Favorites feature', () => {

  test.beforeEach(async ({ page, request }) => {
    const token = await apiLogin(request)
    await cleanupUserData(request, token)

    await page.goto('/login')
    await page.fill('#username', E2E_USER)
    await page.fill('#password', E2E_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/calorie-log')
  })

  test('context menu has "Save as Favorite" option', async ({ page }) => {
    // Add a snack item via the snack section's inline add row (nth(3) = snack)
    await page.getByRole('button', { name: '+ Add' }).nth(SNACK_IDX).click()
    await page.locator('input[placeholder="Item name"]').fill('Test Protein Bar')
    await page.locator('input[placeholder="Cal"]').fill('200')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByText('Test Protein Bar')).toBeVisible()

    // Right-click the item to open the context menu
    await page.getByText('Test Protein Bar').click({ button: 'right' })
    await expect(page.getByText('Save as Favorite')).toBeVisible()
  })

  test('save as favorite via context menu, then pick from inline dropdown', async ({ page }) => {
    // Step 1: Add a snack item
    await page.getByRole('button', { name: '+ Add' }).nth(SNACK_IDX).click()
    await page.locator('input[placeholder="Item name"]').fill('Test Protein Bar')
    await page.locator('input[placeholder="Qty"]').fill('1')
    await page.locator('input[placeholder="Cal"]').fill('200')
    await page.locator('input[placeholder="P"]').fill('15')
    await page.locator('input[placeholder="C"]').fill('20')
    await page.locator('input[placeholder="F"]').fill('8')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByText('Test Protein Bar')).toBeVisible()

    // Step 2: Right-click → "Save as Favorite"
    await page.getByText('Test Protein Bar').click({ button: 'right' })
    await page.getByText('Save as Favorite').click()
    await expect(page.getByText('Save as Favorite')).not.toBeVisible()

    // Step 3: Reload so the page re-fetches favorites
    await page.reload()
    await page.waitForURL('**/calorie-log')

    // Step 4: Expand the snack add row, then open ★ favorites
    await page.getByRole('button', { name: '+ Add' }).nth(SNACK_IDX).click()
    await page.locator('button[title="Pick from Favorites"]').click()

    // The dropdown has shadow-xl — scope to it so we don't click the table row
    const dropdown = page.locator('div.shadow-xl')
    await expect(dropdown.getByText('Test Protein Bar')).toBeVisible()

    // Step 5: Click the favorite inside the dropdown to pre-fill the form
    await dropdown.getByText('Test Protein Bar').click()

    await expect(page.locator('input[placeholder="Item name"]')).toHaveValue('Test Protein Bar')
    await expect(page.locator('input[placeholder="Cal"]')).toHaveValue('200')

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Test Protein Bar').first()).toBeVisible()
  })

  test('×qty scaling doubles calories before adding', async ({ page, request }) => {
    // Create the item and favorite via API for speed
    const token = await apiLogin(request)
    const headers = { Authorization: `Bearer ${token}` }
    const today = new Date().toISOString().slice(0, 10)

    await request.post('/api/calorie-log/items', {
      headers,
      data: { date: today, item_name: 'Scale Me Bar', type: 'snack', qty: 1, uom: 'each', calories: 200, protein_g: 10, carbs_g: 20, fat_g: 5 },
    })
    await request.post('/api/calorie-log/favorites', {
      headers,
      data: { item_name: 'Scale Me Bar', type: 'snack', qty: 1, uom: 'each', calories: 200, protein_g: 10, carbs_g: 20, fat_g: 5 },
    })

    // Reload to pick up new data
    await page.reload()
    await page.waitForURL('**/calorie-log')

    // Expand snack add row, then open ★
    await page.getByRole('button', { name: '+ Add' }).nth(SNACK_IDX).click()
    await page.locator('button[title="Pick from Favorites"]').click()

    const dropdown = page.locator('div.shadow-xl')
    await expect(dropdown.getByText('Scale Me Bar')).toBeVisible()

    // Open the ×qty panel
    await page.getByTitle('Adjust serving').click()

    // Fill the serving scale input — scope to the dropdown to avoid ambiguity
    await dropdown.locator('input[step="0.25"]').fill('2')

    // Scaled calories should show 400
    await expect(page.getByText('400 cal')).toBeVisible()

    // Add with this serving
    await page.getByRole('button', { name: 'Add with this serving' }).click()

    // Form should be filled with 400 cal
    await expect(page.locator('input[placeholder="Cal"]')).toHaveValue('400')
  })

})
