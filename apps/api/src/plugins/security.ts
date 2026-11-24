import fp from 'fastify-plugin';
import { config } from '../config.js';

/**
 * Защитные заголовки на каждый ответ (и API, и собранный фронт).
 * CSP: всё только со своего домена. Исключения:
 * - style 'unsafe-inline' — SVG штампов вставляется строкой с атрибутами style;
 * - worker blob: — qr-scanner создаёт воркер из blob-URL;
 * - img data:/blob: — превью логотипа до загрузки.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders = fp(async (app) => {
  app.addHook('onSend', async (_req, reply) => {
    // Только для HTML: на inline-PDF (плакат) строгая CSP ломает просмотрщик Chrome.
    if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) {
      reply.header('Content-Security-Policy', CSP);
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (config.cookieSecure) reply.header('Strict-Transport-Security', 'max-age=31536000');
  });
});
