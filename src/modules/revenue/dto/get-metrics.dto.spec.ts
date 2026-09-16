import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetMetricsDto } from './get-metrics.dto.js';

describe('GetMetricsDto', () => {
  it('accepts a valid monthly revenue metrics period from query strings', async () => {
    const dto = plainToInstance(GetMetricsDto, {
      month: '8',
      year: '2026',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.month).toBe(8);
    expect(dto.year).toBe(2026);
  });

  it('rejects invalid month and unrealistic year boundaries', async () => {
    const dto = plainToInstance(GetMetricsDto, {
      month: '13',
      year: '2200',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['month', 'year']),
    );
  });
});
