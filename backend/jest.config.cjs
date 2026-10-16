/** Run through `npm test` (adds --experimental-vm-modules for native ESM). */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  // Source files import siblings as './x.js'; map them back to the .ts files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.test.json' }] },
  setupFiles: ['<rootDir>/test/setup-env.cjs'],
  // Coverage is measured on the AI-consensus modules this suite is responsible for.
  collectCoverageFrom: [
    'src/services/aiConsensusService.ts',
    'src/config/aiModels.ts',
    'src/utils/modelCache.ts',
    'src/utils/promptBuilder.ts',
    'src/utils/promptSanitizer.ts',
    'src/utils/intentHash.ts',
    'src/utils/logger.ts',
    'src/middleware/rateLimiter.ts',
    'src/routes/intent.ts',
  ],
  coverageThreshold: { global: { statements: 90, branches: 90, functions: 90, lines: 90 } },
};
