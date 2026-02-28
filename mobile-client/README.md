# Stride Mobile Client

React Native app for the Stride calorie log. Built with Expo and styled with NativeWind (Tailwind CSS for React Native).

## Tech Stack

- **Expo** (SDK 55) — managed workflow, OTA updates
- **Expo Router** — file-based navigation (same mental model as Next.js App Router)
- **NativeWind** — Tailwind CSS utility classes in React Native components
- **expo-secure-store** — encrypted token storage via Android Keystore / iOS Keychain

## Prerequisites

- Node 20+, pnpm 9+
- **Expo Go** app on your Android/iOS device, or Android Studio with a configured emulator

## Setup

```bash
# From the repo root
pnpm install

# Copy the env file and set your machine's local IP if testing on a real device
# (10.0.2.2 is the Android emulator's alias for localhost — works out of the box for emulators)
cp mobile-client/.env.example mobile-client/.env
```

## Commands

Run these from the repo root or from inside `mobile-client/`:

```bash
pnpm --filter mobile-client run start    # Start Expo dev server, scan QR with Expo Go
pnpm --filter mobile-client run android  # Launch on Android emulator
pnpm --filter mobile-client run test     # Run Jest unit tests
```

Or from inside `mobile-client/`:

```bash
npx expo start
npx expo start --android
npm test
```

### USB-connected Android device

```bash
npx expo start --android
```

Expo detects the device via ADB and opens the app automatically. If it doesn't pick up the device, check ADB sees it first:

```bash
adb devices   # should show your device as "device", not "unauthorized"
```

If it shows `unauthorized`, accept the "Allow USB debugging?" prompt on your phone.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://10.0.2.2:3000` | Go API base URL. Use `10.0.2.2` for Android emulator, or your machine's LAN IP for a real device. |

## Project Structure

```
mobile-client/
  app/
    _layout.tsx          # Root layout — reads auth token, redirects to login or tabs
    (auth)/
      login.tsx          # Login screen
    (tabs)/
      _layout.tsx        # Bottom tab bar
      log.tsx            # Calorie log tab (placeholder)
      settings.tsx       # Settings tab (placeholder)
  src/
    auth.ts              # SecureStore token wrapper
    __tests__/
      auth.test.ts
  global.css             # Tailwind entry point
  babel.config.js        # babel-preset-expo + NativeWind
  metro.config.js        # Metro bundler config with NativeWind + pnpm symlinks
  eas.json               # EAS Build profiles (preview APK, production AAB)
```

## Building for Android

APK builds run automatically on CI when `mobile-client/` or `packages/shared/` changes. To trigger a manual build:

```bash
cd mobile-client
eas build -p android --profile preview
```

Requires an `EXPO_TOKEN` environment variable (generate at [expo.dev](https://expo.dev)).
