'use strict';

require('dotenv').config();

const { spawnSync } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const command = process.platform === 'win32' ? 'cmd.exe' : npmCommand;

function valueOf(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function isEnabled(name) {
  return ['1', 'true', 'yes', 'on'].includes(valueOf(name).toLowerCase());
}

function shouldRequireAuthenticatedSmoke() {
  if (isEnabled('BCOST_DEPLOY_REQUIRE_AUTH_SMOKE')) return true;

  const releaseStage = valueOf('RELEASE_STAGE').toLowerCase();
  return ['official', 'live', 'enterprise', 'production-live'].includes(releaseStage);
}

function run(commandName, args) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw new Error(`Falha ao executar ${commandName}: ${result.error.message}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function git(args) {
  const result = run('git', args);

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `status ${result.status}`;
    throw new Error(`git ${args.join(' ')} falhou: ${detail}`);
  }

  return result.stdout;
}

function classifyStatusLines(status) {
  const lines = status.split(/\r?\n/).filter(Boolean);

  return {
    tracked: lines.filter((line) => !line.startsWith('?? ')),
    untracked: lines.filter((line) => line.startsWith('?? ')),
  };
}

function runNpmScript(scriptName, extraEnv = {}) {
  const args =
    process.platform === 'win32' ? ['/d', '/c', npmCommand, 'run', scriptName] : ['run', scriptName];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`Falha ao iniciar npm run ${scriptName}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} reprovado com status ${result.status}.`);
  }
}

function verifyGitState() {
  const status = git(['status', '--short']);
  const { tracked, untracked } = classifyStatusLines(status);

  if (tracked.length > 0) {
    console.error('Alteracoes rastreadas encontradas no deploy:');
    for (const line of tracked) console.error(`- ${line}`);
    throw new Error('Deploy possui alteracoes rastreadas locais.');
  }

  if (untracked.length > 0) {
    console.warn('Arquivos nao rastreados no deploy (nao bloqueante):');
    for (const line of untracked) console.warn(`- ${line}`);
  }

  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);

  if (head !== originMain) {
    throw new Error(`HEAD local (${head.slice(0, 12)}) difere de origin/main (${originMain.slice(0, 12)}).`);
  }

  console.log(`Git OK: HEAD sincronizado com origin/main (${head.slice(0, 12)}).`);
}

function main() {
  verifyGitState();
  runNpmScript('smoke:production');

  const requireAuthenticatedSmoke = shouldRequireAuthenticatedSmoke();
  console.log(
    requireAuthenticatedSmoke
      ? 'Authenticated smoke obrigatorio neste deploy.'
      : 'Authenticated smoke opcional neste deploy; use BCOST_DEPLOY_REQUIRE_AUTH_SMOKE=true para beta pago.',
  );

  runNpmScript(
    'smoke:authenticated',
    requireAuthenticatedSmoke ? { BCOST_SMOKE_AUTH_REQUIRED: 'true' } : {},
  );

  if (!requireAuthenticatedSmoke) {
    console.warn(
      'WARN authenticated-smoke pode ter sido pulado. Defina BCOST_DEPLOY_REQUIRE_AUTH_SMOKE=true para gate de beta pago.',
    );
  }

  console.log('Deploy verificado: git e smoke de producao aprovados.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
