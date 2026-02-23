import { test, expect } from '@playwright/test'

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear auth state before each test
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('token'))
  })

  test('login with valid credentials redirects to /calorie-log', async ({ page }) => {
    await page.goto('/login')

    await page.fill('#username', E2E_USER)
    await page.fill('#password', E2E_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL('**/calorie-log')
    expect(page.url()).toContain('/calorie-log')
  })

  test('login with bad credentials shows error and stays on /login', async ({ page }) => {
    await page.goto('/login')

    await page.fill('#username', E2E_USER)
    await page.fill('#password', 'wrong-password')
    await page.click('button[type="submit"]')

    // Should remain on login and show error
    await page.waitForURL('**/login')
    await expect(page.getByText('Invalid username or password')).toBeVisible()
  })

  test('unauthenticated access to /calorie-log redirects to /login', async ({ page }) => {
    await page.goto('/calorie-log')
    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')
  })
})
