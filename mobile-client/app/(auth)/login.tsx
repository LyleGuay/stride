/* Login screen — submits username/password to the API and stores the token on success. */

import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { auth } from '../../src/auth'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000'

export default function LoginScreen() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        setError('Invalid username or password.')
        return
      }

      const data = await res.json()
      await auth.setToken(data.token)
      router.replace('/(tabs)/log')
    } catch {
      // Network error or JSON parse failure
      setError('Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stride</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.debug}>API: {API_URL}/api/login</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  error: {
    color: '#ef4444',
    marginBottom: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  debug: {
    marginTop: 16,
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
})
