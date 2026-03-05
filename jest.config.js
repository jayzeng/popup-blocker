module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['./tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/setup\\.js$'],
};
