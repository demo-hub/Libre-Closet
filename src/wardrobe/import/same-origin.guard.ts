import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * Rejects cross-site requests to the import routes. Those routes make the
 * server fetch a URL on the caller's behalf, and with AUTH_ENABLED=false there
 * is no session to bind them to, so this is the only thing stopping another
 * site from driving the fetcher through a visitor's browser.
 *
 * `none` is allowed because an OS share-sheet POST arrives with it.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const site = req.headers['sec-fetch-site'];
    if (site === 'same-origin' || site === 'same-site' || site === 'none') {
      return true;
    }

    const origin = req.headers.origin;
    if (site === undefined && origin === undefined) {
      // Neither header: not a browser fetch (curl, a native client).
      return true;
    }
    if (typeof origin === 'string' && req.headers.host) {
      try {
        if (new URL(origin).host === req.headers.host) return true;
      } catch {
        /* malformed Origin falls through to the rejection below */
      }
    }
    throw new ForbiddenException('cross-site request');
  }
}
