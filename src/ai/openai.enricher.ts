import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { userPrompt } from './anthropic.enricher';
import {
  EnrichmentContext,
  GarmentEnricher,
  GarmentSuggestion,
  SUGGESTION_SCHEMA,
  SYSTEM_PROMPT,
} from './garment-enricher';
import { normalizeSuggestion } from './normalize-suggestion';

/**
 * Anything that speaks the OpenAI chat API: Ollama, llama.cpp, vLLM, LM Studio,
 * or OpenAI itself. The operator configured this host, so it is trusted and
 * deliberately not subject to the import fetcher's deny list — pointing it at a
 * machine on the LAN is the entire point of running a local model.
 */
const MAX_TOKENS = 2048;
/** A chat completion is a few KB; a misconfigured host can stream forever. */
const MAX_RESPONSE_BYTES = 1_000_000;

interface ChatResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
}

/**
 * `unsupported` means the server rejected the request as written and asking
 * again in an older format is worth a second upload. Everything else — a
 * timeout, a 5xx, a 429, a truncated answer, prose instead of JSON — is
 * `failed`, and retrying it would only upload the photo twice and bill for it.
 */
type Answer =
  | { outcome: 'ok'; value: unknown }
  | { outcome: 'unsupported' }
  | { outcome: 'failed' };

@Injectable()
export class OpenAiEnricher extends GarmentEnricher {
  private readonly logger = new Logger(OpenAiEnricher.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  readonly host: string;

  constructor(configService: ConfigService) {
    super();
    // Ollama is the same OpenAI-compatible protocol at a known address, so
    // naming it as the provider saves configuring the URL at all.
    //
    // `|| fallback`, not get()'s default: Joi gives AI_BASE_URL a default of
    // '', so the key is present-but-empty and get() never reaches its own
    // fallback.
    const fallback =
      configService.get<string>('AI_PROVIDER', '') === 'ollama'
        ? 'http://127.0.0.1:11434/v1'
        : '';
    this.baseUrl = withScheme(
      configService.get<string>('AI_BASE_URL', '') || fallback,
    );
    this.host = hostOf(this.baseUrl);
    this.apiKey = configService.get<string>('AI_API_KEY', '');
    // No default worth guessing: which vision model is installed is the
    // operator's business, and asking a local server for one it never pulled
    // fails in a way that reads like a bug in this app.
    this.model = configService.get<string>('AI_MODEL', '');
    this.timeoutMs = configService.get<number>('AI_TIMEOUT_MS', 30_000);
  }

  /**
   * A host this cannot name is a host the button cannot name either, and the
   * label naming the destination is the whole consent mechanism.
   */
  get available(): boolean {
    return Boolean(this.baseUrl && this.model && this.host);
  }

  async analyzeImage(
    jpeg: Buffer,
    context: EnrichmentContext,
  ): Promise<GarmentSuggestion | undefined> {
    if (!this.available) return undefined;

    // A data: URL, not an http one: Ollama refuses to fetch a URL, and the
    // photo should not need a second round trip to a server anyway.
    const image = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: image } },
          { type: 'text', text: userPrompt(context) },
        ],
      },
    ];

    const strict = await this.ask(messages, {
      type: 'json_schema',
      json_schema: {
        name: 'garment',
        strict: true,
        schema: SUGGESTION_SCHEMA,
      },
    });
    if (strict.outcome === 'ok')
      return normalizeSuggestion(strict.value, context);
    // Only a server that refused the request itself gets a second photo.
    if (strict.outcome === 'failed') return undefined;

    // Older servers know json_object but not json_schema. The schema goes in
    // the prompt instead, and the answer is validated the same way either way.
    const loose = await this.ask(
      [
        ...messages,
        {
          role: 'user',
          content: `Answer with JSON matching this schema exactly: ${JSON.stringify(SUGGESTION_SCHEMA)}`,
        },
      ],
      { type: 'json_object' },
    );
    return loose.outcome === 'ok'
      ? normalizeSuggestion(loose.value, context)
      : undefined;
  }

  private async ask(
    messages: unknown[],
    responseFormat: unknown,
  ): Promise<Answer> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          // Local servers all take max_tokens; OpenAI's own reasoning models
          // want max_completion_tokens instead, which is a trade this
          // local-first path makes deliberately.
          model: this.model,
          max_tokens: MAX_TOKENS,
          messages,
          response_format: responseFormat,
        }),
      });
    } catch (err) {
      this.logger.debug(`enrichment unreachable: ${String(err)}`);
      return { outcome: 'failed' };
    }

    if (!response.ok) {
      // The body can echo an API key back in an error, so only the status is
      // logged.
      this.logger.warn(`enrichment refused: HTTP ${response.status}`);
      // 4xx is the server saying it did not understand the request as written;
      // 429 excepted, which is it asking for fewer requests, not different ones.
      const rejectedTheRequest =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429;
      return { outcome: rejectedTheRequest ? 'unsupported' : 'failed' };
    }

    const text = await readCapped(response, MAX_RESPONSE_BYTES);
    if (text === undefined) return { outcome: 'failed' };
    try {
      const body = (JSON.parse(text) ?? {}) as ChatResponse;
      const choice = body.choices?.[0];
      // A truncated answer is not valid JSON, and asking again with the schema
      // added to the prompt would only truncate sooner.
      if (choice?.finish_reason === 'length') return { outcome: 'failed' };
      const content = choice?.message?.content;
      if (!content) return { outcome: 'failed' };
      return { outcome: 'ok', value: JSON.parse(content) };
    } catch {
      this.logger.debug('enrichment answered something that was not JSON');
      return { outcome: 'failed' };
    }
  }
}

/**
 * A LAN address is the natural thing to type without a scheme, and `new URL`
 * does not throw on one — it reads `192.168.1.5:11434` as a scheme and leaves
 * the host empty, which would render a button naming nothing.
 */
const withScheme = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Scheme first, then trailing slashes: stripping first turns a bare
  // `http://` into `http:`, which would then be read as the *host* `http`.
  const absolute = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  return absolute.replace(/\/+$/, '');
};

/** Never the raw string on failure: it can carry `user:pass@` into the page. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** Reads a response body, giving up rather than buffering an endless one. */
const readCapped = async (
  response: Response,
  max: number,
): Promise<string | undefined> => {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return undefined;
  }
  return Buffer.concat(chunks).toString('utf8');
};
