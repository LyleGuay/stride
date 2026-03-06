// CalorieLogTabs — tests for tab switching visibility logic.
// Verifies that the DateHeader (date navigator) is shown only on the Daily tab.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import CalorieLog from '../../../pages/CalorieLog'
import { SidebarProvider } from '../../SidebarContext'

// Minimal mock responses — enough to prevent network errors
const mockDaily = {
  date: '2026-03-05',
  calorie_budget: 2000, calories_food: 0, calories_exercise: 0,
  net_calories: 0, calories_left: 2000,
  protein_g: 0, carbs_g: 0, fat_g: 0,
  items: [],
  settings: {
    user_id: 1, calorie_budget: 2000,
    protein_target_g: 150, carbs_target_g: 200, fat_target_g: 65,
    breakfast_budget: 400, lunch_budget: 600, dinner_budget: 700, snack_budget: 300,
    exercise_target_calories: 300,
    sex: null, date_of_birth: null, height_cm: null, weight_lbs: null,
    activity_level: null, target_weight_lbs: null, target_date: null,
    units: 'imperial', budget_auto: false, setup_complete: false,
  },
}

const server = setupServer(
  http.get('/api/calorie-log/daily', () => HttpResponse.json(mockDaily)),
  http.get('/api/calorie-log/favorites', () => HttpResponse.json([])),
  http.get('/api/calorie-log/earliest-date', () => HttpResponse.json({ date: null })),
  http.get('/api/calorie-log/week-summary', () => HttpResponse.json([])),
  http.get('/api/calorie-log/progress', () => HttpResponse.json({
    days: [], stats: {
      days_tracked: 0, days_on_budget: 0, avg_calories_food: 0,
      avg_calories_exercise: 0, avg_net_calories: 0, avg_protein_g: 0,
      avg_carbs_g: 0, avg_fat_g: 0,
    },
  })),
  // Weight log is at /api/weight-log (not under /api/calorie-log/)
  http.get('/api/weight-log', () => HttpResponse.json([])),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Wrap CalorieLog with the providers it needs
function renderCalorieLog() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <CalorieLog />
      </SidebarProvider>
    </MemoryRouter>
  )
}

// DateHeader renders "Today" (or a date string) as its primary label.
// Checking for this text confirms the date navigator is visible.
function dateHeaderVisible() {
  // DateHeader always shows either "Today", "Yesterday", or a date label
  return screen.queryByText(/^Today$|^Yesterday$/) !== null
}

describe('CalorieLog tab switching', () => {
  it('defaults to Daily tab — DateHeader is visible', async () => {
    renderCalorieLog()
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    expect(dateHeaderVisible()).toBe(true)
  })

  it('switching to Weekly hides the DateHeader', async () => {
    renderCalorieLog()
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))
    expect(dateHeaderVisible()).toBe(false)
  })

  it('switching to Progress hides the DateHeader', async () => {
    renderCalorieLog()
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Progress' }))
    expect(dateHeaderVisible()).toBe(false)
  })

  it('switching back to Daily shows the DateHeader again', async () => {
    renderCalorieLog()
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))
    expect(dateHeaderVisible()).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Daily' }))
    expect(dateHeaderVisible()).toBe(true)
  })
})
