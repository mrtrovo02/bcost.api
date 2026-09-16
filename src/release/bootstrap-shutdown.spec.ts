import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mainSource = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

describe('bootstrap shutdown contract', () => {
  it('keeps Nest shutdown hooks enabled before registering custom graceful shutdown', () => {
    const enableHooksIndex = mainSource.indexOf('app.enableShutdownHooks()');
    const gracefulShutdownIndex = mainSource.indexOf('setupGracefulShutdown(app, prismaService, logger)');

    expect(enableHooksIndex).toBeGreaterThan(-1);
    expect(gracefulShutdownIndex).toBeGreaterThan(-1);
    expect(enableHooksIndex).toBeLessThan(gracefulShutdownIndex);
  });

  it('keeps bounded forced exit timeout to avoid zombie PM2 deploys', () => {
    expect(mainSource).toContain('const forceExitTimeout = setTimeout');
    expect(mainSource).toContain('15000');
  });
});
