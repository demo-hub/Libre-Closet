import sharp from 'sharp';
import { intakeImage, toDataUri, UnsupportedImageError } from './image-intake';

const canvas = (width = 400, height = 300, alpha = 1) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 40, b: 60, alpha },
    },
  });

describe('intakeImage', () => {
  it.each(['jpeg', 'png', 'webp', 'gif'] as const)(
    'accepts %s and hands back webp',
    async (format) => {
      const input = await canvas().toFormat(format).toBuffer();
      const result = await intakeImage(input);
      expect((await sharp(result.buffer).metadata()).format).toBe('webp');
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    },
  );

  it('accepts a real AVIF, whose brand the magic gate has to trust', async () => {
    const input = await canvas(400, 300).avif({ effort: 0 }).toBuffer();
    const result = await intakeImage(input);
    expect((await sharp(result.buffer).metadata()).format).toBe('webp');
  });

  describe('the transparency hint that skips background removal', () => {
    it('is set when pixels really are transparent', async () => {
      const transparent = await canvas(400, 300, 0.4).png().toBuffer();
      expect((await intakeImage(transparent)).hasAlpha).toBe(true);
    });

    it('is not set for an RGBA packshot that is fully opaque', async () => {
      // The common shape for a PNG product photo: an alpha channel, no
      // transparency. Trusting the channel would skip the cut-out it needs.
      const opaque = await canvas().png().toBuffer();
      expect((await intakeImage(opaque)).hasAlpha).toBe(false);
    });

    it('is not set for a format that has no alpha at all', async () => {
      const flattened = await canvas().jpeg().toBuffer();
      expect((await intakeImage(flattened)).hasAlpha).toBe(false);
    });
  });

  it('reports the dimensions of the buffer it returns', async () => {
    const input = await canvas(3000, 2000).jpeg().toBuffer();
    const result = await intakeImage(input);
    expect([result.width, result.height]).toEqual([1080, 720]);
    const rotated = await intakeImage(
      await canvas(400, 300).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
    );
    expect([rotated.width, rotated.height]).toEqual([300, 400]);
  });

  it('shrinks an oversized photo to the same bound as an upload', async () => {
    const input = await canvas(3000, 2000).jpeg().toBuffer();
    const out = await sharp((await intakeImage(input)).buffer).metadata();
    expect(out.width).toBe(1080);
    expect(out.height).toBe(720);
  });

  it('leaves a small product shot at its own size', async () => {
    const input = await canvas(300, 200).jpeg().toBuffer();
    const out = await sharp((await intakeImage(input)).buffer).metadata();
    expect(out.width).toBe(300);
  });

  it('rotates by the EXIF orientation, as the upload path does', async () => {
    const input = await canvas(400, 300)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const out = await sharp((await intakeImage(input)).buffer).metadata();
    expect(out.width).toBe(300);
    expect(out.height).toBe(400);
  });

  describe('bytes that are not a product photo', () => {
    const rejects = async (buffer: Buffer, reason: RegExp) => {
      await expect(intakeImage(buffer)).rejects.toBeInstanceOf(
        UnsupportedImageError,
      );
      await expect(intakeImage(buffer)).rejects.toThrow(reason);
    };

    it('rejects an SVG before sharp can parse it', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200"/></svg>',
      );
      await rejects(svg, /not a recognised image/);
    });

    it('rejects a bot-challenge page served with a 200', async () => {
      await rejects(
        Buffer.from('<!doctype html><html>Access Denied</html>'),
        /not a recognised image/,
      );
    });

    it('rejects a TIFF, which sharp would otherwise decode', async () => {
      const tiff = await canvas().tiff().toBuffer();
      await rejects(tiff, /not a recognised image/);
    });

    it('rejects a truncated file', async () => {
      const input = await canvas().png().toBuffer();
      await rejects(input.subarray(0, 200), /could not be decoded/);
    });

    it('rejects an empty body', async () => {
      await rejects(Buffer.alloc(0), /not a recognised image/);
    });

    it('rejects an SVG wearing an ftyp hat', async () => {
      // `<!--` is four bytes, so "ftyp" lands where a HEIC brand would be.
      const svg = Buffer.from(
        '<!--ftyp--><svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400"/></svg>',
      );
      await rejects(svg, /not a recognised image/);
    });

    it('rejects a banner too wide to be a garment', async () => {
      const banner = await canvas(2000, 100).jpeg().toBuffer();
      await rejects(banner, /not shaped like/);
    });

    it('rejects a tracking pixel', async () => {
      const pixel = await canvas(1, 1).png().toBuffer();
      await rejects(pixel, /too small/);
    });

    it('rejects a JPEG header with rubbish behind it', async () => {
      const fake = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.alloc(4000, 0x41),
      ]);
      await rejects(fake, /could not be decoded/);
    });
  });
});

describe('toDataUri', () => {
  it('inlines the image, because the CSP forbids a remote one', async () => {
    const image = await intakeImage(await canvas().png().toBuffer());
    const uri = toDataUri(image);
    expect(uri.startsWith('data:image/webp;base64,')).toBe(true);
    expect(Buffer.from(uri.split(',')[1], 'base64').equals(image.buffer)).toBe(
      true,
    );
  });
});
