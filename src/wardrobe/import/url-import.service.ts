import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { emptyPrefill, GarmentPrefill } from './garment-prefill';
import { intakeImage, toDataUri, UnsupportedImageError } from './image-intake';
import { buildDraft, ExtractOptions, looksBlocked } from './product-draft';
import { readPageMetadata } from './page-metadata';
import {
  FetchedBody,
  FetchTooLargeError,
  RedirectError,
  SafeFetchService,
} from './safe-fetch.service';
import {
  parseShopifyProduct,
  shopifyProductJsonUrl,
} from './shopify-products-json';
import { BlockedAddressError, parseSafeUrl } from './url-policy';

/** The six ways this can end badly, each one a translated message on the form. */
export type ImportFailure =
  | 'IMPORT_URL_INVALID'
  | 'IMPORT_SITE_BLOCKED'
  | 'IMPORT_PAGE_UNREACHABLE'
  | 'IMPORT_NO_IMAGE_FOUND'
  | 'IMPORT_IMAGE_INVALID'
  | 'IMPORT_DISABLED';

export interface ImportedImage {
  /** Inline, because the CSP forbids the page loading a shop's CDN directly. */
  dataUri: string;
  /** The image is already cut out, so the removal model has nothing to do. */
  hasAlpha: boolean;
  /** The candidate that was asked for, which is what the buttons compare against. */
  url: string;
}

export interface UrlImportResult {
  prefill: GarmentPrefill;
  /** The shop, for "Details imported from nike.com". */
  host?: string;
  image?: ImportedImage;
  /** The other candidates, offered as buttons; nothing is downloaded until tapped. */
  candidates: string[];
  /** Every candidate including the one shown, so a swap can offer this one back. */
  allCandidates: string[];
  failure?: ImportFailure;
}

/** Enough for the preview plus four alternatives. */
const MAX_CANDIDATES = 5;

const HTML_TYPE = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

const looksLikeImageUrl = (url: URL): boolean =>
  /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i.test(url.pathname);

@Injectable()
export class UrlImportService {
  private readonly logger = new Logger(UrlImportService.name);
  private readonly enabled: boolean;
  private readonly allowPrivate: boolean;

