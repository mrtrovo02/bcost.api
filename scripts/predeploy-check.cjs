'use strict';

const { spawnSync } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const command = process.platform === 'win32' ? 'cmd.exe' : npmCommand;
const withBuild = process.argv.includes('--with-build');
const codeOnly = process.argv.includes('--code-only');

const steps = [
  ['security:scan', 'Bloqueia segredos versionados e credenciais realisticas.'],
  ['prisma:generate', 'Garante Prisma Client alinhado ao schema atual.'],
  ['prisma:validate', 'Valida o schema Prisma antes do build/deploy.'],
];

if (!codeOnly) {
  steps.push([
    'release:check',
    'Valida variaveis produtivas, RLS, CORS, Stripe, Swagger e gates operacionais.',
  ]);
}

steps.push(
  ['typecheck', 'Executa TypeScript sem emissao.'],
  ['test:auth-session', 'Cobre login, sessao e tenant context.'],
  ['test:release-gates', 'Cobre gates de release, deploy, provisionamento e limites de consulta.'],
  ['test:tax-scenarios', 'Cobre motor tributario orientativo.'],
  ['test:observability', 'Cobre filtros, metricas e acesso a observabilidade.'],
);

if (withBuild) {
  steps.push(['build', 'Compila o backend para producao.']);
}

function runScript(scriptName, description) {
  console.log(`\n[predeploy] ${scriptName}: ${description}`);
  const args =
    process.platform === 'win32' ? ['/d', '/c', npmCommand, 'run', scriptName] : ['run', scriptName];

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[predeploy] Falha ao iniciar ${scriptName}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[predeploy] ${scriptName} reprovado com status ${result.status}.`);
    process.exit(result.status || 1);
  }
}

for (const [scriptName, description] of steps) {
  runScript(scriptName, description);
}

const mode = codeOnly ? 'codigo local' : 'ambiente produtivo';
console.log(`\n[predeploy] API aprovada para a proxima etapa de deploy (${mode}).`);
