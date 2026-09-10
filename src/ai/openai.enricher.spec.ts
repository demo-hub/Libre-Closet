import { ConfigService } from '@nestjs/config';
import * as http from 'node:http';
import type { EnrichmentContext } from './garment-enricher';
import { OpenAiEnricher } from './openai.enricher';

/**
 * Driven against a real HTTP server rather than a mocked fetch: this is the
 * provider a self-hosted instance actually uses, pointed at Ollama or
 * llama.cpp on the same network, and the things that go wrong there are
 * HTTP-shaped — a server that rejects json_schema, one that answers prose, one
 * that hangs. A fetch stub cannot fail in those ways.
 */
interface Stub {
  url: string;
  requests: { body: any; headers: http.IncomingHttpHeaders; url: string }[];
  close: () => Promise<void>;
}

const startStub = async (
  reply: (
    body: any,
    attempt: number,
  ) => { status?: number; json?: unknown; text?: string; hang?: boolean },
): Promise<Stub> => {
  const requests: Stub['requests'] = [];
  let attempt = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ body, headers: req.headers, url: req.url ?? '' });
      const answer = reply(body, attempt++);
      if (answer.hang) return; // never responds
      res.writeHead(answer.status ?? 200, {
        'content-type': answer.text ? 'text/html' : 'application/json',
      });
      res.end(answer.text ?? JSON.stringify(answer.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

/**
 * Behaves the way the real ConfigService does under this app's Joi schema:
 * every AI_* key is validated with a default of '', so it is always PRESENT,
 * and get()'s own fallback is never reached. A fake that answers "absent"
 * hides exactly the bug that shape causes.
 */
const config = (values: Record<string, unknown>) => {
  const validated: Record<string, unknown> = {
    AI_PROVIDER: 'none',
    AI_API_KEY: '',
    AI_MODEL: '',
    AI_BASE_URL: '',
    ...values,
  };
  return {
    get: <T>(key: string, fallback: T) =>
      key in validated ? (validated[key] as T) : fallback,
  } as unknown as ConfigService;
};

const context: EnrichmentContext = {
  knownCategories: ['Coats'],
  knownColors: [],
  language: 'en',
};

const GARMENT = {
  name: 'Wool Coat',
  category: 'outerwear',
  category_suggestion: '',
  colors: ['beige'],
  pattern: '',
  material: 'wool',
  brand: '',
  notes: '',
  confidence: { category: 0.8, colors: 0.7, brand: 0 },
};

const chatReply = (content: unknown, finish = 'stop') => ({
  choices: [
    { message: { content: JSON.stringify(content) }, finish_reason: finish },
  ],
});

describe('OpenAiEnricher', () => {
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  let stub: Stub | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  const enricher = (over: Record<string, unknown> = {}) =>
    new OpenAiEnricher(
      config({ AI_BASE_URL: stub!.url, AI_MODEL: 'llava', ...over }),
    );

  it('is unavailable, and silent, with no base url', async () => {
    const bare = new OpenAiEnricher(config({}));
    expect(bare.available).toBe(false);
    expect(await bare.analyzeImage(photo, context)).toBeUndefined();
  });

  it('names the host for the button, not the whole url', async () => {
    stub = await startStub(() => ({ json: chatReply(GARMENT) }));
    expect(enricher().host).toBe(new URL(stub.url).host);
    expect(enricher().available).toBe(true);
  });

  it('reads a garment from a server that speaks json_schema', async () => {
    stub = await startStub(() => ({ json: chatReply(GARMENT) }));
    const result = await enricher().analyzeImage(photo, context);

    expect(result).toMatchObject({ name: 'Wool Coat', colors: ['beige'] });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].body.response_format.type).toBe('json_schema');
  });

  it('sends the photo inline, which is the only way Ollama takes one', async () => {
    stub = await startStub(() => ({ json: chatReply(GARMENT) }));
    await enricher().analyzeImage(photo, context);

    const content = stub.requests[0].body.messages[1].content as any[];
    expect(content[0].type).toBe('image_url');
    // A data: URL, not an http one: Ollama will not go and fetch a URL.
    expect(content[0].image_url.url).toBe(
      `data:image/jpeg;base64,${photo.toString('base64')}`,
    );
  });

  it('sends no authorization when there is no key, as a local model wants', async () => {
    stub = await startStub(() => ({ json: chatReply(GARMENT) }));
    await enricher().analyzeImage(photo, context);
    expect(stub.requests[0].headers.authorization).toBeUndefined();
  });

  it('sends a bearer token when one is configured', async () => {
    stub = await startStub(() => ({ json: chatReply(GARMENT) }));
    await enricher({ AI_API_KEY: 'sk-local' }).analyzeImage(photo, context);
    expect(stub.requests[0].headers.authorization).toBe('Bearer sk-local');
  });

  describe('a server that does not know json_schema', () => {
    it('asks again the older way, with the schema in the prompt', async () => {
      stub = await startStub((_body, attempt) =>
        attempt === 0
          ? { status: 400, json: { error: 'response_format.type unsupported' } }
          : { json: chatReply(GARMENT) },
      );

      const result = await enricher().analyzeImage(photo, context);
      expect(result).toMatchObject({ name: 'Wool Coat' });
      expect(stub.requests).toHaveLength(2);
      expect(stub.requests[1].body.response_format.type).toBe('json_object');
      // The schema has to travel in the prompt when the server cannot enforce it.
      const retried = stub.requests[1].body.messages;
      expect(JSON.stringify(retried)).toContain('category_suggestion');
    });

    it('gives up after the second try rather than asking forever', async () => {
      stub = await startStub(() => ({ status: 400, json: { error: 'no' } }));
      expect(await enricher().analyzeImage(photo, context)).toBeUndefined();
      expect(stub.requests).toHaveLength(2);
    });
  });

  describe('what is not worth a second upload of the photo', () => {
    // The retry exists for one case: a server that will not take this response
    // format. Re-sending a whole base64 JPEG on any other failure uploads it
    // twice, bills for it twice, and doubles the user's wait.
    it.each([
      ['a 500', { status: 500, json: { error: 'boom' } }],
      ['a 502 HTML page', { text: '<html>502 Bad Gateway</html>' }],
      ['a 429', { status: 429, json: { error: 'slow down' } }],
    ])('does not ask again after %s', async (_label, answer) => {
      stub = await startStub(() => answer);
      expect(await enricher().analyzeImage(photo, context)).toBeUndefined();
      expect(stub.requests).toHaveLength(1);
    });

    it('does not ask again after a truncated answer', async () => {
      // Retrying adds the whole schema to the prompt against the same cap, so
      // the second answer would truncate sooner than the first.
      stub = await startStub(() => ({ json: chatReply(GARMENT, 'length') }));
      expect(await enricher().analyzeImage(photo, context)).toBeUndefined();
      expect(stub.requests).toHaveLength(1);
    });

    it('does not ask again after prose instead of JSON', async () => {
      stub = await startStub(() => ({
        json: { choices: [{ message: { content: 'Sure! A coat.' } }] },
      }));
      expect(await enricher().analyzeImage(photo, context)).toBeUndefined();
      expect(stub.requests).toHaveLength(1);
    });

    it('does not ask again after a timeout, doubling the wait', async () => {
      stub = await startStub(() => ({ hang: true }));
      const started = Date.now();
      const slow = enricher({ AI_TIMEOUT_MS: 700 });
      expect(await slow.analyzeImage(photo, context)).toBeUndefined();
      // One budget, not two: the operator configured the deadline they meant.
      expect(Date.now() - started).toBeLessThan(1400);
      expect(stub.requests).toHaveLength(1);
    });
  });

  describe('answers a local model really gives', () => {
    it('says nothing when it answered prose instead of JSON', async () => {
      stub = await startStub(() => ({
        json: {
          choices: [{ message: { content: 'Sure! It looks like a coat.' } }],
        },
      }));
      expect(await enricher().analyzeImage(photo, context)).toBeUndefined();
    });

    it('says nothing when the answer was cut off', async () => {
      stub = await startStub(() => ({
        json: chatReply(GARMENT, 'length'),
      }));
      expect(await enricher().analyzeImage(photo, context)).toBeUndefined();
    });

    it('says nothing when the server returned an HTML error page', async () => {
      stub = await startStub(() => ({ text: '<html>502 Bad Gateway</html>' }));
      expect(await enricher().analyzeImage(photo, context)).toBeUndefined();
    });

    it('validates the answer even though the schema was meant to', async () => {
      // The whole reason the validator exists: a local model agrees to a
      // schema and then ignores it.
      stub = await startStub(() => ({
        json: chatReply({
          ...GARMENT,
          colors: ['taupe', 'beige'],
          category: 'coat-ish',
          confidence: { category: 5, colors: 'high', brand: 0 },
        }),
      }));

      const result = await enricher().analyzeImage(photo, context);
      expect(result?.colors).toEqual(['beige']);
      expect(result?.category).toBeUndefined();
      expect(result?.confidence).toEqual({
        category: 1,
        colors: 0,
        brand: 0,
      });
    });

    it('gives up on a model that never answers', async () => {
      stub = await startStub(() => ({ hang: true }));
      const slow = enricher({ AI_TIMEOUT_MS: 1000 });
      expect(await slow.analyzeImage(photo, context)).toBeUndefined();
    });

    it('says nothing when nothing is listening', async () => {
      stub = await startStub(() => ({ json: chatReply(GARMENT) }));
      const dead = new OpenAiEnricher(
        config({ AI_BASE_URL: 'http://127.0.0.1:1/v1', AI_MODEL: 'llava' }),
      );
      expect(await dead.analyzeImage(photo, context)).toBeUndefined();
    });
  });

  describe('a base url written the way an operator types one', () => {
    it('assumes http when the scheme was left off', async () => {
      // `new URL('192.168.1.5:11434')` does not throw — it reads the address as
      // a scheme and leaves the host empty, so the button would name nothing.
      stub = await startStub(() => ({ json: chatReply(GARMENT) }));
      const bare = stub.url.replace(/^http:\/\//, '');
      const plain = new OpenAiEnricher(
        config({ AI_BASE_URL: bare, AI_MODEL: 'llava' }),
      );
      expect(plain.host).toBe(new URL(stub.url).host);
      expect(plain.available).toBe(true);
      expect(await plain.analyzeImage(photo, context)).toBeDefined();
    });

    it('is unavailable rather than nameless when the url is unusable', () => {
      // Better no button than one that will not say where the photo goes.
      const broken = new OpenAiEnricher(
        config({ AI_BASE_URL: 'http://', AI_MODEL: 'llava' }),
      );
      expect(broken.host).toBe('');
      expect(broken.available).toBe(false);
    });

    it('is unavailable when no model was named', () => {
      stub = undefined;
      const noModel = new OpenAiEnricher(
        config({ AI_BASE_URL: 'http://127.0.0.1:11434/v1' }),
      );
      expect(noModel.available).toBe(false);
    });
  });

  describe('named as ollama', () => {
    it('knows where Ollama listens without being told', () => {
      const ollama = new OpenAiEnricher(
        config({ AI_PROVIDER: 'ollama', AI_MODEL: 'llava' }),
      );
      // Two settings instead of three, and the button still names the host.
      expect(ollama.available).toBe(true);
      expect(ollama.host).toBe('127.0.0.1:11434');
    });

    it('still takes a base url when Ollama is somewhere else', () => {
      const ollama = new OpenAiEnricher(
        config({
          AI_PROVIDER: 'ollama',
          AI_MODEL: 'llava',
          AI_BASE_URL: 'http://192.168.1.5:11434/v1',
        }),
      );
      expect(ollama.host).toBe('192.168.1.5:11434');
    });
  });

  it('tolerates a base url written with a trailing slash', async () => {
    stub = await startStub(() => ({ json: chatReply(GARMENT) }));
    const result = await new OpenAiEnricher(
      config({ AI_BASE_URL: `${stub.url}/`, AI_MODEL: 'llava' }),
    ).analyzeImage(photo, context);
    expect(result).toBeDefined();
    // Asserting the path is the only way this test can fail: the stub answers
    // every path, so a doubled slash would otherwise go unnoticed.
    expect(stub.requests[0].url).toBe('/v1/chat/completions');
  });
});
