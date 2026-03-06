// recipes.spec.ts — E2E tests for the Recipes module.
// No AI calls (flaky + expensive). Covers the critical path:
//   1. Create a recipe manually + verify it appears in the list and detail view.
//   2. Log from a recipe with 2 servings + verify it appears in the calorie log.

import { test, expect, type APIRequestContext } from '@playwright/test'

const E2E_USER     = 'recipes_test_user'
const E2E_PASSWORD = 'password123'

// Log in via the API and return the auth token.
async function apiLogin(request: APIRequestContext): Promise<string> {
  const res  = await request.post('/api/login', {
    data: { username: E2E_USER, password: E2E_PASSWORD },
  })
  const body = await res.json()
  return body.token as string
}

// Delete all recipes owned by the test user so tests start clean.
async function cleanupRecipes(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` }
  const res     = await request.get('/api/recipes', { headers })
  const recipes = await res.json() as Array<{ id: number }>
  for (const r of recipes) {
    await request.delete(`/api/recipes/${r.id}`, { headers })
  }
}

// Delete all calorie log items for today for the test user.
async function cleanupTodayLog(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` }
  const today   = new Date().toISOString().slice(0, 10)
  const res     = await request.get(`/api/calorie-log/daily?date=${today}`, { headers })
  const daily   = await res.json()
  for (const item of (daily.items ?? [])) {
    await request.delete(`/api/calorie-log/items/${item.id}`, { headers })
  }
}

test.describe('Recipes', () => {

  test.beforeEach(async ({ page, request }) => {
    const token = await apiLogin(request)
    await cleanupRecipes(request, token)
    await cleanupTodayLog(request, token)

    // Log in via UI
    await page.goto('/login')
    await page.fill('#username', E2E_USER)
    await page.fill('#password', E2E_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/calorie-log')
  })

  test('create recipe → appears in list and detail view', async ({ page }) => {
    const recipeName = `Test Recipe ${Date.now()}`

    // Navigate to Recipes
    await page.goto('/recipes')
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()

    // Open new recipe form
    await page.getByTitle('New recipe').click()
    await page.waitForURL('**/recipes/new')

    // Fill in the name (the name input in edit mode header)
    await page.getByPlaceholder('Recipe name').fill(recipeName)

    // Set category to Dinner
    await page.getByLabel('Category').selectOption('dinner')

    // Add an ingredient — list starts empty, click Add ingredient first
    await page.getByRole('button', { name: /Add ingredient/i }).click()
    await page.getByPlaceholder('Ingredient name').first().fill('Chicken breast')

    // Add a step — "Add step" is a label; click the "Instruction" button next to it
    await page.getByRole('button', { name: 'Instruction', exact: true }).click()
    // Fill the step text in the new step textarea
    const stepTextareas = page.getByPlaceholder('Describe this step…')
    await stepTextareas.last().fill('Season and cook the chicken.')

    // Save
    await page.getByRole('button', { name: 'Save' }).click()

    // Should navigate to the recipe detail view
    await page.waitForURL(/\/recipes\/\d+$/)
    await expect(page.getByText(recipeName)).toBeVisible()

    // Navigate back to list and verify card appears
    await page.goto('/recipes')
    await expect(page.getByText(recipeName)).toBeVisible()
    await expect(page.locator('span').filter({ hasText: 'dinner' })).toBeVisible()
  })

  test('log from recipe with 2 servings → appears in calorie log', async ({ page, request }) => {
    // Pre-create a recipe via API so we have a known calorie value
    const token   = await apiLogin(request)
    const headers = { Authorization: `Bearer ${token}` }
    const res = await request.post('/api/recipes', {
      headers,
      data: {
        name: 'Log Test Recipe',
        category: 'lunch',
        servings: 1,
        calories: 400,
        protein_g: 30,
        carbs_g: 40,
        fat_g: 10,
        ingredients: [],
        tools: [],
        steps: [],
      },
    })
    const recipe = await res.json()

    // Navigate to the recipe detail page
    await page.goto(`/recipes/${recipe.id}`)
    await expect(page.getByText('Log Test Recipe')).toBeVisible()

    // Open the Log Calories sheet — "🍽 Log" on desktop, "🍽 Log Calories" on mobile
    await page.getByRole('button', { name: /Log/i }).first().click()
    await expect(page.getByRole('button', { name: /Save to Log/i })).toBeVisible()

    // Increase servings from 1 to 2 — increment is 0.5 so click twice
    await page.getByLabel('Increase servings').click()
    await page.getByLabel('Increase servings').click()

    // Calories should show 800 (2 × 400)
    await expect(page.getByTestId('scaled-calories')).toHaveText('800')

    // Save to log
    await page.getByRole('button', { name: /Save to Log/i }).click()

    // Navigate to calorie log and verify the item appears
    await page.goto('/calorie-log')
    await expect(page.getByText('Log Test Recipe')).toBeVisible()
  })
})
