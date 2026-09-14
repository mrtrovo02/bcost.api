'use strict';

const MINIMUM_NODE_MAJOR = 24;

function configuredNodeVersion() {
  return process.env.BCOST_NODE_VERSION_OVERRIDE || process.versions.node;
}

function nodeMajor(version) {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : null;
}

const version = configuredNodeVersion();
const major = nodeMajor(version);

if (major === null || major < MINIMUM_NODE_MAJOR) {
  console.error(
    `Node runtime reprovado: encontrado ${version || 'desconhecido'}; use Node.js ${MINIMUM_NODE_MAJOR} LTS ou superior.`,
  );
  process.exit(1);
}

console.log(`Node runtime aprovado: ${version}.`);
