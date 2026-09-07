import { isVisionMediaType, sniffImageMediaType } from '@/lib/extraction/image';

import { fetchPublicResource } from './fetch';
import { UnsafeUrlError } from './guard';
import { parseListing, type ParsedListing } from './parse';

export { UnsafeUrlError } from './guard';
export type { ParsedListing } from './parse';

/**
 * Capture of an e-commerce product listing as inspectable evidence.
 *
 * ## Why a listing is assessable at all
 *
 * Rule 6(10) of the Legal Metrology (Packaged Commodities) Rules, 2011 requires an
 * e-commerce entity to display, on the product display page, the same mandatory
 * declarations that Rule 6(1) requires on the package itself. So for a listing the
 * subject of the assessment is the *page*, and a declaration stated in the page text
 * is a declaration made — it does not have to be legible in the photograph. That is why
 * the page text is carried through to the extractor alongside the image rather than the
 * image being treated as the only evidence.
 *
 * ## What is captured
 *
 * The primary product image, so the record has a picture of what was offered, and the
 * visible page text, so declarations published as text are not scored as missing. Both
 * are stored on the scan: the image exactly as an uploaded photograph would be, which
 * is what lets the rest of the pipeline stay unchanged.
 */

/** An HTML page: generous enough for a real marketplace page, bounded all the same. */
const PAGE_LIMITS = { maxBytes: 3 * 1024 * 1024, timeoutMs: 20_000 };
/** A product photograph. Matches the label-photo ceiling. */
const IMAGE_LIMITS = { maxBytes: 12 * 1024 * 1024, timeoutMs: 20_000 };

/** How many image candidates to try before giving up. */
const IMAGE_ATTEMPTS = 4;

/** Below this, the page almost certainly rendered its content with JavaScript. */
const MIN_USEFUL_TEXT_CHARS = 400;

export interface ListingCapture {
  /** The URL finally served, after redirects — this is what gets recorded. */
  url: string;
  title: string | null;
  /** The product image, ready to be stored as the scan image. */
  imageBytes: Buffer;
  imageContentType: string;
  /** URL the image itself came from, noted in the evidence text. */
  imageUrl: string;
  /** Page text handed to the extractor and stored on the scan. */
  sourceText: string;
  parsed: ParsedListing;
}

function assertHtml(contentType: string | null, url: string): void {
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
    throw new UnsafeUrlError(
      `That address returned ${contentType.split(';')[0].trim()} rather than a web page. Paste the product page URL, not a file or an image.`,
    );
  }
  void url;
}

/**
 * Fetches the page, then the best product image it advertises.
 *
 * Image candidates are tried in order because the first one frequently is not usable:
 * marketplaces serve WebP to some clients and AVIF to others, and a logo sometimes
 * outranks the product shot. Each candidate goes through the same SSRF guard as the
 * page — a listing that points its `og:image` at an internal host gets no special
 * treatment for having been named by a page we already fetched.
 */
export async function captureListing(rawUrl: string): Promise<ListingCapture> {
  const page = await fetchPublicResource(
    rawUrl,
    PAGE_LIMITS,
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  );

  assertHtml(page.contentType, page.url);

  const html = page.body.toString('utf8');
  const parsed = parseListing(html, page.url);

  if (parsed.visibleTextLength < MIN_USEFUL_TEXT_CHARS && parsed.imageUrls.length === 0) {
    throw new UnsafeUrlError(
      'That page returned almost no readable content — it most likely builds its listing in the browser, which this capture cannot run. Photograph the pack instead.',
    );
  }

  let imageBytes: Buffer | null = null;
  let imageContentType: string | null = null;
  let imageUrl: string | null = null;
  const failures: string[] = [];

  for (const candidate of parsed.imageUrls.slice(0, IMAGE_ATTEMPTS)) {
    try {
      const fetched = await fetchPublicResource(candidate, IMAGE_LIMITS, 'image/*');
      const sniffed = sniffImageMediaType(fetched.body);

      // The vision models accept JPEG, PNG, GIF and WebP. An AVIF or SVG hero image is
      // skipped rather than failing the whole capture, since listings usually offer
      // several.
      if (!isVisionMediaType(sniffed)) {
        failures.push(`${candidate} (unsupported image format)`);
        continue;
      }

      imageBytes = fetched.body;
      imageContentType = sniffed;
      imageUrl = fetched.url;
      break;
    } catch (error) {
      failures.push(`${candidate} (${error instanceof Error ? error.message : 'fetch failed'})`);
    }
  }

  if (!imageBytes || !imageContentType || !imageUrl) {
    throw new UnsafeUrlError(
      parsed.imageUrls.length === 0
        ? 'No product image could be found on that page. Photograph the pack instead.'
        : 'None of the images on that page could be downloaded in a readable format. Photograph the pack instead.',
    );
  }

  if (failures.length > 0) {
    console.warn('[listing] skipped image candidates', { url: page.url, failures });
  }

  /*
   * The provenance header is part of the evidence, not decoration. An officer reading
   * this months later needs to know that the declarations were read from a page at a
   * URL on a date — a listing is edited freely and will not look the same later.
   */
  const provenance = [
    'E-COMMERCE LISTING CAPTURE',
    `Listing URL: ${page.url}`,
    `Product image: ${imageUrl}`,
    `Captured: ${new Date().toISOString()}`,
    parsed.title ? `Title as published: ${parsed.title}` : null,
    page.truncated ? 'Note: the page was longer than the capture limit and was truncated.' : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return {
    url: page.url,
    title: parsed.title,
    imageBytes,
    imageContentType,
    imageUrl,
    sourceText: `${provenance}\n\n${parsed.declarationText}`,
    parsed,
  };
}
