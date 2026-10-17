module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // Components are tested against a minimal stand-in for react-native's primitives, not the native runtime.
  moduleNameMapper: { '^react-native$': '<rootDir>/test/mocks/react-native.tsx' },
};
