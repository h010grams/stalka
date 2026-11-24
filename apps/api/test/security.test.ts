import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { createTestApp } from './helpers.js';

describe('security headers', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'];
  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  afterAll(() => app.close());

  it('are set on success and error responses', async () => {
    for (const url of ['/api/health', '/api/nope']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['content-security-policy']).toBeUndefined();
    }
  });

  it('adds CSP to HTML pages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
    const web = await buildApp({ mailer: new MemoryMailer(), rateLimit: false, webDistDir: dir });
    const res = await web.inject({ method: 'GET', url: '/program' });
    await web.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
  });
});
