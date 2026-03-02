// pace.spec.ts — E2E safety net for the pace_lbs_per_week sign convention.
//
// Two types of tests live here:
//   "current sign convention" — document the raw API value; these expectations
//   intentionally reverse after the sign-flip refactor (positive→negative for loss).
//   "UI behavior" — check labels and display values the user sees; these should
//   pass both before and after the refactor, since the UI logic compensates.
//
// Profile setup is done via API before each test so values are predictable.

import { test, expect, type APIRequestContext } from '@playwright/test'

// Dedicated user for this file — isolated from other test files that also
// patch user settings, preventing parallel workers from racing on shared state.
const E2E_USER     = 'pace_test_user'
const E2E_PASSWORD = 'password123'

// Loss profile: target < current weight (20 lbs to lose over ~2 years).
// target_date chosen so raw pace ≈ -0.17 lbs/wk — well above the 0.1 snap-to-zero
// threshold and well below the 2.0 cap, keeping expected values stable.
const LOSS_PROFILE = {
  sex: 'male',
  date_of_birth: '1990-01-01',
  height_cm: 180,
  weight_lbs: 200,
  activity_level: 'moderate',
  target_weight_lbs: 180,
  target_date: '2028-06-01',
  budget_auto: true,
}

// Gain profile: target > current weight (20 lbs to gain over ~2 years).
// Same target_date as LOSS_PROFILE for symmetry; 20 lb delta keeps pace > 0.1.
const GAIN_PROFILE = {
  ...LOSS_PROFILE,
  target_weight_lbs: 220,
}

// Log in via the API and return the auth token.
async function apiLogin(request: APIRequestContext): Promise<string> {
  const res  = await request.post('/api/login', {
    data: { username: E2E_USER, password: E2E_PASSWORD },
  })
  const body = await res.json()
  return body.token as string
}

// PATCH user settings via the API.
async function patchSettings(request: APIRequestContext, token: string, settings: object) {
  await request.patch('/api/calorie-log/user-settings', {
    data: settings,
    headers: { Authorization: `Bearer ${token}` },
  })
}

// GET user settings via the API.
async function getSettings(request: APIRequestContext, token: string) {
  const res = await request.get('/api/calorie-log/user-settings', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

test.describe('Pace and Weight Impact', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', E2E_USER)
    await page.fill('#password', E2E_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/calorie-log')
  })

  /* ── API: sign convention ─────────────────────────────────────────────── */

  test('API: pace_lbs_per_week is negative for weight-loss goal', async ({ request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, LOSS_PROFILE)
    const settings = await getSettings(request, token)
    expect(settings.pace_lbs_per_week).toBeDefined()
    expect(settings.pace_lbs_per_week).toBeLessThan(0)
  })

  test('API: pace_lbs_per_week is positive for weight-gain goal', async ({ request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, GAIN_PROFILE)
    const settings = await getSettings(request, token)
    expect(settings.pace_lbs_per_week).toBeDefined()
    expect(settings.pace_lbs_per_week).toBeGreaterThan(0)
  })

  test('API: pace snaps to 0 for a very slow rate (maintenance budget)', async ({ request }) => {
    const token = await apiLogin(request)
    // Far target date → raw |pace| well under 0.1 → snaps to 0, budget = TDEE
    await patchSettings(request, token, { ...LOSS_PROFILE, target_date: '2040-01-01' })
    const settings = await getSettings(request, token)
    expect(settings.pace_lbs_per_week).toBe(0)
    expect(settings.computed_budget).toBe(settings.computed_tdee)
  })

  test('API: computed_budget is lower than computed_tdee for a loss goal', async ({ request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, LOSS_PROFILE)
    const settings = await getSettings(request, token)
    expect(settings.computed_budget).toBeDefined()
    expect(settings.computed_tdee).toBeDefined()
    // Deficit: budget must be below TDEE for a weight-loss goal
    expect(settings.computed_budget).toBeLessThan(settings.computed_tdee)
  })

  test('API: computed_budget is higher than computed_tdee for a gain goal', async ({ request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, GAIN_PROFILE)
    const settings = await getSettings(request, token)
    expect(settings.computed_budget).toBeGreaterThan(settings.computed_tdee)
  })

  /* ── Settings page: UI labels ────────────────────────────────────────── */

  test('settings page shows "lbs/wk loss" label for weight-loss goal', async ({ page, request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, LOSS_PROFILE)
    await page.goto('/settings')
    await expect(page.getByText(/lbs\/wk loss/)).toBeVisible()
  })

  test('settings page shows "lbs/wk gain" label for weight-gain goal', async ({ page, request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, GAIN_PROFILE)
    await page.goto('/settings')
    await expect(page.getByText(/lbs\/wk gain/)).toBeVisible()
    // Restore loss profile so subsequent tests start from a predictable state
    await patchSettings(request, token, LOSS_PROFILE)
  })

  /* ── Weekly view: Target box and weight impact ───────────────────────── */

  test('weekly Target box shows a negative lbs/wk for weight-loss goal', async ({ page, request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, LOSS_PROFILE)

    // Log a food item so the weight impact section renders (requires at least one tracked day)
    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()
    await page.getByPlaceholder('e.g. Banana Smoothie').fill('Pace Test Meal')
    await page.getByLabel('Calories').fill('200')
    await page.getByRole('button', { name: 'Save Item' }).click()
    await expect(page.getByText('Pace Test Meal')).toBeVisible()

    // Switch to the Weekly tab
    await page.getByRole('button', { name: 'Weekly' }).click()

    // The Target box value should be negative (weight goes down for a loss goal)
    const targetPace = page.getByTestId('weekly-target-pace')
    await expect(targetPace).toBeVisible()
    const text = await targetPace.textContent()
    expect(text).toMatch(/^-/)
  })

  test('weekly Target box shows a positive lbs/wk for weight-gain goal', async ({ page, request }) => {
    const token = await apiLogin(request)
    await patchSettings(request, token, GAIN_PROFILE)

    // Ensure there is a tracked day for this week
    await page.locator('button.fixed.bottom-6.right-6').click()
    await expect(page.getByRole('button', { name: 'Save Item' })).toBeVisible()
    await page.getByPlaceholder('e.g. Banana Smoothie').fill('Gain Test Meal')
    await page.getByLabel('Calories').fill('200')
    await page.getByRole('button', { name: 'Save Item' }).click()
    await expect(page.getByText('Gain Test Meal')).toBeVisible()

    await page.getByRole('button', { name: 'Weekly' }).click()

    const targetPace = page.getByTestId('weekly-target-pace')
    await expect(targetPace).toBeVisible()
    const text = await targetPace.textContent()
    expect(text).toMatch(/^\+/)

    // Restore loss profile
    await patchSettings(request, token, LOSS_PROFILE)
  })
})
