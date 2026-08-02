/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  injectGlobals: true,
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    '^#common/(.*)\\.js$': '<rootDir>/src/common/$1',
    '^#database/(.*)\\.js$': '<rootDir>/src/database/$1',
    '^#auth/(.*)\\.js$': '<rootDir>/src/auth/$1',
    '^#modules/(.*)\\.js$': '<rootDir>/src/modules/$1',
    '^#shared/(.*)\\.js$': '<rootDir>/src/shared/$1',
    '^#common/(.*)$': '<rootDir>/src/common/$1',
    '^#database/(.*)$': '<rootDir>/src/database/$1',
    '^#auth/(.*)$': '<rootDir>/src/auth/$1',
    '^#modules/(.*)$': '<rootDir>/src/modules/$1',
    '^#shared/(.*)$': '<rootDir>/src/shared/$1',
    '^#/(.*)\\.js$': '<rootDir>/src/$1',
    '^#/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};
