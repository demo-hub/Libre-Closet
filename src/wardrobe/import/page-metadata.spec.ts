import { collectJsonLdNodes, hasType, readPageMetadata } from './page-metadata';

describe('readPageMetadata', () => {
  it('reads the shapes an attribute is actually written in', () => {
    const meta = readPageMetadata(`
      <meta property="og:title" content="Double quoted">
      <meta property='og:description' content='Single quoted'>
      <meta property=og:site_name content=Unquoted>
    `);
    expect(meta.meta['og:title']).toBe('Double quoted');
    expect(meta.meta['og:description']).toBe('Single quoted');
    expect(meta.meta['og:site_name']).toBe('Unquoted');
  });

  it('falls back from property to name to itemprop', () => {
    const meta = readPageMetadata(`
      <meta name="description" content="By name">
      <meta itemprop="image" content="/by-itemprop.jpg">
    `);
    expect(meta.meta.description).toBe('By name');
    expect(meta.meta.image).toBe('/by-itemprop.jpg');
  });

  it('keeps the first value when a tag repeats, as ogp.me says', () => {
    const meta = readPageMetadata(`
      <meta property="og:title" content="First">
      <meta property="og:title" content="Second">
    `);
    expect(meta.meta['og:title']).toBe('First');
  });

  it('keeps every og:image in document order, secure twin first', () => {
    // ogp.me: a structured property belongs to the image it follows, so pairs
    // must not be reordered globally or the preview becomes the last photo.
    const meta = readPageMetadata(`
      <meta property="og:image" content="http://cdn/a.jpg">
      <meta property="og:image:secure_url" content="https://cdn/a.jpg">
      <meta property="og:image" content="http://cdn/b.jpg">
      <meta property="og:image:secure_url" content="https://cdn/b.jpg">
    `);
    expect(meta.ogImages).toEqual([
      'https://cdn/a.jpg',
      'http://cdn/a.jpg',
      'https://cdn/b.jpg',
      'http://cdn/b.jpg',
    ]);
  });

  it('decodes the entities a shop title arrives with', () => {
    const meta = readPageMetadata(
      '<title>Levi&#39;s 501&reg; &amp; more &#x2014; Shop</title>',
    );
    expect(meta.title).toBe("Levi's 501&reg; & more — Shop");
  });

  it('collapses the whitespace of a hand-formatted title', () => {
    const meta = readPageMetadata('<title>\n  Wool\n  Coat\n</title>');
    expect(meta.title).toBe('Wool Coat');
  });

  it('takes the first h1 and strips the markup inside it', () => {
    const meta = readPageMetadata(
      '<h1 class="pdp"><span>Wool</span> <em>Coat</em></h1><h1>Ignored</h1>',
    );
    expect(meta.h1).toBe('Wool Coat');
  });

  it('finds link rel=image_src', () => {
    const meta = readPageMetadata(
      '<link rel="stylesheet" href="/a.css"><link rel="image_src" href="/p.jpg">',
    );
    expect(meta.linkImageSrc).toBe('/p.jpg');
  });

  describe('ld+json blocks', () => {
    it('parses only ld+json, whatever the type parameters say', () => {
      const meta = readPageMetadata(`
        <script type="application/json">{"ignored":true}</script>
        <script type="application/ld+json; charset=utf-8">{"@type":"Product"}</script>
        <script>window.product = {"alsoIgnored":true}</script>
      `);
      expect(meta.jsonLd).toEqual([{ '@type': 'Product' }]);
    });

    it('tolerates the stray characters shops emit', () => {
      const meta = readPageMetadata(
        '<script type="application/ld+json">\n{"name":"A\u0008B"}\n;</script>',
      );
      // A raw control character is invalid inside a JSON string; it becomes a space.
      expect(meta.jsonLd).toEqual([{ name: 'A B' }]);
    });

    it('skips a broken block without losing the readable ones', () => {
      const meta = readPageMetadata(`
        <script type="application/ld+json">{ not json </script>
        <script type="application/ld+json">{"@type":"Product"}</script>
      `);
      expect(meta.jsonLd).toEqual([{ '@type': 'Product' }]);
    });
  });

  describe('pages built to break a parser', () => {
    const within = (ms: number, run: () => void) => {
      const started = Date.now();
      run();
      expect(Date.now() - started).toBeLessThan(ms);
    };

    it('treats everything after an unclosed script as script content', () => {
      const meta = readPageMetadata(
        '<title>Read</title><script type="application/ld+json">{"@type":"Product"}<h1>Not a heading</h1>',
      );
      expect(meta.title).toBe('Read');
      expect(meta.jsonLd).toEqual([]);
      expect(meta.h1).toBeUndefined();
    });

    it('survives an unclosed title and a truncated meta tag', () => {
      const meta = readPageMetadata('<title>No end<meta property="og:title"');
      expect(meta.title).toBeUndefined();
      expect(meta.meta).toEqual({});
    });

    it('skips a tag with an unescaped angle bracket rather than half-reading it', () => {
      const meta = readPageMetadata(
        '<meta property="og:title" content="A > B"><meta name="ok" content="v">',
      );
      expect(meta.meta['og:title']).toBeUndefined();
      expect(meta.meta.ok).toBe('v');
    });

    it('reads the same title once the shop escapes it properly', () => {
      const meta = readPageMetadata(
        '<meta property="og:title" content="A &gt; B">',
      );
      expect(meta.meta['og:title']).toBe('A > B');
    });

    it('reads a tag with many attributes in linear time', () => {
      const tag = `<meta ${'data-x="y" '.repeat(500)}property="og:title" content="Deep">`;
      within(1000, () => {
        expect(readPageMetadata(tag).meta['og:title']).toBe('Deep');
      });
    });

    it('stops reading a tag no real page would write', () => {
      const tag = `<meta ${'data-x="y" '.repeat(5000)}property="og:title" content="Deep">`;
      within(1000, () => {
        expect(readPageMetadata(tag).meta['og:title']).toBeUndefined();
      });
    });

    it('scans a document full of scripts in linear time', () => {
      const html = '<script type="application/ld+json">{"a":1}</script>'.repeat(
        5000,
      );
      within(2000, () =>
        expect(readPageMetadata(html).jsonLd).toHaveLength(5000),
      );
    });

    it('does not rescan the document for every unterminated meta tag', () => {
      const html = '<meta '.repeat(200000);
      within(2000, () => expect(readPageMetadata(html).meta).toEqual({}));
    });

    it('reads thousands of meta tags in linear time', () => {
      const html = '<meta name="a" content="b">'.repeat(20000);
      within(2000, () => expect(readPageMetadata(html).meta.a).toBe('b'));
    });

    it('does not hang on a huge unterminated script open tag', () => {
      const html = `<script ${'a'.repeat(200000)}`;
      within(2000, () => expect(readPageMetadata(html).jsonLd).toEqual([]));
    });

    it('does not hang on deeply nested markup inside an h1', () => {
      const html = `<h1>${'<span>'.repeat(20000)}deep`;
      within(2000, () => expect(readPageMetadata(html).h1).toBeUndefined());
    });

    it('returns an empty reading for an empty page', () => {
      expect(readPageMetadata('')).toEqual({
        jsonLd: [],
        meta: {},
        ogImages: [],
      });
    });
  });
});

