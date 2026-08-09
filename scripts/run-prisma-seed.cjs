'use strict';

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'Node',
    target: 'ES2023',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
  },
});

require('../prisma/seed.ts');
