/* Bottom tab bar layout — Log and Settings tabs. */

import { Tabs } from 'expo-router'
import { Text } from 'react-native'

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: () => <Text>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: () => <Text>⚙️</Text>,
        }}
      />
    </Tabs>
  )
}
