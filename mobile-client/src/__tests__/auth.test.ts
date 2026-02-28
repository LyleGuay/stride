/* Smoke tests for the auth token storage wrapper.
   Mocks expo-secure-store to verify the key name and delegation are correct. */

import * as SecureStore from 'expo-secure-store'
import { auth } from '../auth'

// Mock expo-secure-store so tests run without a native environment
const store: Record<string, string> = {}
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    store[key] = value
    return Promise.resolve()
  }),
  deleteItemAsync: jest.fn((key: string) => {
    delete store[key]
    return Promise.resolve()
  }),
}))

beforeEach(() => {
  // Clear the in-memory store and all mock call history between tests
  for (const key of Object.keys(store)) delete store[key]
  jest.clearAllMocks()
})

describe('auth', () => {
  it('setToken stores the value under auth_token key', async () => {
    await auth.setToken('my-token')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('auth_token', 'my-token')
  })

  it('getToken retrieves the stored value', async () => {
    await auth.setToken('abc123')
    const token = await auth.getToken()
    expect(token).toBe('abc123')
  })

  it('clearToken removes the stored value', async () => {
    await auth.setToken('to-delete')
    await auth.clearToken()
    const token = await auth.getToken()
    expect(token).toBeNull()
  })
})
