'use strict';

const DEFAULT_TIMEOUT_MS = 15_000;

const checks = [
  {
    name: 'api-public-health',
    url: process.env.BCOST_SMOKE_API_HEALTH_URL || 'https://api.bcost.com.br/api/v1/health',
    expectJsonStatus: 'UP',
  },
  {
    name: 'web-public-health',
    url: process.env.BCOST_SMOKE_WEB_HEALTH_URL || 'https://app.bcost.com.br/api/health',
    expectJsonStatus: 'UP',
  },
  {
    name: 'web-login-page',
    url: process.env.BCOST_SMOKE_WEB_LOGIN_URL || 'https://app.bcost.com.br/login',
  },
];

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function readResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function runCheck(check) {
  const timeoutMs = Number(process.env.BCOST_SMOKE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timer = timeoutSignal(timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(check.url, {
      method: 'GET',
      redirect: 'follow',
      signal: timer.signal,
      headers: {
        'user-agent': 'bcost-smoke/1.0',
      },
    });

    const durationMs = Date.now() - startedAt;
    const body = await readResponseBody(response);

    if (!response.ok) {
      return {
        name: check.name,
        ok: false,
        status: response.status,
        durationMs,
        reason: `HTTP ${response.status}`,
      };
    }

    if (check.expectJsonStatus) {
      const status = body && typeof body === 'object' ? body.status : undefined;

      if (status !== check.expectJsonStatus) {
        return {
          name: check.name,
          ok: false,
          status: response.status,
          durationMs,
          reason: `status esperado ${check.expectJsonStatus}, recebido ${String(status)}`,
        };
      }
    }

    return {
      name: check.name,
      ok: true,
      status: response.status,
      durationMs,
    };
  } catch (error) {
    return {
      name: check.name,
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    timer.clear();
  }
}

async function main() {
  const results = [];

  for (const check of checks) {
    results.push(await runCheck(check));
  }

  for (const result of results) {
    const marker = result.ok ? 'OK' : 'FAIL';
    const suffix = result.reason ? ` - ${result.reason}` : '';
    console.log(`${marker} ${result.name} ${result.status ?? 'NO_STATUS'} ${result.durationMs}ms${suffix}`);
  }

  const failed = results.filter((result) => !result.ok);

  if (failed.length > 0) {
    console.error(`Smoke test reprovado: ${failed.length} falha(s).`);
    process.exitCode = 1;
    return;
  }

  console.log('Smoke test aprovado: API e frontend publicos responderam corretamente.');
}

void main();
