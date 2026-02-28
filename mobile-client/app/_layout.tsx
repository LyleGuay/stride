/* Root layout — checks stored auth token on mount and redirects accordingly.
   Expo Router renders this as the outermost shell for all routes. */

import { useEffect, useState } from 'react'
import { Slot, useRouter } from 'expo-router'
import { auth } from '../src/auth'

export default function RootLayout() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // Read the token once on mount and redirect to the appropriate starting screen.
    auth.getToken().then((token) => {
      if (token) {
        router.replace('/(tabs)/log')
      } else {
        router.replace('/(auth)/login')
      }
      setChecked(true)
    })
  }, [router])

  // Render nothing until the redirect fires to avoid a flash of the wrong screen.
  if (!checked) return null

  return <Slot />
}
