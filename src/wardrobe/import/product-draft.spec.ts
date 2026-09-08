import * as fs from 'node:fs';
import * as path from 'node:path';
import { GarmentColor } from '../garment-color.enum';
import { readPageMetadata } from './page-metadata';
import { cleanName, extractProduct, looksBlocked } from './product-draft';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');

describe('extractProduct', () => {
  describe('a variant group, the shape big brands publish', () => {
    const url =
      'https://www.nike.com/t/air-force-1-07-mens-shoes/CW2288-111?utm_source=newsletter';
    const draft = () =>
      extractProduct(fixture('jsonld-productgroup.html'), url);

    it('picks the variant the URL is showing, by its sku', () => {
      expect(draft().colors).toEqual([GarmentColor.WHITE]);
    });

    it('takes the brand from the group and drops it from the name', () => {
      const result = draft();
      expect(result.brand).toBe('Nike');
      expect(result.name).toBe("Nike Air Force 1 '07 Men's Shoes");
    });

    it('offers every size it sells but chooses none', () => {
      const result = draft();
      expect(result.sizeOptions).toEqual(['5', '6']);
      expect(result.size).toBeUndefined();
    });

    it('prefers the variant image over the page image', () => {
      expect(draft().imageCandidates[0]).toBe(
        'https://static.nike.com/af1/white-5.png',
      );
    });

    it('keeps the canonical link without the campaign parameters', () => {
      expect(draft().sourceUrl).toBe(
        'https://www.nike.com/t/air-force-1-07-mens-shoes/CW2288-111',
      );
    });

    it('reads the category from the product name', () => {
      expect(draft().category).toBe('footwear');
    });
  });

  describe('a single listing on a marketplace', () => {
    const url = 'https://www.vinted.co.uk/items/3000000000-broek';
    const draft = () => extractProduct(fixture('jsonld-product.html'), url);

    it('uses the seller-stated brand, not the marketplace', () => {
      expect(draft().brand).toBe('Geisha');
    });

    it('takes the size when the listing is a single item', () => {
      // No size is stated here, so none is invented either.
      expect(draft().size).toBeUndefined();
      expect(draft().sizeOptions).toEqual([]);
    });

    it('maps the stated colour and category', () => {
      const result = draft();
      expect(result.colors).toEqual([GarmentColor.BLACK]);
      expect(result.category).toBe('bottoms');
    });

    it('records the price and condition in the notes', () => {
      const notes = draft().notes ?? '';
      expect(notes).toContain('Zo goed als nieuw.');
      expect(notes).toContain('Price: 17.4 GBP');
      expect(notes).toContain('Condition: Used');
    });

    it('never lets the marketplace name become the brand', () => {
      const html = fixture('jsonld-product.html').replace(
        /"brand":\{[^}]*\},/,
        '',
      );
      const result = extractProduct(html, url);
      expect(result.brand).toBeUndefined();
    });

    it('recognises a brand the wardrobe already uses from the title', () => {
      const html = fixture('jsonld-product.html').replace(
        /"brand":\{[^}]*\},/,
        '',
      );
      const result = extractProduct(html, url, { knownBrands: ['Geisha'] });
      expect(result.brand).toBe('Geisha');
    });
  });

  describe('an @graph block with a breadcrumb', () => {
    const draft = () =>
      extractProduct(
        fixture('graph-and-breadcrumb.html'),
        'https://northwind.example/p/wool-coat',
      );

    it('finds the product nested in the graph', () => {
      const result = draft();
      expect(result.name).toBe('Wool Blend Coat');
      expect(result.brand).toBe('Northwind');
      expect(result.colors).toEqual([GarmentColor.BEIGE]);
    });

    it('takes the size, because the listing is a single item', () => {
      expect(draft().size).toBe('M');
    });

    it('keeps every image the product offers, in order', () => {
      expect(draft().imageCandidates).toEqual([
        'https://cdn.northwind.example/coat-1.jpg',
        'https://cdn.northwind.example/coat-2.jpg',
      ]);
    });
  });

  describe('a page with nothing but Open Graph tags', () => {
    const draft = () =>
      extractProduct(
        fixture('og-only.html'),
        'https://www.uniqlo.com/uk/en/products/E455359-000/00',
      );

    it('still gets a name, brand and image', () => {
      const result = draft();
      expect(result.name).toBe(
        'Unisex AIRism Cotton Oversized Crew Neck T-Shirt',
      );
      expect(result.brand).toBe('UNIQLO');
      expect(result.category).toBe('tops');
    });

    it('prefers the secure image URL and resolves a relative one', () => {
      expect(draft().imageCandidates[0]).toBe(
        'https://image.uniqlo.com/goods_69_455359_3x4.jpg',
      );
      expect(draft().imageCandidates).toContain(
        'https://www.uniqlo.com/images/goods_69_455359_3x4.jpg',
      );
    });
  });

  describe('pages that give us nothing', () => {
    it('returns an empty draft for a bot challenge rather than guessing', () => {
      const result = extractProduct(
        fixture('bot-challenge.html'),
        'https://www.hm.com/p/1',
      );
      expect(result.category).toBeUndefined();
      expect(result.brand).toBeUndefined();
      expect(result.imageCandidates).toEqual([]);
      // The link is still worth keeping so the user can finish by hand.
      expect(result.sourceUrl).toBe('https://www.hm.com/p/1');
    });

    it('does not name a garment after a meta-refresh challenge', () => {
      const result = extractProduct(
        fixture('meta-refresh-challenge.html'),
        'https://www.zara.com/p/1',
      );
      expect(result.name).toBeUndefined();
      expect(result.sourceUrl).toBe('https://www.zara.com/p/1');
    });

    it('does not name a garment after a denial page either', () => {
      const result = extractProduct(
        fixture('bot-challenge.html'),
        'https://www.hm.com/p/1',
      );
      expect(result.name).toBeUndefined();
    });

    it('skips an unparseable block and uses the readable one', () => {
      const result = extractProduct(
        fixture('broken-jsonld.html'),
        'https://harbour.example/p/shirt',
      );
      expect(result.name).toBe('Striped Linen Shirt');
      expect(result.colors).toEqual([GarmentColor.BLUE]);
    });
  });

  describe('sizes from the URL', () => {
    it('takes a size the shopper explicitly chose', () => {
      const result = extractProduct(
        fixture('jsonld-productgroup.html'),
        'https://www.nike.com/t/air-force-1-07-mens-shoes/CW2288-111?size=9',
      );
      expect(result.size).toBe('9');
    });
  });
});

