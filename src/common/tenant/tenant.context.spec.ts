'use strict';

import { TenantContext } from './tenant.context.js';

describe('TenantContext (AsyncLocalStorage Isolation)', () => {
  afterEach(() => {
    // Garante limpeza entre cenários
  });

  describe('Garantia de Isolamento Assíncrono', () => {
    it('deve armazenar e recuperar o tenantId dentro do bloco run()', async () => {
      const tenantId = 'tenant-uuid-1';

      await TenantContext.run({ tenantId, userId: 'user-1' }, async () => {
        expect(TenantContext.getTenantId()).toBe(tenantId);
        expect(TenantContext.getUserId()).toBe('user-1');
        expect(TenantContext.hasContext()).toBe(true);
      });

      // Fora da cadeia o contexto deve ser undefined
      expect(TenantContext.getTenantId()).toBeUndefined();
      expect(TenantContext.hasContext()).toBe(false);
    });

    it('deve manter isolamento absoluto entre requisições concorrentes (Thread Safety)', async () => {
      const requestA = async () => {
        return TenantContext.run(
          { tenantId: 'tenant-A', requestId: 'req-A' },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              tenantId: TenantContext.getTenantId(),
              requestId: TenantContext.getRequestId(),
            };
          },
        );
      };

      const requestB = async () => {
        return TenantContext.run(
          { tenantId: 'tenant-B', requestId: 'req-B' },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return {
              tenantId: TenantContext.getTenantId(),
              requestId: TenantContext.getRequestId(),
            };
          },
        );
      };

      // Executa em paralelo no mesmo loop de eventos
      const [resA, resB] = await Promise.all([requestA(), requestB()]);

      expect(resA).toEqual({ tenantId: 'tenant-A', requestId: 'req-A' });
      expect(resB).toEqual({ tenantId: 'tenant-B', requestId: 'req-B' });
    });
  });

  describe('Modificação e Asserções Estritas (patch & require)', () => {
    it('deve atualizar parcialmente a store existente via patch()', async () => {
      await TenantContext.run({ tenantId: 'tenant-init' }, async () => {
        expect(TenantContext.getUserId()).toBeUndefined();

        TenantContext.patch({ userId: 'user-updated', roles: ['ADMIN'] });

        expect(TenantContext.getTenantId()).toBe('tenant-init');
        expect(TenantContext.getUserId()).toBe('user-updated');
        expect(TenantContext.getRoles()).toEqual(['ADMIN']);
      });
    });

    it('deve lançar erro em requireTenantId() quando executado fora de um contexto com tenant', () => {
      expect(() => TenantContext.requireTenantId()).toThrow(
        '[TenantContext] tenantId não definido para esta requisição.',
      );
    });

    it('deve retornar o tenantId em requireTenantId() quando o contexto estiver devidamente populado', async () => {
      await TenantContext.run({ tenantId: 'tenant-valido' }, async () => {
        expect(TenantContext.requireTenantId()).toBe('tenant-valido');
      });
    });

    it('deve lançar erro em requireUserId() quando o userId não for informado', async () => {
      await TenantContext.run({ tenantId: 'tenant-1' }, async () => {
        expect(() => TenantContext.requireUserId()).toThrow(
          '[TenantContext] userId não localizado no contexto.',
        );
      });
    });
  });
});
