/** Media types the Anthropic vision API accepts. */
export const VISION_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export type VisionMediaType = (typeof VISION_MEDIA_TYPES)[number];

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

/**
 * Identifies an image from its magic bytes rather than trusting the client's
 * declared Content-Type. A phone that uploads HEIC while claiming `image/jpeg`
 * would otherwise produce a confusing API error instead of a clear "convert to
 * JPEG" message for the officer.
 */
export function sniffImageMediaType(buffer: Buffer): VisionMediaType | 'image/heic' | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: "GIF87a" / "GIF89a"
  if (buffer.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // HEIF/HEIC: ISO-BMFF box with "ftyp" at offset 4 and a HEIF brand at 8.
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1').toLowerCase();
    if (HEIF_BRANDS.has(brand)) return 'image/heic';
  }

  return null;
}

export function isVisionMediaType(value: string | null): value is VisionMediaType {
  return value !== null && (VISION_MEDIA_TYPES as readonly string[]).includes(value);
}
