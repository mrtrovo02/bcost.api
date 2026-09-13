import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator personalizado para extrair o usuário autenticado da requisição.
 *
 * Uso:
 * - @GetUser() user: User -> retorna o objeto completo do usuário.
 * - @GetUser('id') userId: string -> retorna apenas o campo 'id' do usuário.
 */
export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: Record<string, unknown> }>();
    const user = request.user;

    // Se uma propriedade específica for solicitada, retorna apenas ela
    return data ? user?.[data] : user;
  },
);
