'use strict';

const { spawnSync } = require('node:child_process');

const DEFAULT_DISK_MAX_PERCENT = 85;
const DEFAULT_NPM_CACHE_WARN_MB = 2048;

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function runShell(script) {
  const result = spawnSync('bash', ['-lc', script], {
    encoding: 'utf8',
    shell: false,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function assertLinuxRuntime() {
  if (process.platform !== 'linux') {
    console.log('SKIP ec2-operational-check: execute este check dentro da EC2 Linux.');
    process.exit(0);
  }
}

function record(results, name, ok, details) {
  results.push({ name, ok, details });
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${details}`);
}

function checkDisk(results) {
  const maxPercent = numericEnv('BCOST_EC2_DISK_MAX_PERCENT', DEFAULT_DISK_MAX_PERCENT);
  const result = runShell("df -P / | awk 'NR==2 {gsub(/%/, \"\", $5); print $5, $4}'");

  if (result.status !== 0) {
    record(results, 'disk-root', false, result.stderr.trim() || 'falha ao ler df');
    return;
  }

  const [usedPercentText, availableKbText] = result.stdout.trim().split(/\s+/);
  const usedPercent = Number(usedPercentText);
  const availableGb = Number(availableKbText) / 1024 / 1024;

  record(
    results,
    'disk-root',
    Number.isFinite(usedPercent) && usedPercent <= maxPercent,
    `${usedPercent}% usado, ${availableGb.toFixed(1)}GB livres, limite ${maxPercent}%`,
  );
}

function checkNpmCache(results) {
  const warnMb = numericEnv('BCOST_EC2_NPM_CACHE_WARN_MB', DEFAULT_NPM_CACHE_WARN_MB);
  const result = runShell('du -sm "$HOME/.npm" 2>/dev/null | awk \'{print $1}\'');

  if (result.status !== 0 || !result.stdout.trim()) {
    record(results, 'npm-cache', true, 'cache npm ausente ou pequeno');
    return;
  }

  const sizeMb = Number(result.stdout.trim());
  record(
    results,
    'npm-cache',
    Number.isFinite(sizeMb) && sizeMb <= warnMb,
    `${sizeMb}MB, limite ${warnMb}MB; use npm cache clean --force em janela segura se exceder`,
  );
}

function checkPm2(results) {
  const result = runShell(
    'pm2 jlist | node -e "let s=\\"\\";process.stdin.on(\\"data\\",d=>s+=d);process.stdin.on(\\"end\\",()=>{const apps=JSON.parse(s); for (const name of [\\"bcost-api\\",\\"bcost-web\\"]) { const app=apps.find(a=>a.name===name); const status=app && app.pm2_env ? app.pm2_env.status : \\"missing\\"; console.log(name + \\":\\" + status); }})"',
  );

  if (result.status !== 0) {
    record(results, 'pm2-apps', false, result.stderr.trim() || 'falha ao consultar pm2');
    return;
  }

  const statuses = result.stdout.trim().split(/\n+/).filter(Boolean);
  const ok = statuses.includes('bcost-api:online') && statuses.includes('bcost-web:online');
  record(results, 'pm2-apps', ok, statuses.join(', '));
}

async function checkHttp(results, name, url, expectedService) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await response.json();
    const ok =
      response.ok &&
      body &&
      body.status === 'UP' &&
      body.service === expectedService &&
      typeof body.buildVersion === 'string' &&
      body.buildVersion.length > 0;

    record(
      results,
      name,
      ok,
      `HTTP ${response.status}, status=${String(body.status)}, service=${String(body.service)}, build=${String(body.buildVersion)}`,
    );
  } catch (error) {
    record(results, name, false, error instanceof Error ? error.message : String(error));
  }
}

function checkCertbot(results) {
  const service = runShell('systemctl is-failed certbot-renew.service 2>/dev/null || true');
  const timer = runShell('systemctl is-active certbot-renew.timer 2>/dev/null || true');
  const override = runShell(
    "systemctl cat certbot-renew.service 2>/dev/null | grep -F '/opt/certbot/bin/certbot renew' >/dev/null && echo override-ok || echo override-missing",
  );

  const serviceState = service.stdout.trim();
  const timerState = timer.stdout.trim();
  const overrideState = override.stdout.trim();
  const ok = serviceState !== 'failed' && timerState === 'active' && overrideState === 'override-ok';

  record(
    results,
    'certbot-renew',
    ok,
    `service=${serviceState || 'unknown'}, timer=${timerState || 'unknown'}, ${overrideState}`,
  );
}

function checkFailedUnits(results) {
  const result = runShell('systemctl --failed --no-legend 2>/dev/null | wc -l');
  const count = Number(result.stdout.trim());

  record(
    results,
    'systemd-failed-units',
    result.status === 0 && count === 0,
    `${Number.isFinite(count) ? count : 'unknown'} failed units`,
  );
}

async function main() {
  assertLinuxRuntime();

  const results = [];
  checkDisk(results);
  checkNpmCache(results);
  checkPm2(results);
  await checkHttp(results, 'api-health', 'http://127.0.0.1:5000/api/v1/health', 'bcost-api');
  await checkHttp(results, 'web-health', 'http://127.0.0.1:3000/web-health', 'bcost-web');
  checkCertbot(results);
  checkFailedUnits(results);

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`EC2 operational check reprovado: ${failed.length} falha(s).`);
    process.exitCode = 1;
    return;
  }

  console.log('EC2 operational check aprovado: runtime, disco, PM2, health e Certbot OK.');
}

void main();
