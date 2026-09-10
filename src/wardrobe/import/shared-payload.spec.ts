import { pickSharedTitle, pickSharedUrl } from './shared-payload';

describe('pickSharedUrl', () => {
  it('takes the url field when the sharing app filled it in', () => {
    expect(
      pickSharedUrl({
        url: 'https://shop.example/p/coat',
        text: 'https://other.example/p/1',
        title: 'Coat',
      }),
    ).toBe('https://shop.example/p/coat');
  });

  describe('the shapes Android actually sends', () => {
    it('finds the link in text when url is empty', () => {
      // Chrome's share sheet fills text, not url, for most apps.
      expect(
        pickSharedUrl({
          title: 'Wool Coat',
          text: 'Check this out https://shop.example/p/coat',
        }),
      ).toBe('https://shop.example/p/coat');
    });

    it('finds it in the title when that is all there is', () => {
      expect(pickSharedUrl({ title: 'https://shop.example/p/coat' })).toBe(
        'https://shop.example/p/coat',
      );
    });

    it('prefers text over title, as the plan orders them', () => {
      expect(
        pickSharedUrl({
          title: 'https://title.example/p/1',
          text: 'https://text.example/p/1',
        }),
      ).toBe('https://text.example/p/1');
    });

    it('takes the first link when the message holds several', () => {
      expect(
        pickSharedUrl({
          text: 'this https://first.example/p/1 or this https://second.example/p/2',
        }),
      ).toBe('https://first.example/p/1');
    });
  });

  describe('punctuation the sharing app leaves behind', () => {
    it.each([
      ['Look at https://shop.example/p/coat.', 'https://shop.example/p/coat'],
      ['"https://shop.example/p/coat"', 'https://shop.example/p/coat'],
      ['(https://shop.example/p/coat)', 'https://shop.example/p/coat'],
      ['https://shop.example/p/coat!', 'https://shop.example/p/coat'],
      ['— https://shop.example/p/coat…', 'https://shop.example/p/coat'],
    ])('reads %s', (text, expected) => {
      expect(pickSharedUrl({ text })).toBe(expected);
    });

    it('keeps a bracket the link itself opened', () => {
      expect(
        pickSharedUrl({
          text: 'https://en.wikipedia.org/wiki/Coat_(clothing)',
        }),
      ).toBe('https://en.wikipedia.org/wiki/Coat_(clothing)');
    });
  });

  describe('payloads with no link in them', () => {
    it.each([
      ['nothing at all', {}],
      ['empty strings', { url: '', text: '', title: '' }],
      ['plain words', { title: 'Wool Coat', text: 'I like this one' }],
      ['a scheme we will not fetch', { url: 'ftp://shop.example/p/1' }],
      ['an Android content uri', { url: 'content://media/external/images/1' }],
      ['a javascript url', { url: 'javascript:alert(1)' }],
      ['a bare host', { text: 'shop.example/p/coat' }],
    ])('gives up on %s', (_label, payload) => {
      expect(pickSharedUrl(payload)).toBeUndefined();
    });

    it('still finds a link inside a url field holding a sentence', () => {
      expect(
        pickSharedUrl({ url: 'Shared: https://shop.example/p/coat' }),
      ).toBe('https://shop.example/p/coat');
    });
  });

  it('does not scan more of a huge payload than a share could hold', () => {
    const started = Date.now();
    const link = pickSharedUrl({
      text: `${'a '.repeat(2_000_000)}https://shop.example/p/coat`,
    });
    // The link is past the cap, so it is not found — and that is the point:
    // the work is bounded whatever the payload.
    expect(link).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('pickSharedTitle', () => {
  it('keeps what the app said the page was called', () => {
    expect(
      pickSharedTitle({
        title: 'Wool Blend Coat',
        url: 'https://shop.example/p/coat',
      }),
    ).toBe('Wool Blend Coat');
  });

  it('takes the words around the link when there is no title', () => {
    expect(
      pickSharedTitle({
        text: 'Wool Blend Coat https://shop.example/p/coat',
      }),
    ).toBe('Wool Blend Coat');
  });

  it('says nothing when the title is only the link again', () => {
    expect(
      pickSharedTitle({ title: 'https://shop.example/p/coat' }),
    ).toBeUndefined();
  });

  it('says nothing when there is nothing worth keeping', () => {
    expect(pickSharedTitle({ title: 'a', text: '' })).toBeUndefined();
    expect(pickSharedTitle({})).toBeUndefined();
  });
});
