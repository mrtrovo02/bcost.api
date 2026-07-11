import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

// Schema espelho para validação de payload corporativo do bCost
const TargetPayloadSchema = z.object({
  companyId: z.string().uuid('ID organizacional precisa ser um UUID válido'),
  value: z.number().positive('O valor de custo deve ser positivo'),
  fiscalPeriod: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de competência fiscal esperado: YYYY-MM'),
});

describe('ZodValidationPipe - Unidade e Validação de Contratos', () => {
  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(TargetPayloadSchema);
  });

  it('🧪 [UNIT-001] Deve aprovar sem erros os objetos que seguem estritamente o contrato de dados', () => {
    const validData = {
      companyId: '00000000-0000-0000-0000-000000000000',
      value: 23500.42,
      fiscalPeriod: '2026-06',
    };

    expect(pipe.transform(validData, { type: 'body' })).toEqual(validData);
  });

  it('🧪 [UNIT-002] Deve barrar e estourar exceção estruturada se houver mutação ou quebra de tipo', () => {
    const badData = {
      companyId: 'non-uuid-string',
      value: -50,
      fiscalPeriod: '06/2026',
    };

    expect(() => pipe.transform(badData, { type: 'body' })).toThrow();
  });
});
