/**
 * Extraction of the useful parts of an e-commerce product page.
 *
 * Hand-rolled rather than done with a DOM library, for two reasons. Only four things
 * are needed — the title, the candidate product images, the visible text, and any
 * JSON-LD product block — and none of them require a tree. More importantly, the input
 * is hostile: a real parser would faithfully build a tree from a page engineered to
 * confuse it, whereas this only ever reads, never resolves anything, and cannot be
 * made to execute or request anything.
 *
 * The limitation is stated plainly rather than hidden: a listing rendered entirely in
 * the browser by JavaScript will yield little, because no script runs here. Every
 * major Indian marketplace serves product metadata in the initial HTML (they need it
 * for search engines), which is what makes this worth doing at all — and when it does
 * come back thin, the officer is told so and can photograph the pack instead.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rupee: '\u20b9',
  inr: '\u20b9',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  middot: '\u00b7',
  times: '\u00d7',
  deg: '\u00b0',
  reg: '\u00ae',
  copy: '\u00a9',
  trade: '\u2122',
  eacute: '\u00e9',
};

/** Decodes the entity forms that actually appear in product copy. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const codePoint = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      // Surrogates and out-of-range values would throw; leave them as written.
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Elements whose contents are never visible product copy. */
const INVISIBLE_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'head'];

function stripInvisible(html: string): string {
  let out = html;
  for (const tag of INVISIBLE_ELEMENTS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  }
  return out.replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * Turns markup into the text a shopper would see.
 *
 * Block-level tags become newlines rather than nothing, which matters: without it
 * `<td>MRP</td><td>120</td>` collapses to "MRP120" and the declaration becomes
 * unreadable to the model downstream.
 */
export function visibleText(html: string): string {
  return decodeEntities(
    stripInvisible(html)
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h[1-6]|\/section|\/span)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** Reads a `<meta>` value by `property` or `name`, whichever the page used. */
function metaContent(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return null;
  const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() || null : null;
}

/**
 * Collects `image` values out of any JSON-LD block on the page.
 *
 * Schema.org allows `image` to be a string, an array, or an ImageObject with a `url`,
 * and `@graph` nesting is common, so the block is walked generically rather than
 * assuming one shape. A malformed block is skipped silently — a seller's broken JSON
 * is not a reason to refuse the inspection.
 */
function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(decodeEntities(match[1].trim())));
    } catch {
      /* a seller's malformed JSON-LD is not our problem */
    }
  }
  return blocks;
}

const isAbsoluteHttp = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value);

/**
 * Reads a schema.org `image` value, which may be a URL string, an array of either, or
 * an ImageObject whose address lives in `contentUrl` or `url`.
 */
function collectImage(value: unknown, into: string[], recurse: (child: unknown) => void): void {
  if (isAbsoluteHttp(value)) {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectImage(entry, into, recurse));
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // Inside an ImageObject these *are* the picture, unlike a bare `url` on a Product.
    if (isAbsoluteHttp(record.contentUrl)) into.push(record.contentUrl);
    else if (isAbsoluteHttp(record.url)) into.push(record.url);
    else recurse(value);
  }
}

function collectFromJsonLd(blocks: unknown[]): { names: string[]; images: string[] } {
  const names: string[] = [];
  const images: string[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number): void => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (seen.has(node)) return; // JSON-LD can be self-referential via @graph
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }

    const record = node as Record<string, unknown>;
    const type = record['@type'];
    const isProduct =
      type === 'Product' || (Array.isArray(type) && type.includes('Product'));

    if (isProduct && typeof record.name === 'string') names.push(record.name);

    /*
     * Only `image` is read, never a bare `url`.
     *
     * On a Product or an Article, `url` is the page's own address — collecting it
     * produced a candidate pointing at the HTML page rather than a picture, which then
     * failed a format sniff for no good reason. `url` is meaningful only *inside* an
     * ImageObject, which is why it is read one level down instead.
     */
    collectImage(record.image, images, (child) => walk(child, depth + 1));

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') walk(value, depth + 1);
    }
  };

  blocks.forEach((block) => walk(block, 0));
  return { names, images };
}

