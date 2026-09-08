import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dns from 'node:dns';
import * as net from 'node:net';
import { Agent, buildConnector, fetch, type Dispatcher } from 'undici';
import {
  BlockedAddressError,
  isBlockedAddress,
  parseSafeUrl,
} from './url-policy';

export const MAX_REDIRECTS = 5;
export const MAX_HTML_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// Several retailers hold a connection open for a bot user agent rather than
// refusing it, so the per-socket budget is well under the whole-request one.
const SOCKET_TIMEOUT_MS = 8_000;

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export class FetchTooLargeError extends Error {
  constructor(limit: number) {
    super(`response exceeded ${limit} bytes`);
    this.name = 'FetchTooLargeError';
  }
}

export interface FetchedBody {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

@Injectable()
export class SafeFetchService {
  private readonly logger = new Logger(SafeFetchService.name);
  private readonly allowPrivate: boolean;
  private readonly timeoutMs: number;
  private readonly agent: Dispatcher;

  constructor(private readonly configService: ConfigService) {
    this.allowPrivate = this.configService.get<boolean>(
      'IMPORT_ALLOW_PRIVATE_NETWORKS',
      false,
    );
    this.timeoutMs = this.configService.get<number>(
      'IMPORT_FETCH_TIMEOUT_MS',
      10_000,
    );
    this.agent = this.buildAgent();
  }

  /** Fetches a product page as text, following redirects the policy still allows. */
  async fetchHtml(input: string): Promise<FetchedBody> {
    return this.fetchWithPolicy(input, {
      cap: MAX_HTML_BYTES,
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });
  }

  /** Fetches an image. `referer` is the page it was found on; shops check it. */
  async fetchImage(input: string, referer?: string): Promise<FetchedBody> {
    return this.fetchWithPolicy(input, {
      cap: MAX_IMAGE_BYTES,
      headers: {
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        ...(referer ? { Referer: referer } : {}),
      },
    });
  }

  private async fetchWithPolicy(
    input: string,
    options: { cap: number; headers: Record<string, string> },
  ): Promise<FetchedBody> {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(this.timeoutMs),
    ]);

    let url = parseSafeUrl(input, this.allowPrivate);
    for (let hop = 0; ; hop++) {
      const response = await fetch(url, {
        dispatcher: this.agent,
        // Never 'follow': each hop must be re-checked against the policy.
        redirect: 'manual',
        signal,
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'en;q=0.9,*;q=0.5',
          ...options.headers,
        },
      });

      if (!isRedirect(response.status)) {
        return {
          url: url.href,
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          body: await this.readCapped(response, options.cap, controller),
        };
      }

      await response.body?.cancel();
      if (hop >= MAX_REDIRECTS) {
        throw new BlockedAddressError('too many redirects');
      }
      const location = response.headers.get('location');
      if (!location) throw new BlockedAddressError('redirect without location');
      url = parseSafeUrl(new URL(location, url).href, this.allowPrivate);
    }
  }

  /**
   * Counts decompressed bytes: fetch inflates gzip and brotli, so a small
   * compressed body can still expand past the cap, and content-length lies.
   */
  private async readCapped(
    response: Response,
    cap: number,
    controller: AbortController,
  ): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > cap) {
      await response.body?.cancel();
      throw new FetchTooLargeError(cap);
    }
    if (!response.body) return Buffer.alloc(0);

    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > cap) {
          controller.abort(new FetchTooLargeError(cap));
          throw new FetchTooLargeError(cap);
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch (err) {
      if (err instanceof FetchTooLargeError) throw err;
      const cause = (err as { cause?: unknown })?.cause;
      if (cause instanceof FetchTooLargeError) throw cause;
      throw err;
    }
    return Buffer.concat(chunks);
  }

  /**
   * Validates the peer at connect time rather than before the request: the very
   * addresses checked here are the ones dialled, so a name that resolves again
   * to something internal (DNS rebinding) has no window. Node skips `lookup`
   * for literal hosts, hence the wrapper checking those separately.
   */
  private buildAgent(): Dispatcher {
    const allowPrivate = this.allowPrivate;

    const guardedLookup: net.LookupFunction = (host, opts, cb) => {
      dns.lookup(host, { ...opts, all: true }, (err, addresses) => {
        if (err) return cb(err, '', 0);
        const list = Array.isArray(addresses) ? addresses : [addresses];
        const blocked = list.find((a) =>
          isBlockedAddress(a.address, allowPrivate),
        );
        if (blocked) {
          return cb(
            new BlockedAddressError(`${host} resolves to ${blocked.address}`),
            '',
            0,
          );
        }
        // net sets all:true under autoSelectFamily and then expects the array
        // form of the callback.
        return opts.all
          ? cb(null, list)
          : cb(null, list[0].address, list[0].family);
      });
    };

    const connect = buildConnector({
      lookup: guardedLookup,
      timeout: SOCKET_TIMEOUT_MS,
    });

    const guarded: buildConnector.connector = (options, callback) => {
      const host = options.hostname.replace(/^\[|\]$/g, '');
      if (net.isIP(host) && isBlockedAddress(host, allowPrivate)) {
        return callback(new BlockedAddressError(`address ${host}`), null);
      }
      return connect(options, callback);
    };

    return new Agent({
      connect: guarded,
      headersTimeout: SOCKET_TIMEOUT_MS,
      bodyTimeout: SOCKET_TIMEOUT_MS,
    });
  }
}

const isRedirect = (status: number) =>
  status === 301 ||
  status === 302 ||
  status === 303 ||
  status === 307 ||
  status === 308;
