import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];

    const validApiKey = this.configService.get<string>('FISCAL_API_KEY') || 'bcost-fiscal-secret-2026';

    if (apiKeyHeader && apiKeyHeader === validApiKey) {
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return true;
    }

    throw new UnauthorizedException('Acesso negado: Requer header x-api-key válido ou autenticação JWT.');
  }
}
