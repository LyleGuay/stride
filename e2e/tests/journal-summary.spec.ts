import { test, expect } from '@playwright/test'

// E2E tests for the Journal Summary tab.
// Covers: range selector behavior, sub-navigator presence/absence,
// bar chart tooltip, and navigating back to the daily tab from a tooltip.

const E2E_USER = 'e2e_user'
const E2E_PASSWORD = 'password123'

// Login, navigate to journal, and switch to Summary tab before each test.
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', E2E_USER)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/calorie-log')
  await page.goto('/journal')
  await page.waitForURL('**/journal')

  // Switch to Summary tab (desktop underline tab row, hidden on mobile)
  await page.getByRole('button', { name: 'Summary' }).click()
  // Wait for the summary content to render
  await expect(page.getByText('Mental State Over Time')).toBeVisible()
})

test.describe('Journal — Summary tab', () => {
  test('default view is Week with range pills and sub-navigator visible', async ({ page }) => {
    // Week pill should appear selected (white bg, shadow-sm from active style)
    await expect(page.getByRole('button', { name: 'Week' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible()
    await expect(page.getByRole('button', { name: '6M' })).toBeVisible()
    await expect(page.getByRole('button', { name: '1yr' })).toBeVisible()

    // Sub-navigator shows Previous/Next period arrows for week range
    await expect(page.getByRole('button', { name: 'Previous period' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next period' })).toBeVisible()
  })

  test('switching to Month updates the sub-navigator label to a month name', async ({ page }) => {
    await page.getByRole('button', { name: 'Month' }).click()

    // Sub-navigator should still be visible
    await expect(page.getByRole('button', { name: 'Previous period' })).toBeVisible()

    // The label should be a month name (e.g. "April 2026") — not a date-range "–" format
    const navLabel = page.locator('span.text-xs.font-medium.text-gray-700')
    const labelText = await navLabel.textContent()
    // Month labels contain the full month name without "–"
    expect(labelText).not.toContain('–')
  })

  test('switching to 6M hides the sub-navigator', async ({ page }) => {
    await page.getByRole('button', { name: '6M' }).click()

    // Sub-navigator should be absent for ranges beyond month
    await expect(page.getByRole('button', { name: 'Previous period' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Next period' })).not.toBeVisible()
  })

  test('clicking a bar in Week view shows a dark tooltip with "Go to day →"', async ({ page }) => {
    // Wait for the chart bars to be rendered
    await expect(page.getByTestId('bar-0')).toBeVisible()

    // Click the first bar (Monday of the current week)
    await page.getByTestId('bar-0').click()

    // The dark tooltip should appear — it contains "Go to day →"
    await expect(page.getByRole('button', { name: 'Go to day →' })).toBeVisible()
  })

  test('"Go to day →" in the tooltip switches to Daily tab', async ({ page }) => {
    // Open the tooltip by clicking any bar
    await expect(page.getByTestId('bar-0')).toBeVisible()
    await page.getByTestId('bar-0').click()
    await expect(page.getByRole('button', { name: 'Go to day →' })).toBeVisible()

    // Click "Go to day →" to navigate to the daily tab
    await page.getByRole('button', { name: 'Go to day →' }).click()

    // Daily tab is now active: FAB and date navigator should be visible
    await expect(page.getByTestId('add-entry-fab')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open date picker' })).toBeVisible()

    // Summary content should be gone
    await expect(page.getByText('Mental State Over Time')).not.toBeVisible()
  })

  test('stats row shows Days logged and Total entries cards', async ({ page }) => {
    await expect(page.getByText('Days logged')).toBeVisible()
    await expect(page.getByText('Total entries')).toBeVisible()
  })
})
