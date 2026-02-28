# mobile-client/CLAUDE.md

Expo React Native app for Stride. See the root `CLAUDE.md` for project-wide conventions.

## Commands

```bash
# From repo root
pnpm --filter mobile-client run start     # Expo dev server
pnpm --filter mobile-client run android   # Launch on Android emulator
pnpm --filter mobile-client run test      # Jest unit tests

# Or from inside mobile-client/
npx expo start
npm test
```

## Architecture

**Navigation:** Expo Router (file-based). Route files live in `app/`. The root layout (`app/_layout.tsx`) checks for a stored auth token on mount and redirects to `/(auth)/login` or `/(tabs)/log`.

**Styling:** NativeWind — use Tailwind utility classes directly on React Native components (`className="flex-1 bg-white"`). NativeWind compiles these at build time via `global.css` and `metro.config.js`.

**Auth:** `src/auth.ts` wraps `expo-secure-store`. Always use this rather than calling SecureStore directly — keeps the key name in one place.

**Shared types/utils:** Import from `@stride/shared`, not from relative paths into `packages/`.

**Environment:** `EXPO_PUBLIC_` prefix exposes variables to the JS bundle (Expo's convention). API URL is `EXPO_PUBLIC_API_URL`.

## Testing

Uses Jest via `jest-expo` preset. The `transformIgnorePatterns` in `jest.config.js` are tuned for pnpm's virtual store (`.pnpm/`) — don't simplify them without testing first.

```bash
npm test              # run once
npm test -- --watch   # watch mode
```

For component tests use `@testing-library/react-native`. Mock `expo-secure-store` and other native modules with `jest.mock()`.

No E2E tests yet. When the log screen is built, use Detox. See the root `CLAUDE.md` for E2E strategy notes.

## Adding Screens

1. Create a file under `app/` following Expo Router conventions.
2. Add `testID` props to all interactive elements (required for future Detox tests).
3. Use NativeWind `className` for styles — no `StyleSheet.create`.
4. Import shared types from `@stride/shared`.

## Building / EAS

- `eas.json` defines two profiles: `preview` (APK, internal) and `production` (AAB).
- CI builds the `preview` APK automatically on push to `main` when mobile code changes.
- To build manually: `eas build -p android --profile preview` (requires `EXPO_TOKEN`).