  constructor(
    private readonly safeFetch: SafeFetchService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('IMPORT_URL_ENABLED', true);
    this.allowPrivate = configService.get<boolean>(
      'IMPORT_ALLOW_PRIVATE_NETWORKS',
      false,
    );
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reads a pasted product link into a draft garment. Never throws for a bad
   * page: a failure is a state the form renders, with whatever was salvaged.
   */
  async importFromUrl(
    input: string,
    options: ExtractOptions & { language?: string } = {},
  ): Promise<UrlImportResult> {
    if (!this.enabled) {
      return {
        prefill: emptyPrefill(),
        candidates: [],
        allCandidates: [],
        failure: 'IMPORT_DISABLED',
      };
    }

    let url: URL;
    try {
      url = parseSafeUrl(input, this.allowPrivate);
    } catch {
      return {
        prefill: emptyPrefill(),
        candidates: [],
        allCandidates: [],
        failure: 'IMPORT_URL_INVALID',
      };
    }

    const shopify = await this.tryShopify(url, options);
    if (shopify) return this.withImage(shopify, url);

    let page: FetchedBody;
    try {
      // A link that names an image gets the image cap; a product photo is
      // routinely larger than the page budget.
      page = looksLikeImageUrl(url)
        ? await this.safeFetch.fetchImage(url.href)
        : await this.safeFetch.fetchHtml(url.href, options.language);
    } catch (err) {
      return {
        prefill: emptyPrefill(),
        candidates: [],
        allCandidates: [],
        failure: this.classify(err),
      };
    }

    // Status first: a 404 page is often served with an image content type.
    const blocked = statusFailure(page.status);
    if (blocked) {
      return {
        prefill: { ...emptyPrefill(), sourceUrl: page.url },
        candidates: [],
        allCandidates: [],
        host: hostOf(page.url),
        failure: blocked,
      };
    }

    // Anything that is not a page is offered to the image checks, which are
    // the real authority: shops serve photos as image/jpg and octet-stream.
    if (!HTML_TYPE.test(page.contentType)) return this.directImage(page, url);

    const html = decodeBody(page.body, page.contentType);
    // Read once: a wall whose title sits past the head is still a wall.
    const meta = readPageMetadata(html);
    if (looksBlocked(meta)) {
      return {
        prefill: { ...emptyPrefill(), sourceUrl: page.url },
        candidates: [],
        allCandidates: [],
        host: hostOf(page.url),
        failure: 'IMPORT_SITE_BLOCKED',
      };
    }

    return this.withImage(buildDraft(meta, page.url, options), url);
  }

  /**
   * Downloads one candidate the user picked from the alternatives. Only the
   * image changes; the fields they may already have edited are not touched.
   */
  async importImage(
    input: string,
    referer?: string,
  ): Promise<{ image?: ImportedImage; failure?: ImportFailure }> {
    if (!this.enabled) return { failure: 'IMPORT_DISABLED' };
    try {
      parseSafeUrl(input, this.allowPrivate);
    } catch {
      return { failure: 'IMPORT_URL_INVALID' };
    }
    const image = await this.downloadImage(input, referer);
    return image ? { image } : { failure: 'IMPORT_IMAGE_INVALID' };
  }

  /**
   * Shopify publishes every product as JSON beside its page, which names the
   * colour and size axes outright. A miss is silent: the page is still there.
   */
  private async tryShopify(
    url: URL,
    options: ExtractOptions,
  ): Promise<GarmentPrefill | undefined> {
    const jsonUrl = shopifyProductJsonUrl(url.href);
    if (!jsonUrl) return undefined;
    try {
      const response = await this.safeFetch.fetchHtml(jsonUrl);
      if (response.status !== 200) return undefined;
      const body: unknown = JSON.parse(response.body.toString('utf8'));
      return parseShopifyProduct(body, url.href, options);
    } catch {
      return undefined;
    }
  }

  /** The pasted link was the photo itself. */
  private async directImage(
    page: FetchedBody,
    url: URL,
  ): Promise<UrlImportResult> {
    const prefill = emptyPrefill();
    prefill.sourceUrl = page.url;
    const name = humanise(url.pathname);
    if (name) {
      prefill.name = name;
      prefill.sources.name = 'url';
    }
    try {
      const image = await intakeImage(page.body);
      return {
        prefill,
        candidates: [],
        allCandidates: [],
        host: hostOf(page.url),
        image: {
          dataUri: toDataUri(image),
          hasAlpha: image.hasAlpha,
          url: page.url,
        },
      };
    } catch {
      return {
        prefill,
        candidates: [],
        allCandidates: [],
        host: hostOf(page.url),
        failure: 'IMPORT_IMAGE_INVALID',
      };
    }
  }

  /** Takes the first candidate that downloads and survives the image checks. */
  private async withImage(
    prefill: GarmentPrefill,
    url: URL,
  ): Promise<UrlImportResult> {
    const candidates = prefill.imageCandidates.slice(0, MAX_CANDIDATES);
    const host = hostOf(prefill.sourceUrl ?? url.href);
    for (const [index, candidate] of candidates.entries()) {
      const image = await this.downloadImage(candidate, url.href);
      if (image) {
        return {
          prefill,
          host,
          image,
          candidates: candidates.filter((_, i) => i !== index),
          allCandidates: candidates,
        };
      }
    }
    return {
      prefill,
      host,
      candidates: [],
      allCandidates: candidates,
      failure: candidates.length
        ? 'IMPORT_IMAGE_INVALID'
        : 'IMPORT_NO_IMAGE_FOUND',
    };
  }

  private async downloadImage(
    candidate: string,
    referer?: string,
  ): Promise<ImportedImage | undefined> {
    try {
      const response = await this.safeFetch.fetchImage(candidate, referer);
      if (response.status !== 200) return undefined;
      const image = await intakeImage(response.body);
      return {
        dataUri: toDataUri(image),
        hasAlpha: image.hasAlpha,
        // The candidate as offered, not the URL it redirected to: that is what
        // the alternative buttons compare against.
        url: candidate,
      };
    } catch (err) {
      if (!(err instanceof UnsupportedImageError)) {
        this.logger.debug(`image candidate rejected: ${String(err)}`);
      }
      return undefined;
    }
  }

  private classify(err: unknown): ImportFailure {
    // A refused address is something the user can fix in the link; a redirect
    // chain that led nowhere is not.
    if (err instanceof RedirectError) return 'IMPORT_PAGE_UNREACHABLE';
    if (err instanceof BlockedAddressError) return 'IMPORT_URL_INVALID';
    if (err instanceof FetchTooLargeError) return 'IMPORT_PAGE_UNREACHABLE';
    this.logger.debug(`fetch failed: ${String(err)}`);
    return 'IMPORT_PAGE_UNREACHABLE';
  }
}

/** 403 and 429 are a wall; everything else that failed is the page being unreachable. */
const statusFailure = (status: number): ImportFailure | undefined => {
  if (status === 403 || status === 429 || status === 451) {
    return 'IMPORT_SITE_BLOCKED';
  }
  return status >= 400 ? 'IMPORT_PAGE_UNREACHABLE' : undefined;
};

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

/** "/products/black-linen-blazer.jpg" reads as a name; "/img/8a3f2.jpg" does not. */
const humanise = (pathname: string): string | undefined => {
  const last = pathname.split('/').pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // A bare % is legal in a path and decodeURIComponent refuses it.
  }
  const stem = decoded
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stem.length < 4 || stem.length > 120) return undefined;
  if (!/[a-z]{3}/i.test(stem) || /^[0-9a-f]{8,}$/i.test(stem)) return undefined;
  return stem.replace(/\b[a-z]/g, (c) => c.toUpperCase());
};

/**
 * Shops still serve latin1 and shift_jis. The declared charset wins; otherwise
 * the meta tag in the head does, and it is ASCII-compatible in every encoding
 * worth sniffing.
 */
export function decodeBody(body: Buffer, contentType: string): string {
  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const sniffed = /<meta[^>]+charset=["']?([\w-]+)/i.exec(
    body.subarray(0, 4096).toString('latin1'),
  )?.[1];
  for (const label of [declared, sniffed, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(body);
    } catch {
      /* an unknown label falls through to the next candidate */
    }
  }
  return body.toString('utf8');
}
