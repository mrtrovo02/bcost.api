import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckFeatureQueryDto } from './check-feature-query.dto.js';

describe('CheckFeatureQueryDto', () => {
  it('aceita chaves de feature catalogadas em formato de namespace', async () => {
    const dto = plainToInstance(CheckFeatureQueryDto, {
      feature: 'banking.reconciliation',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('bloqueia feature vazia', async () => {
    const dto = plainToInstance(CheckFeatureQueryDto, {
      feature: '',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('bloqueia feature com caracteres fora do contrato público', async () => {
    const dto = plainToInstance(CheckFeatureQueryDto, {
      feature: '../admin',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
