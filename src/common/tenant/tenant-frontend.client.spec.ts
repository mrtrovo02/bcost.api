export interface ApiClientConfig {
  headers: Record<string, string>;
}

export class FrontendApiClient {
  private activeTenantId?: string;
  private authToken?: string;

  public setTenantId(tenantId: string | undefined): void {
    this.activeTenantId = tenantId;
  }

  public setAuthToken(token: string): void {
    this.authToken = token;
  }

  public interceptRequest(config: ApiClientConfig): ApiClientConfig {
    if (this.authToken) {
      config.headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    if (this.activeTenantId) {
      config.headers['X-Tenant-ID'] = this.activeTenantId;
    } else {
      delete config.headers['X-Tenant-ID'];
    }

    return config;
  }
}

describe('Frontend API Client (Injeção de Tenant no Cabeçalho)', () => {
  let client: FrontendApiClient;

  beforeEach(() => {
    client = new FrontendApiClient();
  });

  it('deve anexar o cabeçalho X-Tenant-ID automaticamente em requisições com tenant ativo', () => {
    client.setTenantId('company-frontend-uuid-999');

    const config = client.interceptRequest({ headers: {} });

    expect(config.headers['X-Tenant-ID']).toBe('company-frontend-uuid-999');
  });

  it('deve remover o cabeçalho X-Tenant-ID quando a troca de escopo de empresa limpar o contexto', () => {
    client.setTenantId('company-1');
    client.setTenantId(undefined);

    const config = client.interceptRequest({
      headers: { 'X-Tenant-ID': 'company-1' },
    });

    expect(config.headers['X-Tenant-ID']).toBeUndefined();
  });

  it('deve transmitir simultaneamente o Bearer Token e o X-Tenant-ID', () => {
    client.setAuthToken('jwt-bearer-token-example');
    client.setTenantId('company-2');

    const config = client.interceptRequest({ headers: {} });

    expect(config.headers['Authorization']).toBe(
      'Bearer jwt-bearer-token-example',
    );
    expect(config.headers['X-Tenant-ID']).toBe('company-2');
  });
});
