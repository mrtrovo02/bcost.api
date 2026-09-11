'use strict';

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

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

const stripeSecretPattern = new RegExp(
  String.raw`\b(?:${['rk', 'sk'].join('|')})_(?:${['test', 'live'].join('|')})_[A-Za-z0-9]{20,}\b|` +
    String.raw`\b${['whsec'].join('')}_[A-Za-z0-9]{20,}\b`,
  'g',
);
const unsafeSetupAdminPattern = /\bALLOW_SETUP_ADMIN\s*=\s*true\b/;

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
      findings.push(`${filePath}:${index + 1}: ALLOW_SETUP_ADMIN=true versionado`);
    }
  }
}

for (const filePath of git.stdout.split(/\r?\n/).filter(Boolean)) {
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
