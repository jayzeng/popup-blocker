module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFiles: ['./src/__tests__/setup.ts'],
  moduleNameMapper: { '\\.(css)$': '<rootDir>/src/__tests__/__mocks__/fileMock.js' },
  testPathIgnorePatterns: ['/node_modules/', '/__mocks__/', '/setup\\.ts$'],
};