describe('pages that talk about more than one product', () => {
  const graph = (nodes: unknown[]) =>
    `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': nodes,
    })}</script>`;

  it('ignores a recommendation rail and reads the page own product', () => {
    const html = graph([
      {
        '@type': 'ItemList',
        itemListElement: [
          {
            item: {
              '@type': 'Product',
              name: 'Leather Tote',
              brand: { name: 'OtherBrand' },
              color: 'Brown',
              image: 'https://cdn.harbour.example/tote.jpg',
            },
          },
        ],
      },
      {
        '@type': 'WebPage',
        mainEntity: {
          '@type': 'Product',
          name: 'Linen Shirt',
          brand: { name: 'Harbour' },
          color: 'Blue',
          image: 'https://cdn.harbour.example/shirt.jpg',
        },
      },
    ]);
    const draft = extractProduct(html, 'https://harbour.example/p/linen-shirt');
    expect(draft.name).toBe('Linen Shirt');
    expect(draft.brand).toBe('Harbour');
    expect(draft.colors).toEqual([GarmentColor.BLUE]);
    expect(draft.imageCandidates[0]).toBe(
      'https://cdn.harbour.example/shirt.jpg',
    );
  });

  it('does not borrow from an unrelated group on the page', () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      { '@type': 'Product', name: 'Vintage Levis Jeans', color: 'Blue' },
      {
        '@type': 'ProductGroup',
        name: 'Recommended: Nike Air Force 1',
        brand: { name: 'Nike' },
        category: 'Shoes',
        image: 'https://cdn.vinted.example/af1.jpg',
      },
    ])}</script>`;
    const draft = extractProduct(
      html,
      'https://www.vinted.co.uk/items/123-jeans',
    );
    expect(draft.brand).toBeUndefined();
    expect(draft.category).toBe('bottoms');
    expect(draft.imageCandidates).toEqual([]);
  });

  it('picks the variant whose own URL matches the query, not just the path', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'ProductGroup',
      name: 'Wool Coat',
      hasVariant: [
        {
          '@type': 'Product',
          url: 'https://shop.example/products/wool-coat?variant=1',
          color: 'Camel',
          image: 'https://cdn.shop.example/camel.jpg',
        },
        {
          '@type': 'Product',
          url: 'https://shop.example/products/wool-coat?variant=2',
          color: 'Black',
          image: 'https://cdn.shop.example/black.jpg',
        },
      ],
    })}</script>`;
    const draft = extractProduct(
      html,
      'https://shop.example/products/wool-coat?variant=2',
    );
    expect(draft.colors).toEqual([GarmentColor.BLACK]);
    expect(draft.imageCandidates[0]).toBe('https://cdn.shop.example/black.jpg');
  });
});

