'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');

const git = spawnSync('git', ['ls-files'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (git.status !== 0) {
  process.stderr.write(git.stderr || 'Falha ao listar arquivos versionados.\n');
  process.exit(1);
}

const ignoredPathFragments = [
  '/node_modules/',
  '/dist/',
  '/coverage/',
  '/.next/',
  '/.git/',
  '/documentation/',
];

const setupAdminFlagName = 'ALLOW_SETUP_ADMIN';
const enabledLiteral = 'true';
const stripeSecretPattern = new RegExp(
  String.raw`\b(?:${['rk', 'sk'].join('|')})_(?:${['test', 'live'].join('|')})_[A-Za-z0-9]{20,}\b|` +
    String.raw`\b${['whsec'].join('')}_[A-Za-z0-9]{20,}\b`,
  'g',
);
const unsafeSetupAdminPattern = new RegExp(
  String.raw`\b${setupAdminFlagName}\s*=\s*${enabledLiteral}\b`,
);
const forbiddenRootArtifacts = new Set([
  'SWC',
  'nest',
  'bcost-api@0.1.0',
  'fix_drift.sql',
  'fix_finance_scope.ts',
  'patch_dashboard_cache.ts',
  'patch_revenue_fix.ts',
  'fix-bootstrap.ps1',
  'smoke-readonly.sh',
  'audit_plan.sh',
  'test-engine.ts',
]);

const findings = [];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function shouldSkip(filePath) {
  const normalized = `/${normalizePath(filePath)}`;
  return ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function inspectFile(filePath) {
  if (shouldSkip(filePath)) return;

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  if (content.includes('\u0000')) return;

  stripeSecretPattern.lastIndex = 0;
  for (const match of content.matchAll(stripeSecretPattern)) {
    const index = match.index ?? 0;
    const line = content.slice(0, index).split(/\r?\n/).length;
    findings.push(`${filePath}:${line}: Stripe-like secret versionado`);
  }

  if (/\.(spec|test)\.[cm]?[jt]s$/.test(filePath)) return;

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (unsafeSetupAdminPattern.test(line)) {
      findings.push(`${filePath}:${index + 1}: setup admin habilitado em arquivo versionado`);
    }
  }
}

for (const filePath of git.stdout.split(/\r?\n/).filter(Boolean)) {
  const normalizedPath = normalizePath(filePath);
  if (forbiddenRootArtifacts.has(normalizedPath) && existsSync(filePath)) {
    findings.push(`${filePath}: artefato operacional temporario nao deve ser versionado na raiz`);
    continue;
  }

  inspectFile(filePath);
}

if (findings.length > 0) {
  process.stderr.write('Security scan reprovado:\n');
  for (const finding of findings) {
    process.stderr.write(`- ${finding}\n`);
  }
  process.exit(1);
}

process.stdout.write('Security scan aprovado: nenhum segredo produtivo/teste realístico versionado.\n');
