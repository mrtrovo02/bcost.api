'use strict';

require('dotenv').config();

const fs = require('node:fs');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LOGIN_RETRIES = 3;
const DEFAULT_LOGIN_RETRY_DELAY_MS = 2_000;
const API_BASE_URL = (process.env.BCOST_SMOKE_API_BASE_URL || 'https://api.bcost.com.br/api/v1').replace(
  /\/$/,
  '',
);

function valueOf(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function readSecretValue(name, fileName) {
  const directValue = valueOf(name);
  if (directValue) return directValue;

  const secretPath = resolveSecretPath(valueOf(fileName));
  if (!secretPath) return '';

  try {
    assertSecretFilePermissions(secretPath, fileName);
    const secretValue = fs.readFileSync(secretPath, 'utf8').trim();
    assertOk(Boolean(secretValue), `${fileName}: arquivo de segredo esta vazio.`);
    return secretValue;
  } catch (error) {
    throw new Error(
      `${fileName}: nao foi possivel ler o arquivo de segredo informado: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function resolveSecretPath(secretPath) {
  if (!secretPath) return '';

  const homeDirectory = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDirectory && secretPath === '$HOME') return homeDirectory;
  if (homeDirectory && secretPath.startsWith('$HOME/')) {
    return `${homeDirectory}/${secretPath.slice('$HOME/'.length)}`;
  }
  if (homeDirectory && secretPath === '~') return homeDirectory;
  if (homeDirectory && secretPath.startsWith('~/')) {
    return `${homeDirectory}/${secretPath.slice('~/'.length)}`;
  }

  return secretPath;
}

function assertSecretFilePermissions(secretPath, fileName) {
  if (process.platform === 'win32') return;

  const stat = fs.statSync(secretPath);
  const groupOrOtherReadable = (stat.mode & 0o044) !== 0;
  const groupOrOtherWritable = (stat.mode & 0o022) !== 0;

  assertOk(
    !groupOrOtherReadable && !groupOrOtherWritable,
    `${fileName}: arquivo de segredo deve usar permissao 600 ou mais restritiva.`,
  );
}

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function readBody(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function request(path, options = {}) {
  const timeoutMs = Number(process.env.BCOST_SMOKE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timer = timeoutSignal(timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      redirect: 'follow',
      signal: timer.signal,
      ...options,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'bcost-auth-smoke/1.0',
        ...(options.headers || {}),
      },
    });

    return {
      ok: response.ok,
      status: response.status,
      body: await readBody(response),
    };
  } finally {
    timer.clear();
  }
}

function numericEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loginWithRetry(email, password) {
  const maxRetries = numericEnv('BCOST_SMOKE_AUTH_LOGIN_RETRIES', DEFAULT_LOGIN_RETRIES);
  const retryDelayMs = numericEnv(
    'BCOST_SMOKE_AUTH_LOGIN_RETRY_DELAY_MS',
    DEFAULT_LOGIN_RETRY_DELAY_MS,
  );

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (login.status !== 429 || attempt > maxRetries) {
      return login;
    }

    console.warn(
      `WARN login autenticado recebeu HTTP 429 na tentativa ${attempt}/${
        maxRetries + 1
      }. Nova tentativa em ${retryDelayMs}ms.`,
    );
    await sleep(retryDelayMs);
  }

  throw new Error('Login autenticado excedeu tentativas de retry.');
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getAccessToken(payload) {
  if (!isRecord(payload)) return null;
  const token = payload.access_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

function getCompanies(payload) {
  if (!isRecord(payload)) return [];

  const directCompanies = Array.isArray(payload.companies) ? payload.companies : [];
  const userCompanies = isRecord(payload.user) && Array.isArray(payload.user.companies) ? payload.user.companies : [];
  const dataCompanies = Array.isArray(payload.data) ? payload.data : [];
  const itemCompanies = Array.isArray(payload.items) ? payload.items : [];
  const recordCompanies = Array.isArray(payload.records) ? payload.records : [];

  for (const candidates of [directCompanies, userCompanies, dataCompanies, itemCompanies, recordCompanies]) {
    if (candidates.length > 0) return candidates;
  }

  return [];
}

function getUser(payload) {
  if (!isRecord(payload)) return null;
  return isRecord(payload.user) ? payload.user : payload;
}

function getString(value, key) {
  if (!isRecord(value)) return '';
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : '';
}

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertExpectedCompany(companies) {
  const expectedCompanyId = valueOf('BCOST_SMOKE_EXPECTED_COMPANY_ID');
  const expectedCompanyName = valueOf('BCOST_SMOKE_EXPECTED_COMPANY_NAME').toLowerCase();

  if (expectedCompanyId) {
    assertOk(
      companies.some((company) => getString(company, 'id') === expectedCompanyId),
      'Empresa esperada por ID nao apareceu na sessao autenticada.',
    );
  }

  if (expectedCompanyName) {
    assertOk(
      companies.some((company) => getString(company, 'name').toLowerCase().includes(expectedCompanyName)),
      'Empresa esperada por nome nao apareceu na sessao autenticada.',
    );
  }
}

function assertNoDemoCompanyLeak(companies) {
  if (valueOf('BCOST_SMOKE_ALLOW_DEMO_COMPANY') === 'true') {
    return;
  }

  const forbiddenId = valueOf('BCOST_SMOKE_FORBIDDEN_COMPANY_ID');
  const forbiddenName =
    valueOf('BCOST_SMOKE_FORBIDDEN_COMPANY_NAME').toLowerCase() || 'demo';

  const leakedCompany = companies.find((company) => {
    const id = getString(company, 'id');
    const name = getString(company, 'name').toLowerCase();

    return Boolean(
      (forbiddenId && id === forbiddenId) ||
        (forbiddenName && name.includes(forbiddenName)),
    );
  });

  assertOk(
    !leakedCompany,
    `Sessao autenticada real contem empresa demonstrativa ou proibida: ${getString(leakedCompany, 'name') || getString(leakedCompany, 'id')}.`,
  );
}

function assertAuthenticatedUser(payload, expectedEmail) {
  const user = getUser(payload);
  assertOk(Boolean(user), 'Resposta autenticada nao retornou objeto de usuario.');

  const email = getString(user, 'email').toLowerCase();
  assertOk(email === expectedEmail.toLowerCase(), 'Resposta autenticada retornou email diferente do usuario testado.');
}

async function logout(accessToken) {
  return request('/auth/logout', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });
}

async function assertLoggedOut(accessToken) {
  const profileAfterLogout = await request('/auth/me', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  assertOk(
    [401, 403].includes(profileAfterLogout.status),
    `Logout nao invalidou a sessao: auth/me apos logout retornou HTTP ${profileAfterLogout.status}.`,
  );
}

async function main() {
  const email = valueOf('BCOST_SMOKE_AUTH_EMAIL');
  const password = readSecretValue('BCOST_SMOKE_AUTH_PASSWORD', 'BCOST_SMOKE_AUTH_PASSWORD_FILE');
  const required = valueOf('BCOST_SMOKE_AUTH_REQUIRED') === 'true';

  if (!email || !password) {
    const message =
      'SKIP authenticated-smoke: defina BCOST_SMOKE_AUTH_EMAIL e BCOST_SMOKE_AUTH_PASSWORD ou BCOST_SMOKE_AUTH_PASSWORD_FILE para validar login real.';

    if (required) {
      throw new Error(message);
    }

    console.warn(message);
    return;
  }

  const login = await loginWithRetry(email, password);

  assertOk(login.ok, `Login autenticado falhou com HTTP ${login.status}.`);
  assertOk(!isRecord(login.body) || login.body.mfaRequired !== true, 'Usuario exige MFA; smoke autenticado sem MFA nao pode prosseguir.');
  assertAuthenticatedUser(login.body, email);

  const accessToken = getAccessToken(login.body);
  assertOk(Boolean(accessToken), 'Login autenticado nao retornou access_token.');

  try {
    const loginCompanies = getCompanies(login.body);
    assertOk(loginCompanies.length > 0, 'Login autenticado nao retornou empresas vinculadas.');
    assertExpectedCompany(loginCompanies);
    assertNoDemoCompanyLeak(loginCompanies);

    const profile = await request('/auth/me', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assertOk(profile.ok, `auth/me falhou com HTTP ${profile.status}.`);
    assertAuthenticatedUser(profile.body, email);

    const profileCompanies = getCompanies(profile.body);
    assertOk(profileCompanies.length > 0, 'auth/me nao retornou empresas vinculadas.');
    assertExpectedCompany(profileCompanies);
    assertNoDemoCompanyLeak(profileCompanies);

    const companies = await request('/company', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assertOk(companies.ok, `/company falhou com HTTP ${companies.status}.`);

    const companyList = Array.isArray(companies.body) ? companies.body : getCompanies(companies.body);
    assertOk(companyList.length > 0, '/company nao retornou empresas vinculadas.');
    assertExpectedCompany(companyList);
    assertNoDemoCompanyLeak(companyList);

    console.log(`Authenticated smoke aprovado: usuario ${email} possui ${companyList.length} empresa(s) vinculada(s).`);
    const logoutResponse = await logout(accessToken);
    assertOk(
      [200, 201, 204].includes(logoutResponse.status),
      `Logout autenticado falhou com HTTP ${logoutResponse.status}.`,
    );
    await assertLoggedOut(accessToken);
  } finally {
    await logout(accessToken).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