describe('what the draft says about where a value came from', () => {
  it('names Open Graph when Open Graph is all there is', () => {
    const draft = extractProduct(
      fixture('og-only.html'),
      'https://www.uniqlo.com/uk/en/products/E455359-000/00',
    );
    expect(draft.sources.name).toBe('opengraph');
    expect(draft.sources.category).toBe('opengraph');
    expect(draft.sources.colors).toBeUndefined();
  });

  it('names the title when the name came from the title', () => {
    const draft = extractProduct(
      '<title>Merino Wool Jumper</title>',
      'https://shop.example/p/1',
    );
    expect(draft.sources.name).toBe('title');
  });

  it('does not call a JSON-LD name what str() refused to read', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: [],
    })}</script><meta property="og:title" content="Real OG Name">`;
    const draft = extractProduct(html, 'https://shop.example/p/1');
    expect(draft.name).toBe('Real OG Name');
    expect(draft.sources.name).toBe('opengraph');
  });
});

describe('an explicit category outranks a word in the title', () => {
  it('files by the stated category, not by the name', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Boot Cut Jeans',
      category: 'Women > Clothing > Trousers',
    })}</script>`;
    const draft = extractProduct(
      html,
      'https://shop.example/en/trousers/boot-cut-jeans',
    );
    expect(draft.category).toBe('bottoms');
    expect(draft.sources.category).toBe('jsonld');
  });
});

describe('notes', () => {
  it('keeps a JSON-LD description as text, not as markup', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Cotton Tee',
      description: '<p>Soft &amp; light.</p><ul><li>100% cotton</li></ul>',
    })}</script>`;
    const notes = extractProduct(html, 'https://shop.example/p/1').notes ?? '';
    expect(notes).not.toContain('<');
    expect(notes).toContain('Soft & light.');
    expect(notes).toContain('100% cotton');
  });
});

describe('a page built to be expensive', () => {
  const within = (ms: number, run: () => unknown) => {
    const started = Date.now();
    run();
    expect(Date.now() - started).toBeLessThan(ms);
  };

  it('reads a name padded with a megabyte of spaces in linear time', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      color: 'xx',
      size: 'yy',
    })}</script><meta property="og:title" content="${' '.repeat(1024 * 1024)}">`;
    within(2000, () => extractProduct(html, 'https://shop.example/p/1'));
  });

  it('survives JSON-LD nested past any sane depth', () => {
    // Built by hand: JSON.stringify blows its own stack at this depth.
    const depth = 20000;
    const nested = `${'{"url":'.repeat(depth)}"deep"${'}'.repeat(depth)}`;
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Shallow","image":${nested}}</script>`;
    expect(extractProduct(html, 'https://shop.example/p/1').name).toBe(
      'Shallow',
    );
  });

  it('does not choke on a page whose entity references are nonsense', () => {
    const meta = extractProduct(
      '<title>Coat &#xFFFFFF; &#99999999;</title>',
      'https://shop.example/p/1',
    );
    expect(meta.name).toContain('Coat');
  });
});

describe('cleanName', () => {
  it.each([
    ['Wool Coat | Northwind', { siteName: 'Northwind' }, 'Wool Coat'],
    ['Air Force 1. Nike.com', { siteName: 'Nike.com' }, 'Air Force 1'],
    ['Linen Shirt - Harbour', { brand: 'Harbour' }, 'Linen Shirt'],
    ['Trousers | shop.example', { host: 'www.shop.example' }, 'Trousers'],
    ['Plain Name', {}, 'Plain Name'],
  ])('cleans %s', (input, context, expected) => {
    expect(cleanName(input, context)).toBe(expected);
  });

  it('leaves a name that merely contains the brand alone', () => {
    expect(cleanName('Nike Air Force 1', { brand: 'Nike' })).toBe(
      'Nike Air Force 1',
    );
  });
});

describe('looksBlocked', () => {
  it.each([
    'Just a moment...',
    'Access Denied',
    'Attention Required! | Cloudflare',
    'ZUGRIFF VERWEIGERT',
  ])('recognises %s as a wall', (title) => {
    expect(looksBlocked(readPageMetadata(`<title>${title}</title>`))).toBe(
      true,
    );
  });

  it('recognises a meta refresh to a verification endpoint', () => {
    const meta = readPageMetadata(
      '<meta http-equiv="refresh" content="0; url=/_sec/verify?bm-verify=AAQ">',
    );
    expect(looksBlocked(meta)).toBe(true);
  });

  it('leaves an ordinary product page alone', () => {
    const meta = readPageMetadata(
      '<title>Wool Coat | Northwind</title><meta http-equiv="refresh" content="600">',
    );
    expect(looksBlocked(meta)).toBe(false);
  });
});
