'use strict';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 2_000;

const checks = [
  {
    name: 'api-public-health',
    url: process.env.BCOST_SMOKE_API_HEALTH_URL || 'https://api.bcost.com.br/api/v1/health',
    expectJsonStatus: 'UP',
    expectTraceId: true,
    expectBuildVersion: process.env.BUILD_VERSION || '',
  },
  {
    name: 'api-cors-preflight',
    url: process.env.BCOST_SMOKE_API_HEALTH_URL || 'https://api.bcost.com.br/api/v1/health',
    method: 'OPTIONS',
    expectStatus: 204,
    expectCorsOrigin: 'https://app.bcost.com.br',
    forbidCorsHeader: 'x-demo-session',
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
      method: check.method || 'GET',
      redirect: 'follow',
      signal: timer.signal,
      headers: {
        'user-agent': 'bcost-smoke/1.0',
        ...(check.method === 'OPTIONS'
          ? {
              origin: 'https://app.bcost.com.br',
              'access-control-request-method': 'GET',
              'access-control-request-headers': 'authorization,x-company-id',
            }
          : {}),
      },
    });

    const durationMs = Date.now() - startedAt;
    const body = await readResponseBody(response);

    const expectedStatus = check.expectStatus;
    if (expectedStatus && response.status !== expectedStatus) {
      return {
        name: check.name,
        ok: false,
        status: response.status,
        durationMs,
        reason: `HTTP esperado ${expectedStatus}`,
      };
    }

    if (!expectedStatus && !response.ok) {
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

    if (check.expectBuildVersion) {
      const buildVersion = body && typeof body === 'object' ? body.buildVersion : undefined;

      if (buildVersion !== check.expectBuildVersion) {
        return {
          name: check.name,
          ok: false,
          status: response.status,
          durationMs,
          reason: `buildVersion esperado ${check.expectBuildVersion}, recebido ${String(buildVersion)}`,
        };
      }
    }

    if (check.expectTraceId) {
      const traceId = response.headers.get('x-bcost-trace-id') || '';

      if (!traceId) {
        return {
          name: check.name,
          ok: false,
          status: response.status,
          durationMs,
          reason: 'x-bcost-trace-id ausente',
        };
      }
    }

    if (check.expectCorsOrigin) {
      const allowOrigin = response.headers.get('access-control-allow-origin') || '';
      if (allowOrigin !== check.expectCorsOrigin) {
        return {
          name: check.name,
          ok: false,
          status: response.status,
          durationMs,
          reason: `Access-Control-Allow-Origin esperado ${check.expectCorsOrigin}, recebido ${allowOrigin || 'ausente'}`,
        };
      }
    }

    if (check.forbidCorsHeader) {
      const allowHeaders = (response.headers.get('access-control-allow-headers') || '').toLowerCase();
      if (allowHeaders.includes(check.forbidCorsHeader.toLowerCase())) {
        return {
          name: check.name,
          ok: false,
          status: response.status,
          durationMs,
          reason: `Access-Control-Allow-Headers contem header proibido ${check.forbidCorsHeader}`,
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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runCheckWithRetry(check) {
  const retries = Number(process.env.BCOST_SMOKE_RETRIES || DEFAULT_RETRIES);
  const retryDelayMs = Number(process.env.BCOST_SMOKE_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS);
  let lastResult = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = await runCheck(check);

    if (result.ok) {
      return {
        ...result,
        attempt,
      };
    }

    lastResult = {
      ...result,
      attempt,
    };

    if (attempt < retries) {
      console.warn(
        `WARN ${check.name} tentativa ${attempt}/${retries} falhou: ${result.reason}. Nova tentativa em ${retryDelayMs}ms.`,
      );
      await wait(retryDelayMs);
    }
  }

  return lastResult;
}

async function main() {
  const results = [];

  for (const check of checks) {
    results.push(await runCheckWithRetry(check));
  }

  for (const result of results) {
    const marker = result.ok ? 'OK' : 'FAIL';
    const suffix = result.reason ? ` - ${result.reason}` : '';
    console.log(
      `${marker} ${result.name} ${result.status ?? 'NO_STATUS'} ${result.durationMs}ms attempt=${result.attempt}${suffix}`,
    );
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
