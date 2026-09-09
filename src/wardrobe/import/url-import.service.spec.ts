import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { GarmentColor } from '../garment-color.enum';
import {
  FetchedBody,
  FetchTooLargeError,
  RedirectError,
} from './safe-fetch.service';
import { BlockedAddressError } from './url-policy';
import { decodeBody, UrlImportService } from './url-import.service';

const photo = (width = 600, height = 800) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 30, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();

const body = (over: Partial<FetchedBody> & { url: string }): FetchedBody => ({
  status: 200,
  contentType: 'text/html; charset=utf-8',
  body: Buffer.alloc(0),
  ...over,
});

const html = (head: string) =>
  `<!doctype html><html><head>${head}</head><body></body></html>`;

const PRODUCT_PAGE = html(`
  <title>Wool Blend Coat | Northwind</title>
  <meta property="og:site_name" content="Northwind">
  <script type="application/ld+json">{
    "@context":"https://schema.org","@type":"Product","name":"Wool Blend Coat",
    "brand":{"@type":"Brand","name":"Northwind"},"color":"Beige","size":"M",
    "image":["https://cdn.northwind.example/coat-1.jpg","https://cdn.northwind.example/coat-2.jpg"],
    "description":"A midweight coat.",
    "offers":{"@type":"Offer","price":"189","priceCurrency":"EUR"}
  }</script>
`);

