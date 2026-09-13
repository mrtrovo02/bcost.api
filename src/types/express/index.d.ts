import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      companyId: string;
      email?: string; // opcional, caso queira adicionar
    };
  }
}
