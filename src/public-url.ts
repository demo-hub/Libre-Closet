import { FastifyRequest } from 'fastify';

/**
 * The address the request came in on, port included. Fastify reads
 * `X-Forwarded-Proto` and `X-Forwarded-Host` only from a trusted proxy
 * (`trustProxy` in main.ts), so a client cannot name another host here.
 */
export function requestOrigin(req: FastifyRequest): string {
  return `${req.protocol}://${req.host}`;
}

/**
 * Where links to this instance point: `SITE_URL` when set, otherwise the
 * address the request came in on. `||`, not `??`: an empty `SITE_URL=` is
 * unset too.
 */
export function publicBaseUrl(
  siteUrl: string | undefined,
  req: FastifyRequest,
): string {
  return siteUrl?.trim().replace(/\/+$/, '') || requestOrigin(req);
}
