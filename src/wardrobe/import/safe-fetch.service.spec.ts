import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import {
  FetchTooLargeError,
  MAX_HTML_BYTES,
  SafeFetchService,
} from './safe-fetch.service';
import { BlockedAddressError } from './url-policy';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

describe('SafeFetchService', () => {
  let server: http.Server;
  let origin: string;
  let handler: Handler;

  const build = async (config: Record<string, unknown> = {}) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeFetchService,
        {
          provide: ConfigService,
          useValue: {
            get: <T>(key: string, fallback: T) =>
              (key in config ? config[key] : fallback) as T,
          },
        },
      ],
    }).compile();
    return module.get(SafeFetchService);
  };

  // Loopback is reachable only under the development flag, which is exactly
  // what these cases exercise; the strict default is covered separately.
  const local = () =>
    build({
      IMPORT_ALLOW_PRIVATE_NETWORKS: true,
      IMPORT_FETCH_TIMEOUT_MS: 2_000,
    });

  beforeAll(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await promisify(server.listen.bind(server, 0, '127.0.0.1'))();
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await promisify(server.close.bind(server))();
  });

  beforeEach(() => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<title>ok</title>');
    };
  });

  it('returns the body, final URL and content type', async () => {
    const service = await local();

    const result = await service.fetchHtml(`${origin}/p/1`);

    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/html');
    expect(result.body.toString()).toBe('<title>ok</title>');
    expect(result.url).toBe(`${origin}/p/1`);
  });

  it('sends browser-like headers, which shops gate on', async () => {
    const service = await local();
    let seen: http.IncomingHttpHeaders = {};
    handler = (req, res) => {
      seen = req.headers;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('ok');
    };

    await service.fetchHtml(`${origin}/p`);

    expect(seen['user-agent']).toContain('Mozilla/5.0');
    expect(seen['sec-fetch-dest']).toBe('document');
    expect(seen.accept).toContain('text/html');
  });

  it('sends the page as referer when fetching its image', async () => {
    const service = await local();
    let seen: http.IncomingHttpHeaders = {};
    handler = (req, res) => {
      seen = req.headers;
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50]));
    };

    await service.fetchImage(`${origin}/img.png`, `${origin}/p/1`);

    expect(seen.referer).toBe(`${origin}/p/1`);
    expect(seen['sec-fetch-dest']).toBe('image');
  });

  it('follows a redirect and reports where it landed', async () => {
    const service = await local();
    handler = (req, res) => {
      if (req.url === '/from') {
        res.writeHead(302, { location: `${origin}/to` });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('arrived');
    };

    const result = await service.fetchHtml(`${origin}/from`);

    expect(result.body.toString()).toBe('arrived');
    expect(result.url).toBe(`${origin}/to`);
  });

  it('re-checks the policy on every hop, so a redirect cannot smuggle an internal address', async () => {
    // Strict config: the first hop is allowed by the test only because the
    // server is reached through a hostname the policy accepts.
    const service = await local();
    handler = (_req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/' });
      res.end();
    };

    await expect(service.fetchHtml(`${origin}/from`)).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
  });

  it('gives up after too many redirects', async () => {
    const service = await local();
    handler = (_req, res) => {
      res.writeHead(302, { location: `${origin}/loop` });
      res.end();
    };

    await expect(service.fetchHtml(`${origin}/loop`)).rejects.toThrow(
      /too many redirects/,
    );
  });

  it('rejects a redirect with no destination', async () => {
    const service = await local();
    handler = (_req, res) => {
      res.writeHead(302);
      res.end();
    };

    await expect(service.fetchHtml(`${origin}/p`)).rejects.toThrow(
      /redirect without location/,
    );
  });

  it('refuses a body larger than the cap', async () => {
    const service = await local();
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(Buffer.alloc(MAX_HTML_BYTES + 1024, 'x'));
    };

    await expect(service.fetchHtml(`${origin}/big`)).rejects.toBeInstanceOf(
      FetchTooLargeError,
    );
  });

  it('counts decompressed bytes, so a small gzip bomb does not pass', async () => {
    const service = await local();
    const payload = gzipSync(Buffer.alloc(MAX_HTML_BYTES + 1024, 'x'));
    expect(payload.byteLength).toBeLessThan(100_000);
    handler = (_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html',
        'content-encoding': 'gzip',
      });
      res.end(payload);
    };

    await expect(service.fetchHtml(`${origin}/bomb`)).rejects.toBeInstanceOf(
      FetchTooLargeError,
    );
  });

  it('refuses a body whose declared length is already over the cap', async () => {
    const service = await local();
    handler = (_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html',
        'content-length': String(MAX_HTML_BYTES + 1),
      });
      res.end(Buffer.alloc(16, 'x'));
    };

    await expect(
      service.fetchHtml(`${origin}/declared`),
    ).rejects.toBeInstanceOf(FetchTooLargeError);
  });

  it('gives up on a server that holds the connection open', async () => {
    const service = await build({
      IMPORT_ALLOW_PRIVATE_NETWORKS: true,
      IMPORT_FETCH_TIMEOUT_MS: 300,
    });
    handler = () => {
      /* never responds */
    };

    await expect(service.fetchHtml(`${origin}/tarpit`)).rejects.toThrow();
  });

  describe('with the default strict configuration', () => {
    it('refuses to dial loopback at all', async () => {
      const service = await build();

      await expect(service.fetchHtml(`${origin}/p`)).rejects.toBeInstanceOf(
        BlockedAddressError,
      );
    });

    it('refuses a hostname that resolves to an internal address', async () => {
      const service = await build();

      // localhost is caught by name; the resolved-address guard is covered by
      // the address cases in url-policy.spec.ts.
      await expect(
        service.fetchHtml('http://localhost/p'),
      ).rejects.toBeInstanceOf(BlockedAddressError);
    });
  });
});
