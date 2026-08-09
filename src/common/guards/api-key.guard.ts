import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guard de autenticação por API Key para integrações machine-to-machine.
 *
 * SEGURANÇA:
 * - Exige FISCAL_API_KEY configurado (sem fallback hardcoded).
 * - Comparação em tempo constante (evita timing attack).
 * - NÃO aceita mais "qualquer Bearer token" como bypass — isso permitia
 *   autenticação com qualquer string arbitrária sem validar assinatura.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];
    const validApiKey = this.configService.get<string>('FISCAL_API_KEY');

    if (!validApiKey) {
      // Falha segura: sem chave configurada no ambiente, ninguém passa.
      throw new UnauthorizedException(
        'FISCAL_API_KEY não configurada no servidor.',
      );
    }

    if (typeof apiKeyHeader === 'string' && this.safeCompare(apiKeyHeader, validApiKey)) {
      return true;
    }

    throw new UnauthorizedException(
      'Acesso negado: header x-api-key inválido ou ausente.',
    );
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
