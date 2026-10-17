/** Unit tests: plain Jest with ts-jest (JSX comes from tsconfig). The Snap bundle itself is covered by test/integration. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/integration/'],
};
