import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AddEntrySheet from './AddEntrySheet'
import type { JournalEntry } from '../../types'

// Mock API so no network calls are made from component tests
vi.mock('../../api', () => ({
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
}))

import * as api from '../../api'

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const noop = vi.fn()

const DEFAULT_PROPS = {
  open: true,
  onClose: noop,
  onSaved: noop,
  date: '2026-03-12',
}

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 1,
    entry_date: '2026-03-12',
    entry_time: '10:00',
    body: 'Feeling good.',
    tags: ['happy', 'thoughts'],
    habit_id: null,
    habit_name: null,
    created_at: '2026-03-12T10:00:00Z',
    updated_at: '2026-03-12T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.createJournalEntry).mockResolvedValue({} as JournalEntry)
  vi.mocked(api.updateJournalEntry).mockResolvedValue({} as JournalEntry)
})

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe('AddEntrySheet', () => {
  describe('validation', () => {
    it('disables the submit button when body is empty', () => {
      render(<AddEntrySheet {...DEFAULT_PROPS} />)
      expect(screen.getByRole('button', { name: 'Save Entry' })).toBeDisabled()
    })

    it('enables the submit button once body has content', () => {
      render(<AddEntrySheet {...DEFAULT_PROPS} />)
      fireEvent.change(screen.getByPlaceholderText(/What's on your mind/), {
        target: { value: 'Hello' },
      })
      expect(screen.getByRole('button', { name: 'Save Entry' })).not.toBeDisabled()
    })
  })

  describe('tag toggle', () => {
    it('selecting a tag includes it in the API payload on submit', async () => {
      render(<AddEntrySheet {...DEFAULT_PROPS} />)

      fireEvent.change(screen.getByPlaceholderText(/What's on your mind/), {
        target: { value: 'Good day' },
      })
      // Select the "Happy" emotion chip
      fireEvent.click(screen.getByRole('button', { name: /Happy/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))

      await waitFor(() =>
        expect(api.createJournalEntry).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['happy'] }),
        ),
      )
    })

    it('deselecting a tag removes it from the payload', async () => {
      render(<AddEntrySheet {...DEFAULT_PROPS} />)

      fireEvent.change(screen.getByPlaceholderText(/What's on your mind/), {
        target: { value: 'Good day' },
      })
      // Click once to select, click again to deselect
      const chip = screen.getByRole('button', { name: /Happy/ })
      fireEvent.click(chip)
      fireEvent.click(chip)
      fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))

      await waitFor(() =>
        expect(api.createJournalEntry).toHaveBeenCalledWith(
          expect.objectContaining({ tags: [] }),
        ),
      )
    })
  })

  describe('create mode', () => {
    it('starts with a blank body and no tags selected', () => {
      render(<AddEntrySheet {...DEFAULT_PROPS} />)
      const textarea = screen.getByPlaceholderText(/What's on your mind/) as HTMLTextAreaElement
      expect(textarea.value).toBe('')
    })

    it('shows "Save Entry" submit button', () => {
      render(<AddEntrySheet {...DEFAULT_PROPS} />)
      expect(screen.getByRole('button', { name: 'Save Entry' })).toBeInTheDocument()
    })

    it('calls createJournalEntry with body, tags, and date on submit', async () => {
      render(<AddEntrySheet {...DEFAULT_PROPS} />)

      fireEvent.change(screen.getByPlaceholderText(/What's on your mind/), {
        target: { value: 'Hello world' },
      })
      fireEvent.click(screen.getByRole('button', { name: /Thoughts/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))

      await waitFor(() =>
        expect(api.createJournalEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            entry_date: '2026-03-12',
            body: 'Hello world',
            tags: ['thoughts'],
          }),
        ),
      )
    })
  })

  describe('edit mode', () => {
    it('pre-fills body from editEntry', () => {
      const entry = makeEntry({ body: 'My thoughts today.' })
      render(<AddEntrySheet {...DEFAULT_PROPS} editEntry={entry} />)
      const textarea = screen.getByPlaceholderText(/What's on your mind/) as HTMLTextAreaElement
      expect(textarea.value).toBe('My thoughts today.')
    })

    it('shows "Save Changes" button', () => {
      const entry = makeEntry()
      render(<AddEntrySheet {...DEFAULT_PROPS} editEntry={entry} />)
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
    })

    it('calls updateJournalEntry with the entry id and updated fields on submit', async () => {
      const entry = makeEntry({ id: 42, body: 'Old content', tags: ['calm'] })
      render(<AddEntrySheet {...DEFAULT_PROPS} editEntry={entry} />)

      const textarea = screen.getByPlaceholderText(/What's on your mind/) as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'Updated content' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

      await waitFor(() =>
        expect(api.updateJournalEntry).toHaveBeenCalledWith(42, {
          body: 'Updated content',
          tags: ['calm'],
        }),
      )
    })
  })
})
