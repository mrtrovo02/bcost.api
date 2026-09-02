'use strict';

const jwtSecret = process.env.JWT_SECRET?.trim();

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    '[bCost-Security] JWT_SECRET ausente ou inválida em ambiente de execução. Configure um valor com pelo menos 32 caracteres.',
  );
}

export const jwtConstants = {
  secret: jwtSecret,
} as const;
