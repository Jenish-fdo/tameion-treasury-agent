/** Runs the BUILT bundle in MetaMask's Snap simulator. Build first with CREDENTIA_DEMO_MODE=true (see package.json). */
module.exports = { preset: '@metamask/snaps-jest', roots: ['<rootDir>/test/integration'], testMatch: ['**/*.test.js'] };