describe('UrlImportService', () => {
  let fetchHtml: jest.Mock;
  let fetchImage: jest.Mock;
  let service: UrlImportService;

  const build = (config: Record<string, unknown> = {}) => {
    fetchHtml = jest.fn();
    fetchImage = jest.fn();
    const configService = {
      get: <T>(key: string, fallback: T) =>
        key in config ? (config[key] as T) : fallback,
    } as unknown as ConfigService;
    service = new UrlImportService(
      { fetchHtml, fetchImage } as never,
      configService,
    );
  };

  beforeEach(() => build());

  describe('a product page that reads cleanly', () => {
    beforeEach(async () => {
      fetchHtml.mockResolvedValue(
        body({
          url: 'https://northwind.example/p/wool-coat',
          body: Buffer.from(PRODUCT_PAGE),
        }),
      );
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.northwind.example/coat-1.jpg',
          contentType: 'image/jpeg',
          body: await photo(),
        }),
      );
    });

    it('fills the fields the page states', async () => {
      const result = await service.importFromUrl(
        'https://northwind.example/p/wool-coat',
      );
      expect(result.failure).toBeUndefined();
      expect(result.prefill.name).toBe('Wool Blend Coat');
      expect(result.prefill.brand).toBe('Northwind');
      expect(result.prefill.colors).toEqual([GarmentColor.BEIGE]);
      expect(result.prefill.category).toBe('outerwear');
      expect(result.prefill.notes).toContain('Price: 189 EUR');
    });

    it('names the shop, for the alert that says where this came from', async () => {
      const result = await service.importFromUrl(
        'https://www.northwind.example/p/wool-coat',
      );
      expect(result.host).toBe('northwind.example');
    });

    it('inlines the first candidate and offers the rest', async () => {
      const result = await service.importFromUrl(
        'https://northwind.example/p/wool-coat',
      );
      expect(result.image?.dataUri.startsWith('data:image/webp;base64,')).toBe(
        true,
      );
      expect(result.image?.hasAlpha).toBe(false);
      expect(result.candidates).toEqual([
        'https://cdn.northwind.example/coat-2.jpg',
      ]);
    });

    it('sends the page as the referer, which shop CDNs check', async () => {
      await service.importFromUrl('https://northwind.example/p/wool-coat');
      expect(fetchImage).toHaveBeenCalledWith(
        'https://cdn.northwind.example/coat-1.jpg',
        'https://northwind.example/p/wool-coat',
      );
    });

    it('asks the shop for the reader own language', async () => {
      await service.importFromUrl('https://northwind.example/p/wool-coat', {
        language: 'de',
      });
      expect(fetchHtml).toHaveBeenCalledWith(
        'https://northwind.example/p/wool-coat',
        'de',
      );
    });

    it('passes the wardrobe own categories and brands to the extractor', async () => {
      const result = await service.importFromUrl(
        'https://northwind.example/p/wool-coat',
        { knownCategories: ['Coats'] },
      );
      expect(result.prefill.category).toBe('Coats');
    });
  });

  describe('when the first candidate will not do', () => {
    it('falls through to the next one', async () => {
      fetchHtml.mockResolvedValue(
        body({
          url: 'https://northwind.example/p/wool-coat',
          body: Buffer.from(PRODUCT_PAGE),
        }),
      );
      fetchImage
        .mockResolvedValueOnce(
          body({
            url: 'https://cdn.northwind.example/coat-1.jpg',
            contentType: 'text/html',
            body: Buffer.from('<html>Access Denied</html>'),
          }),
        )
        .mockResolvedValueOnce(
          body({
            url: 'https://cdn.northwind.example/coat-2.jpg',
            contentType: 'image/jpeg',
            body: await photo(),
          }),
        );
      const result = await service.importFromUrl(
        'https://northwind.example/p/wool-coat',
      );
      expect(result.image?.url).toBe(
        'https://cdn.northwind.example/coat-2.jpg',
      );
      expect(result.candidates).toEqual([
        'https://cdn.northwind.example/coat-1.jpg',
      ]);
    });

    it('keeps the fields when every candidate fails', async () => {
      fetchHtml.mockResolvedValue(
        body({
          url: 'https://northwind.example/p/wool-coat',
          body: Buffer.from(PRODUCT_PAGE),
        }),
      );
      fetchImage.mockRejectedValue(new Error('socket hang up'));
      const result = await service.importFromUrl(
        'https://northwind.example/p/wool-coat',
      );
      expect(result.failure).toBe('IMPORT_IMAGE_INVALID');
      expect(result.prefill.name).toBe('Wool Blend Coat');
    });

    it('says so when the page offered no image at all', async () => {
      fetchHtml.mockResolvedValue(
        body({
          url: 'https://northwind.example/p/wool-coat',
          body: Buffer.from(html('<title>Wool Coat</title>')),
        }),
      );
      const result = await service.importFromUrl(
        'https://northwind.example/p/wool-coat',
      );
      expect(result.failure).toBe('IMPORT_NO_IMAGE_FOUND');
      expect(result.prefill.name).toBe('Wool Coat');
      expect(fetchImage).not.toHaveBeenCalled();
    });
  });

  describe('the Shopify fast path', () => {
    const shopifyBody = {
      title: 'Everyday Merino Crew',
      vendor: 'Harbour',
      type: 'Knitwear',
      options: [{ name: 'Colour', values: ['Navy'] }],
      variants: [
        { id: 1, option1: 'Navy', options: ['Navy'], available: true },
      ],
      images: ['https://cdn.shopify.com/merino.jpg'],
    };

    it('reads the JSON beside the page instead of the page', async () => {
      fetchHtml.mockResolvedValue(
        body({
          url: 'https://shop.example/products/merino.js',
          contentType: 'application/json',
          body: Buffer.from(JSON.stringify(shopifyBody)),
        }),
      );
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.shopify.com/merino.jpg',
          contentType: 'image/jpeg',
          body: await photo(),
        }),
      );
      const result = await service.importFromUrl(
        'https://shop.example/products/merino',
      );
      expect(fetchHtml).toHaveBeenCalledTimes(1);
      expect(fetchHtml).toHaveBeenCalledWith(
        'https://shop.example/products/merino.js',
      );
      expect(result.prefill.brand).toBe('Harbour');
      expect(result.prefill.colors).toEqual([GarmentColor.BLUE]);
    });

    it('falls back to the page when the shop is not Shopify', async () => {
      fetchHtml
        .mockResolvedValueOnce(body({ url: 'x', status: 404 }))
        .mockResolvedValueOnce(
          body({
            url: 'https://shop.example/products/merino',
            body: Buffer.from(PRODUCT_PAGE),
          }),
        );
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.northwind.example/coat-1.jpg',
          contentType: 'image/jpeg',
          body: await photo(),
        }),
      );
      const result = await service.importFromUrl(
        'https://shop.example/products/merino',
      );
      expect(fetchHtml).toHaveBeenCalledTimes(2);
      expect(result.prefill.name).toBe('Wool Blend Coat');
    });
  });

  describe('a link that is the photo itself', () => {
    it('imports it and names the garment after the file', async () => {
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.example/img/black-linen-blazer.jpg',
          contentType: 'image/jpeg',
          body: await photo(),
        }),
      );
      const result = await service.importFromUrl(
        'https://cdn.example/img/black-linen-blazer.jpg',
      );
      expect(result.failure).toBeUndefined();
      expect(result.prefill.name).toBe('Black Linen Blazer');
      expect(result.image?.dataUri).toContain('data:image/webp;base64,');
    });

    it('leaves the name empty when the file name says nothing', async () => {
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.example/i/8a3f2c9e1b7d.jpg',
          contentType: 'image/jpeg',
          body: await photo(),
        }),
      );
      const result = await service.importFromUrl(
        'https://cdn.example/i/8a3f2c9e1b7d.jpg',
      );
      expect(result.prefill.name).toBeUndefined();
    });

    it('reports an image it cannot decode', async () => {
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.example/img/coat.jpg',
          contentType: 'image/jpeg',
          body: Buffer.from('not really a jpeg'),
        }),
      );
      const result = await service.importFromUrl(
        'https://cdn.example/img/coat.jpg',
      );
      expect(result.failure).toBe('IMPORT_IMAGE_INVALID');
    });
  });

  describe('the six ways this ends badly', () => {
    it.each([
      ['not a url at all', 'IMPORT_URL_INVALID'],
      ['ftp://shop.example/p/1', 'IMPORT_URL_INVALID'],
      ['http://127.0.0.1/p/1', 'IMPORT_URL_INVALID'],
      ['http://user:pw@shop.example/p/1', 'IMPORT_URL_INVALID'],
    ])('refuses %s before fetching anything', async (input, expected) => {
      const result = await service.importFromUrl(input);
      expect(result.failure).toBe(expected);
      expect(fetchHtml).not.toHaveBeenCalled();
    });

    it.each([
      [403, 'IMPORT_SITE_BLOCKED'],
      [429, 'IMPORT_SITE_BLOCKED'],
      [451, 'IMPORT_SITE_BLOCKED'],
      [404, 'IMPORT_PAGE_UNREACHABLE'],
      [500, 'IMPORT_PAGE_UNREACHABLE'],
      [503, 'IMPORT_PAGE_UNREACHABLE'],
    ])('reads HTTP %i as %s', async (status, expected) => {
      fetchHtml.mockResolvedValue(
        body({ url: 'https://shop.example/p/1', status }),
      );
      const result = await service.importFromUrl('https://shop.example/p/1');
      expect(result.failure).toBe(expected);
    });

    it('recognises a wall served with a 200', async () => {
      fetchHtml.mockResolvedValue(
        body({
          url: 'https://shop.example/p/1',
          body: Buffer.from(html('<title>Just a moment...</title>')),
        }),
      );
      const result = await service.importFromUrl('https://shop.example/p/1');
      expect(result.failure).toBe('IMPORT_SITE_BLOCKED');
      // The link is still worth keeping: the user can fill the rest in by hand.
      expect(result.prefill.sourceUrl).toBe('https://shop.example/p/1');
    });

    it.each([
      [new BlockedAddressError('address 10.0.0.5'), 'IMPORT_URL_INVALID'],
      [new RedirectError('too many redirects'), 'IMPORT_PAGE_UNREACHABLE'],
      [new FetchTooLargeError(1024), 'IMPORT_PAGE_UNREACHABLE'],
      [
        Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' }),
        'IMPORT_PAGE_UNREACHABLE',
      ],
      [new DOMException('aborted', 'TimeoutError'), 'IMPORT_PAGE_UNREACHABLE'],
    ])('reads a thrown %s as its own state', async (error, expected) => {
      fetchHtml.mockRejectedValue(error);
      const result = await service.importFromUrl('https://shop.example/p/1');
      expect(result.failure).toBe(expected);
    });

    it('refuses a body that is neither a page nor an image', async () => {
      fetchHtml.mockResolvedValue(
        body({
          url: 'https://shop.example/p/1.pdf',
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.7'),
        }),
      );
      const result = await service.importFromUrl(
        'https://shop.example/p/1.pdf',
      );
      // Not a page, so it is offered to the image checks, which refuse it.
      expect(result.failure).toBe('IMPORT_IMAGE_INVALID');
    });

    it('does nothing at all when the feature is switched off', async () => {
      build({ IMPORT_URL_ENABLED: false });
      const result = await service.importFromUrl('https://shop.example/p/1');
      expect(result.failure).toBe('IMPORT_DISABLED');
      expect(service.isEnabled).toBe(false);
      expect(fetchHtml).not.toHaveBeenCalled();
    });

    it('lets a private address through only when the flag says to', async () => {
      build({ IMPORT_ALLOW_PRIVATE_NETWORKS: true });
      fetchHtml.mockResolvedValue(
        body({
          url: 'http://127.0.0.1:3000/p/1',
          body: Buffer.from(html('<title>Local Coat</title>')),
        }),
      );
      const result = await service.importFromUrl('http://127.0.0.1:3000/p/1');
      expect(result.failure).toBe('IMPORT_NO_IMAGE_FOUND');
      expect(result.prefill.name).toBe('Local Coat');
    });
  });

  describe('picking a different image', () => {
    it('downloads just that candidate', async () => {
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.northwind.example/coat-2.jpg',
          contentType: 'image/jpeg',
          body: await photo(),
        }),
      );
      const result = await service.importImage(
        'https://cdn.northwind.example/coat-2.jpg',
        'https://northwind.example/p/wool-coat',
      );
      expect(result.image?.url).toBe(
        'https://cdn.northwind.example/coat-2.jpg',
      );
      expect(fetchHtml).not.toHaveBeenCalled();
    });

    it('refuses a candidate the policy would not fetch', async () => {
      const result = await service.importImage('http://localhost/secret.png');
      expect(result.failure).toBe('IMPORT_URL_INVALID');
      expect(fetchImage).not.toHaveBeenCalled();
    });

    it('reports one that is not an image', async () => {
      fetchImage.mockResolvedValue(
        body({
          url: 'https://cdn.example/x.svg',
          contentType: 'image/svg+xml',
          body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        }),
      );
      const result = await service.importImage('https://cdn.example/x.svg');
      expect(result.failure).toBe('IMPORT_IMAGE_INVALID');
    });
  });
});

describe('decodeBody', () => {
  it('uses the charset the server declared', () => {
    const latin1 = Buffer.from('Café Noir', 'latin1');
    expect(decodeBody(latin1, 'text/html; charset=iso-8859-1')).toBe(
      'Café Noir',
    );
  });

  it('falls back to the meta charset in the head', () => {
    const page = Buffer.concat([
      Buffer.from('<meta charset="iso-8859-1">', 'latin1'),
      Buffer.from('Café', 'latin1'),
    ]);
    expect(decodeBody(page, 'text/html')).toContain('Café');
  });

  it('ignores a charset no decoder knows', () => {
    const page = Buffer.from('Plain', 'utf8');
    expect(decodeBody(page, 'text/html; charset=x-made-up')).toBe('Plain');
  });

  it('defaults to utf-8', () => {
    expect(decodeBody(Buffer.from('Wełna', 'utf8'), '')).toBe('Wełna');
  });
});
