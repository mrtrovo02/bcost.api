'use strict';

import { Pool } from 'pg';

const databaseUrl = process.env.RLS_INTEGRATION_DATABASE_URL;
const companyA = process.env.RLS_TEST_COMPANY_A;
const companyB = process.env.RLS_TEST_COMPANY_B;
const canRun = Boolean(databaseUrl && companyA && companyB);

(canRun ? describe : describe.skip)('PostgreSQL RLS tenant isolation', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function countVisibleCompanies(companyId: string): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.current_company_id', $1, true)",
        [companyId],
      );
      const result = await client.query(
        'SELECT COUNT(*)::int AS count FROM "companies"',
      );
      await client.query('ROLLBACK');
      return result.rows[0].count;
    } finally {
      client.release();
    }
  }

  it('A enxerga a própria empresa e não enxerga a empresa B', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.current_company_id', $1, true)",
        [companyA],
      );

      const result = await client.query(
        'SELECT id FROM "companies" WHERE id IN ($1, $2)',
        [companyA, companyB],
      );

      expect(result.rows.map((row) => row.id)).toEqual([companyA]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('mantém o isolamento quando o contexto muda entre transações', async () => {
    await expect(countVisibleCompanies(companyA!)).resolves.toBe(1);
    await expect(countVisibleCompanies(companyB!)).resolves.toBe(1);
  });
});