describe('collectJsonLdNodes', () => {
  it('walks a bare object, an array and an @graph alike', () => {
    const nodes = collectJsonLdNodes([
      { '@type': 'Product', name: 'Bare' },
      [{ '@type': 'Product', name: 'In an array' }],
      { '@graph': [{ '@type': 'Product', name: 'In a graph' }] },
    ]);
    // The @graph wrapper itself is a node too, and comes before its children.
    expect(nodes.map((n) => n.name)).toEqual([
      'Bare',
      'In an array',
      undefined,
      'In a graph',
    ]);
  });

  it('reaches products through the properties that carry them', () => {
    const nodes = collectJsonLdNodes([
      {
        '@type': 'ProductGroup',
        hasVariant: [{ '@type': 'Product', name: 'Variant' }],
      },
      {
        '@type': 'WebPage',
        mainEntity: { '@type': 'Product', name: 'Main entity' },
      },
      {
        '@type': 'ItemList',
        itemListElement: [
          { item: { '@type': 'Product', name: 'Listed' } },
          {
            '@type': 'Offer',
            itemOffered: { '@type': 'Product', name: 'Sold' },
          },
        ],
      },
    ]);
    const names = nodes.map((n) => n.name);
    expect(names).toContain('Variant');
    expect(names).toContain('Main entity');
    expect(names).toContain('Listed');
    expect(names).toContain('Sold');
  });

  it('stops at a cycle instead of recursing forever', () => {
    const node: Record<string, unknown> = { '@type': 'Product', name: 'Loop' };
    node.mainEntity = node;
    expect(collectJsonLdNodes([node])).toEqual([node]);
  });

  it('stops descending past a sane depth', () => {
    let node: Record<string, unknown> = { '@type': 'Product', name: 'Bottom' };
    for (let i = 0; i < 40; i++) node = { mainEntity: node };
    expect(collectJsonLdNodes([node]).map((n) => n.name)).not.toContain(
      'Bottom',
    );
  });

  it('ignores primitives and nulls', () => {
    expect(collectJsonLdNodes([null, 'text', 7, undefined])).toEqual([]);
  });
});

describe('hasType', () => {
  it('accepts a string, an array and any casing', () => {
    expect(hasType({ '@type': 'Product' }, 'product')).toBe(true);
    expect(hasType({ '@type': ['Thing', 'PRODUCT'] }, 'product')).toBe(true);
    expect(hasType({ '@type': 'Article' }, 'product')).toBe(false);
    expect(hasType({}, 'product')).toBe(false);
  });
});
