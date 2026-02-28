module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  // pnpm hoists packages to root node_modules/.pnpm/PACKAGE@VERSION/node_modules/PACKAGE/
  // The (.pnpm/)? prefix handles both the virtual-store path and the regular symlinked path.
  // Scoped packages under @react-native/* also need the (.pnpm/)? prefix, which is why the
  // entire exempt group is wrapped rather than only non-scoped packages.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm/)?(?:(jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?|react-navigation|@react-navigation|nativewind))',
  ],
}
