import { test, expect } from '@playwright/test'

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

// Navigate to /journal before each test.
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/journal')
  await page.waitForURL('**/journal')
})

test.describe('Journal — entry CRUD', () => {
  test('add entry with a tag → card appears in timeline with tag chip', async ({ page }) => {
    const body = `E2E entry ${Date.now()}`

    // Open AddEntrySheet via FAB
    await page.getByTestId('add-entry-fab').click()
    await expect(page.getByRole('heading', { name: 'New Entry' })).toBeVisible()

    // Fill body
    await page.getByPlaceholder(/What's on your mind/).fill(body)

    // Select a tag (Happy mood chip — regex to match emoji prefix)
    await page.getByRole('button', { name: /Happy/ }).click()

    // Save
    await page.getByRole('button', { name: 'Save Entry' }).click()

    // Sheet closes; entry card appears with body text and tag chip
    await expect(page.getByTestId('entry-card').filter({ hasText: body })).toBeVisible()
    await expect(page.getByTestId('entry-card').filter({ hasText: body })).toContainText('Happy')
  })

  test('add entry with no tags → card appears with no tag chips', async ({ page }) => {
    const body = `No-tag entry ${Date.now()}`

    await page.getByTestId('add-entry-fab').click()
    await expect(page.getByRole('heading', { name: 'New Entry' })).toBeVisible()

    await page.getByPlaceholder(/What's on your mind/).fill(body)
    await page.getByRole('button', { name: 'Save Entry' }).click()

    const card = page.getByTestId('entry-card').filter({ hasText: body })
    await expect(card).toBeVisible()
    // No tag chip spans should be visible in the card (chips are <span class="...rounded-full...">)
    await expect(card.locator('span.rounded-full')).toHaveCount(0)
  })

  test('edit entry → change persists after page reload', async ({ page }) => {
    const original = `Edit-me ${Date.now()}`
    const updated = `Updated ${Date.now()}`

    // Create entry first
    await page.getByTestId('add-entry-fab').click()
    await page.getByPlaceholder(/What's on your mind/).fill(original)
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByTestId('entry-card').filter({ hasText: original })).toBeVisible()

    // Open ··· menu on the new card and click Edit
    const card = page.getByTestId('entry-card').filter({ hasText: original })
    await card.getByTestId('entry-menu-button').click()
    await page.getByRole('button', { name: 'Edit' }).click()

    // Sheet opens in edit mode — pre-filled with original body
    await expect(page.getByRole('heading', { name: 'Edit Entry' })).toBeVisible()
    const textarea = page.getByPlaceholder(/What's on your mind/)
    await textarea.clear()
    await textarea.fill(updated)
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // Card updates immediately
    await expect(page.getByTestId('entry-card').filter({ hasText: updated })).toBeVisible()

    // Reload and verify change persisted
    await page.reload()
    await expect(page.getByTestId('entry-card').filter({ hasText: updated })).toBeVisible()
  })

  test('delete entry → confirm in dialog → entry removed from timeline', async ({ page }) => {
    const body = `Delete-me ${Date.now()}`

    // Create entry first
    await page.getByTestId('add-entry-fab').click()
    await page.getByPlaceholder(/What's on your mind/).fill(body)
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByTestId('entry-card').filter({ hasText: body })).toBeVisible()

    // Open ··· menu and delete
    const card = page.getByTestId('entry-card').filter({ hasText: body })
    await card.getByTestId('entry-menu-button').click()

    // Accept the browser confirm dialog
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Delete' }).click()

    // Entry disappears
    await expect(page.getByTestId('entry-card').filter({ hasText: body })).not.toBeVisible()
  })

  test('date navigation → yesterday shows empty (or different) state from today', async ({ page }) => {
    // Add an entry for today so it is uniquely identifiable
    const body = `Today only ${Date.now()}`
    await page.getByTestId('add-entry-fab').click()
    await page.getByPlaceholder(/What's on your mind/).fill(body)
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByTestId('entry-card').filter({ hasText: body })).toBeVisible()

    // Navigate to yesterday
    await page.getByRole('button', { name: 'Previous day' }).click()

    // Today's entry should no longer appear
    await expect(page.getByTestId('entry-card').filter({ hasText: body })).not.toBeVisible()
  })
})
