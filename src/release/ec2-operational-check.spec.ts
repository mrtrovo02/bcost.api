import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptSource = readFileSync(
  resolve(process.cwd(), 'scripts', 'ec2-operational-check.cjs'),
  'utf8',
);
const packageJsonSource = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

describe('EC2 operational check contract', () => {
  it('keeps a single command for post-deploy infrastructure health', () => {
    expect(packageJsonSource).toContain('"ops:ec2-check": "node scripts/ec2-operational-check.cjs"');
  });

  it('checks disk, npm cache, PM2, health endpoints, Certbot and failed systemd units', () => {
    expect(scriptSource).toContain('disk-root');
    expect(scriptSource).toContain('npm-cache');
    expect(scriptSource).toContain('bcost-api:online');
    expect(scriptSource).toContain('http://127.0.0.1:5000/api/v1/health');
    expect(scriptSource).toContain('http://127.0.0.1:3000/web-health');
    expect(scriptSource).toContain('/opt/certbot/bin/certbot renew');
    expect(scriptSource).toContain('systemd-failed-units');
  });
});
