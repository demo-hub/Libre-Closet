import sharp from 'sharp';

/** Formats sharp may decode here. svg and tiff are excluded deliberately. */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif']);

/**
 * Magic bytes, checked before sharp sees the buffer. A declared content type is
 * not evidence: CDNs send octet-stream and bot walls send HTML with a 200. The
 * point of going first is that SVG is XML, and letting it reach sharp would
 * hand attacker-controlled markup to librsvg.
 */
const looksLikeImage = (buffer: Buffer): boolean => {
  if (buffer.length < 12) return false;
  const ascii = buffer.subarray(0, 12).toString('binary');
  return (
    (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    ascii.startsWith('\x89PNG\r\n\x1a\n') ||
    ascii.startsWith('GIF87a') ||
    ascii.startsWith('GIF89a') ||
    (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') ||
    isIsoBmff(buffer)
  );
};

/**
 * HEIC and AVIF, by their first box. The size word matters: without it any text
 * whose fifth to eighth bytes read "ftyp" passes, and `<!--ftyp` is exactly
 * that — an SVG wearing a four-byte hat.
 */
const isIsoBmff = (buffer: Buffer): boolean => {
  if (buffer.subarray(4, 8).toString('binary') !== 'ftyp') return false;
  const size = buffer.readUInt32BE(0);
  return (
    size >= 12 &&
    size <= buffer.length &&
    /^[\x20-\x7e]{4}$/.test(buffer.subarray(8, 12).toString('binary'))
  );
};

export class UnsupportedImageError extends Error {
  constructor(reason: string) {
    super(`unsupported image: ${reason}`);
    this.name = 'UnsupportedImageError';
  }
}

export interface IntakeImage {
  /** webp, ready to be handed to the browser or the storage layer. */
  buffer: Buffer;
  /** Of the webp above, not of the source. */
  width: number;
  height: number;
  /** Some pixel is actually transparent, so background removal has nothing to do. */
  hasAlpha: boolean;
}

const MIN_EDGE = 80;
/** The cap sharp is given below; checked up front so the message says why. */
const MAX_PIXELS = 50_000_000;
/** Above this a "photo" is a banner, and resizing it leaves a sliver. */
const MAX_ASPECT = 8;

/**
 * Validates downloaded bytes and re-encodes them to the same shape the upload
 * path produces, so an imported photo is indistinguishable from a taken one.
 */
export async function intakeImage(buffer: Buffer): Promise<IntakeImage> {
  if (!looksLikeImage(buffer)) {
    throw new UnsupportedImageError('not a recognised image');
  }

  const image = sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_PIXELS,
  });
  const metadata = await image.metadata().catch(() => {
    throw new UnsupportedImageError('could not be decoded');
  });
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new UnsupportedImageError(metadata.format ?? 'unknown format');
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_EDGE || height < MIN_EDGE) {
    // Sprites, tracking pixels and placeholder thumbnails.
    throw new UnsupportedImageError('too small to be a product photo');
  }
  if (Math.max(width, height) / Math.min(width, height) > MAX_ASPECT) {
    throw new UnsupportedImageError('not shaped like a product photo');
  }
  if (width * height > MAX_PIXELS) {
    throw new UnsupportedImageError('too large to decode');
  }

  // An alpha channel is not transparency: RGBA packshots are usually opaque,
  // and skipping the cut-out for them would save the garment on its background.
  const transparent = metadata.hasAlpha
    ? await image
        .stats()
        .then((stats) => !stats.isOpaque)
        .catch(() => false)
    : false;

  const { data, info } = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_PIXELS,
  })
    .autoOrient()
    .webp({ quality: 90 })
    // withoutEnlargement, unlike the upload path: a small product thumbnail
    // should stay small rather than be blown up to a blurry 1080.
    .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true })
    // A truncated file has a readable header and unreadable pixels, so this is
    // where it fails; the caller wants one error type either way.
    .catch(() => {
      throw new UnsupportedImageError('could not be decoded');
    });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    hasAlpha: transparent,
  };
}

/** The preview the review page shows, inline because the CSP forbids remote images. */
export const toDataUri = (image: IntakeImage): string =>
  `data:image/webp;base64,${image.buffer.toString('base64')}`;
