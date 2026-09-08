import * as fs from 'node:fs';
import * as path from 'node:path';
import { GarmentCategory } from '../garment-category.enum';
import { GarmentColor } from '../garment-color.enum';
import {
  parseShopifyProduct,
  shopifyProductJsonUrl,
} from './shopify-products-json';

const product = () =>
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '__fixtures__', 'shopify-product.json'),
      'utf8',
    ),
  ) as unknown;

describe('shopifyProductJsonUrl', () => {
  it.each([
    [
      'https://shop.example/products/merino-crew',
      'https://shop.example/products/merino-crew.js',
    ],
    [
      'https://shop.example/collections/knitwear/products/merino-crew?variant=1',
      'https://shop.example/collections/knitwear/products/merino-crew.js',
    ],
    [
      'https://shop.example/en-gb/products/merino-crew/',
      'https://shop.example/en-gb/products/merino-crew.js',
    ],
    [
      'https://shop.example/products/merino-crew.json',
      'https://shop.example/products/merino-crew.js',
    ],
  ])('turns %s into its JSON twin', (input, expected) => {
    expect(shopifyProductJsonUrl(input)).toBe(expected);
  });

  it.each([
    'https://shop.example/collections/knitwear',
    'https://www.nike.com/t/air-force-1/CW2288-111',
    'not a url',
  ])('leaves %s alone', (input) => {
    expect(shopifyProductJsonUrl(input)).toBeUndefined();
  });
});

describe('parseShopifyProduct', () => {
  const url = 'https://shop.example/products/everyday-merino-crew';

  it('takes the title and the vendor at their word', () => {
    const draft = parseShopifyProduct(product(), url)!;
    expect(draft.name).toBe('Everyday Merino Crew Jumper');
    expect(draft.brand).toBe('Harbour & Co');
    expect(draft.sources.brand).toBe('shopify');
  });

  it('reads the colour off the option axis, whatever it is called', () => {
    // The fixture spells the axis "Colour".
    const draft = parseShopifyProduct(product(), url)!;
    expect(draft.colors).toEqual([GarmentColor.BLUE]);
    expect(draft.sources.colors).toBe('shopify');
  });

  it('skips a sold-out variant when the URL names none', () => {
    const draft = parseShopifyProduct(product(), url)!;
    expect(draft.imageCandidates[0]).toBe(
      'https://cdn.shopify.com/s/files/1/0001/merino-navy-front.jpg',
    );
  });

  it('follows the variant the shopper is looking at', () => {
    const draft = parseShopifyProduct(product(), `${url}?variant=42111000001`)!;
    expect(draft.customColors).toEqual(['Oat']);
    expect(draft.colors).toEqual([]);
    expect(draft.size).toBe('S');
    expect(draft.sources.size).toBe('url');
  });

  it('offers every size but picks none until one is named', () => {
    const draft = parseShopifyProduct(product(), url)!;
    expect(draft.sizeOptions).toEqual(['S', 'M', 'L']);
    expect(draft.size).toBeUndefined();
  });

  it('files the garment by its product type', () => {
    expect(parseShopifyProduct(product(), url)!.category).toBe(
      GarmentCategory.TOPS,
    );
  });

  it('keeps the description as text and states the price', () => {
    const notes = parseShopifyProduct(product(), url)!.notes ?? '';
    expect(notes).toContain('A midweight crew neck knitted from traceable');
    expect(notes).not.toContain('<');
    expect(notes).toContain('Price: 89.00');
  });

  it('absolutises the protocol-relative CDN URLs and drops duplicates', () => {
    const draft = parseShopifyProduct(product(), url)!;
    expect(draft.imageCandidates).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/merino-navy-front.jpg',
      'https://cdn.shopify.com/s/files/1/0001/merino-oat-front.jpg',
    ]);
  });

  it('records the page, not the JSON endpoint, as the source', () => {
    const draft = parseShopifyProduct(product(), `${url}?utm_source=mail`)!;
    expect(draft.sourceUrl).toBe(url);
  });

  describe('the .json endpoint, whose shape differs', () => {
    it('unwraps the product and reads its decimal price', () => {
      const draft = parseShopifyProduct(
        {
          product: {
            title: 'Linen Shirt',
            vendor: 'Harbour',
            price: '45.00',
            options: [{ name: 'Size', values: ['M'] }],
            variants: [{ id: 1, option1: 'M', available: true }],
            images: [{ src: 'https://cdn.example/shirt.jpg' }],
          },
        },
        'https://shop.example/products/linen-shirt',
      )!;
      expect(draft.name).toBe('Linen Shirt');
      expect(draft.notes).toBe('Price: 45.00');
      expect(draft.imageCandidates).toEqual(['https://cdn.example/shirt.jpg']);
      // One variant, so its size is the item size rather than a rail.
      expect(draft.size).toBe('M');
      expect(draft.sources.size).toBe('shopify');
    });
  });

  describe('bodies that are not a Shopify product', () => {
    it.each([
      ['null', null],
      ['a string', 'Not Found'],
      ['an unrelated object', { ok: true }],
      ['a product without options or variants', { title: 'Just a title' }],
    ])('gives up on %s so the caller can read the page', (_label, body) => {
      expect(
        parseShopifyProduct(body, 'https://shop.example/products/x'),
      ).toBeUndefined();
    });
  });

  it('falls back to a known brand when the vendor is the shop itself', () => {
    const draft = parseShopifyProduct(
      {
        title: 'Geisha Wide Leg Trousers',
        vendor: '',
        options: [],
        variants: [],
      },
      'https://shop.example/products/x',
      { knownBrands: ['Geisha'] },
    )!;
    expect(draft.brand).toBe('Geisha');
    expect(draft.sources.brand).toBe('heuristic');
  });
});
