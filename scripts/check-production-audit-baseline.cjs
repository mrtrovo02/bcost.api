'use strict';

const { spawnSync } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const command = process.platform === 'win32' ? 'cmd.exe' : npmCommand;
const args =
  process.platform === 'win32'
    ? ['/d', '/c', npmCommand, 'audit', '--omit=dev', '--json']
    : ['audit', '--omit=dev', '--json'];

const allowedVulnerablePackages = new Set([
  '@fastify/middie',
  '@fastify/static',
  '@nestjs/bull-shared',
  '@nestjs/bullmq',
  '@nestjs/cache-manager',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  '@nestjs/platform-express',
  '@nestjs/platform-fastify',
  '@nestjs/platform-socket.io',
  '@nestjs/schedule',
  '@nestjs/swagger',
  '@nestjs/throttler',
  '@nestjs/websockets',
  'ajv',
  'fastify',
  'file-type',
  'find-my-way',
]);

const maxKnownSeverityCounts = {
  critical: 1,
  high: 4,
  moderate: 14,
  low: 0,
};

const result = spawnSync(command, args, {
  encoding: 'utf8',
  shell: false,
});

const rawOutput = result.stdout || result.stderr;

if (!rawOutput) {
  if (result.error) {
    console.error(
      `Audit produtivo reprovado: falha ao executar npm audit (${result.error.message}).`,
    );
    process.exit(1);
  }

  console.error('Audit produtivo reprovado: npm audit nao retornou JSON.');
  process.exit(1);
}

let report;

try {
  report = JSON.parse(rawOutput);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Audit produtivo reprovado: JSON invalido (${message}).`);
  process.exit(1);
}

const vulnerabilities =
  report && typeof report === 'object' && report.vulnerabilities
    ? report.vulnerabilities
    : {};
const packageNames = Object.keys(vulnerabilities);
const unexpectedPackages = packageNames.filter(
  (packageName) => !allowedVulnerablePackages.has(packageName),
);

const severityCounts =
  report && typeof report === 'object' && report.metadata
    ? report.metadata.vulnerabilities || {}
    : {};

const exceededSeverities = Object.entries(maxKnownSeverityCounts).filter(
  ([severity, maxCount]) => Number(severityCounts[severity] || 0) > maxCount,
);

if (unexpectedPackages.length > 0 || exceededSeverities.length > 0) {
  console.error('Audit produtivo reprovado.');

  if (unexpectedPackages.length > 0) {
    console.error(
      `Pacotes vulneraveis fora do baseline: ${unexpectedPackages.join(', ')}`,
    );
  }

  for (const [severity, maxCount] of exceededSeverities) {
    console.error(
      `Severidade ${severity} acima do baseline: ${severityCounts[severity]} > ${maxCount}`,
    );
  }

  process.exit(1);
}

console.log(
  [
    'Audit produtivo aprovado com baseline controlado.',
    `Pacotes vulneraveis conhecidos: ${packageNames.length}.`,
    `Criticas: ${severityCounts.critical || 0}; altas: ${severityCounts.high || 0}; moderadas: ${severityCounts.moderate || 0}; baixas: ${severityCounts.low || 0}.`,
    'Risco remanescente depende de trilha major Nest/Fastify documentada; novos pacotes vulneraveis bloquearao o predeploy.',
  ].join(' '),
);