/** `<img>` sources, in document order, resolved against the page URL. */
function imgSources(html: string, base: URL): string[] {
  const out: string[] = [];
  const pattern = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const tag = match[0];
    // Prefer the largest candidate a srcset offers, else the plain src.
    const srcset = tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i)?.[1];
    const candidates: string[] = [];

    if (srcset) {
      const best = srcset
        .split(',')
        .map((part) => part.trim().split(/\s+/))
        .map(([url, descriptor]) => ({
          url,
          weight: Number.parseInt(descriptor ?? '', 10) || 0,
        }))
        .sort((a, b) => b.weight - a.weight)[0];
      if (best?.url) candidates.push(best.url);
    }

    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src) candidates.push(src);

    for (const candidate of candidates) {
      const value = decodeEntities(candidate).trim();
      // Inline data URIs and tracking pixels are never the product photograph.
      if (!value || value.startsWith('data:')) continue;
      try {
        out.push(new URL(value, base).toString());
      } catch {
        /* unresolvable src */
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Declaration highlighting
// ---------------------------------------------------------------------------

/**
 * Phrases that introduce a mandatory declaration on an Indian product page.
 *
 * A full page dump can run past 100,000 characters of navigation, reviews and
 * recommendations. Lifting the lines that actually bear on Rule 6 to the top means the
 * declarations are not buried where a length cap would cut them off. The full text
 * still follows, so nothing is decided by this filter — it only orders the evidence.
 */
const DECLARATION_CUES: readonly RegExp[] = [
  /net\s*(?:quantity|qty|weight|wt|vol(?:ume)?|content)/i,
  /\b(?:m\.?r\.?p\.?|maximum\s+retail\s+price)\b/i,
  /inclusive\s+of\s+all\s+taxes/i,
  /\b(?:manufactured|packed|marketed|imported)\s+(?:by|on|for)\b/i,
  /\bmanufacturer\b|\bpacker\b|\bimporter\b/i,
  /country\s+of\s+origin|made\s+in\b/i,
  /\b(?:consumer|customer)\s+(?:care|complaint|support|service)\b/i,
  /\b(?:mfg|mfd|pkd)\b|date\s+of\s+(?:manufacture|packing|import)|best\s+before|use\s+by/i,
  /unit\s+sale\s+price|\bper\s+(?:kg|kilogram|g|gram|l|litre|liter|ml|piece|unit)\b/i,
  /\bfssai\b|licence\s+no|license\s+no/i,
  /\bgeneric\s+name\b|\bcommodity\b/i,
  /₹|\brs\.?\s*\d/i,
  /\b(?:e-?mail|email|phone|tel|toll[\s-]?free|helpline)\b/i,
  /\bpin\s*code\b|\d{6}\b/,
];

function declarationHighlights(text: string, limit: number): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 400);

  const picked: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!DECLARATION_CUES.some((cue) => cue.test(line))) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(line);
    if (picked.length >= limit) break;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface ParsedListing {
  /** Best available product title, or null when the page offered none. */
  title: string | null;
  /** Candidate product image URLs, best guess first. */
  imageUrls: string[];
  /** Declaration-bearing lines, lifted to the front of the evidence text. */
  highlights: string[];
  /** The declaration text handed to the extractor: highlights, then page text. */
  declarationText: string;
  /** Length of the visible text before truncation, for the audit trail. */
  visibleTextLength: number;
}

/** How much page text is carried into the extraction prompt. */
const MAX_TEXT_CHARS = 12_000;
const MAX_HIGHLIGHTS = 60;
const MAX_IMAGE_CANDIDATES = 8;

export function parseListing(html: string, pageUrl: string): ParsedListing {
  const base = new URL(pageUrl);
  const blocks = jsonLdBlocks(html);
  const fromJsonLd = collectFromJsonLd(blocks);

  const title =
    fromJsonLd.names[0] ??
    metaContent(html, 'og:title') ??
    metaContent(html, 'twitter:title') ??
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]).trim()
      : null) ??
    null;

  /*
   * Ordered by how reliably each source names the *product* image. og:image is what
   * the seller chose to represent the listing when it is shared, so it is the closest
   * thing to a declared primary image; JSON-LD is next; a raw <img> scan is the
   * fallback and will happily surface logos, so it goes last.
   */
  const ordered = [
    metaContent(html, 'og:image:secure_url'),
    metaContent(html, 'og:image'),
    metaContent(html, 'twitter:image'),
    ...fromJsonLd.images,
    ...imgSources(html, base),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  const imageUrls: string[] = [];
  for (const candidate of ordered) {
    let absolute: string;
    try {
      absolute = new URL(candidate, base).toString();
    } catch {
      continue;
    }
    if (!absolute.startsWith('https://')) continue;
    if (imageUrls.includes(absolute)) continue;
    imageUrls.push(absolute);
    if (imageUrls.length >= MAX_IMAGE_CANDIDATES) break;
  }

  const text = visibleText(html);
  const highlights = declarationHighlights(text, MAX_HIGHLIGHTS);

  const highlightBlock =
    highlights.length > 0
      ? `LINES ON THE LISTING THAT APPEAR TO CARRY MANDATORY DECLARATIONS:\n${highlights
          .map((line) => `- ${line}`)
          .join('\n')}\n\n`
      : '';

  const budget = Math.max(0, MAX_TEXT_CHARS - highlightBlock.length);
  const trimmed = text.length > budget ? `${text.slice(0, budget)}\n[…page text truncated]` : text;

  return {
    title: title && title.length > 0 ? title.slice(0, 300) : null,
    imageUrls,
    highlights,
    declarationText: `${highlightBlock}FULL VISIBLE TEXT OF THE LISTING PAGE:\n${trimmed}`.trim(),
    visibleTextLength: text.length,
  };
}
