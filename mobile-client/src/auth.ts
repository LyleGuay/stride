/* Thin wrapper around expo-secure-store for auth token persistence.
   SecureStore uses Android Keystore on Android and Keychain on iOS,
   so the token survives app restarts but is not accessible to other apps. */

import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'auth_token'

export const auth = {
  // Retrieves the stored auth token, or null if none is set.
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  // Persists the auth token from a successful login response.
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  // Clears the auth token on logout or session expiry.
  clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
}
