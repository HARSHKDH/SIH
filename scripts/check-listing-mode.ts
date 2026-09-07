/**
 * Temporary: prove that in listing mode a declaration published only in the page text is
 * recorded as present, with a null bounding box, and that it changes the rule outcome.
 *
 * The same image is run twice through the real extractor — once as a plain photograph,
 * once as a listing with page text — so any difference is attributable to the mode alone.
 *
 * The image is an imported smoked-salmon label that omits the country of origin and the
 * date of import. The listing text supplies both, as an e-commerce product page would.
 * Under Rule 6(10) those are declarations made, so the corresponding findings should
 * clear — and, critically, nothing should be invented that appears in neither source.
 */

// A standalone tsx run does not get Next.js's automatic .env loading, and without it
// GEMINI_API_KEY is empty, EXTRACTION_PROVIDER=auto resolves to `mock`, and the offline
// extractor returns a fixed archetype keyed off the image bytes — which looks exactly
// like "the prompt had no effect".
import 'dotenv/config';

import { readFile } from 'node:fs/promises';

import { extractLabelDeclarations, DECLARATION_KEYS } from '@/lib/extraction';
import { evaluateCompliance } from '@/lib/rules';

const IMAGE = 'public/samples/label-smoked-salmon.png';
const PRODUCT = 'Fjordline Smoked Atlantic Salmon 250 g';

const LISTING_TEXT = `E-COMMERCE LISTING CAPTURE
Listing URL: https://example-marketplace.test/p/fjordline-smoked-salmon-250g
Captured: 2026-09-06T00:00:00.000Z
Title as published: Fjordline Smoked Atlantic Salmon 250 g

LINES ON THE LISTING THAT APPEAR TO CARRY MANDATORY DECLARATIONS:
- Country of Origin: Norway
- Date of Import: 02/2026
- Imported and marketed by: Nordic Foods India Pvt Ltd, 42 Anna Salai, Chennai 600002
- Net weight 250 g
- MRP INR 640 (inclusive of all taxes)
- Consumer care: support@fjordline.example, toll-free 1800 111 2222

FULL VISIBLE TEXT OF THE LISTING PAGE:
Fjordline Smoked Atlantic Salmon 250 g
Country of Origin: Norway
Date of Import: 02/2026
Imported and marketed by: Nordic Foods India Pvt Ltd, 42 Anna Salai, Chennai 600002
Net weight 250 g
MRP INR 640 (inclusive of all taxes)
Consumer care: support@fjordline.example, toll-free 1800 111 2222
Free delivery by tomorrow. 4.5 stars from 812 ratings. Add to cart.`;

type Extraction = Awaited<ReturnType<typeof extractLabelDeclarations>>['extraction'];

function report(label: string, extraction: Extraction) {
  console.log(`\n=== ${label} ===`);
  for (const key of DECLARATION_KEYS) {
    const field = extraction[key];
    const where = !field.present
      ? 'absent'
      : field.bounding_box
        ? 'present [located in image]'
        : 'present [no bounding box]';
    console.log(
      `  ${key.padEnd(28)} ${where.padEnd(28)} ${field.value ? JSON.stringify(field.value).slice(0, 52) : ''}`,
    );
  }
  const compliance = evaluateCompliance(extraction, PRODUCT);
  console.log(
    `  -> score ${compliance.score}, ${compliance.violations.length} violation(s): ` +
      compliance.violations.map((v) => v.ruleCode).join(', '),
  );
  return { extraction, compliance };
}

async function main() {
  const { extractionProvider } = await import('@/lib/env');
  console.log(`extraction provider: ${extractionProvider}`);
  if (extractionProvider === 'mock') {
    console.log(
      'REFUSING TO RUN: the offline extractor ignores the prompt entirely, so this test ' +
        'would pass or fail for the wrong reason. Set GEMINI_API_KEY.',
    );
    process.exit(1);
  }

  const imageBytes = await readFile(IMAGE);

  const photo = await extractLabelDeclarations({ imageBytes, productName: PRODUCT });
  const asPhoto = report('AS A PHOTOGRAPH (image only)', photo.extraction);

  const listing = await extractLabelDeclarations({
    imageBytes,
    productName: PRODUCT,
    listingText: LISTING_TEXT,
  });
  const asListing = report('AS AN E-COMMERCE LISTING (image + page text)', listing.extraction);

  // -------------------------------------------------------------------------
  console.log('\n=== assertions ===');
  let failures = 0;
  const assert = (label: string, ok: boolean, detail = '') => {
    if (!ok) failures += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  };

  const origin = asListing.extraction.country_of_origin;

  assert(
    'the bare label declares no country of origin',
    !asPhoto.extraction.country_of_origin.present,
    `present=${asPhoto.extraction.country_of_origin.present}`,
  );
  assert(
    'the listing text supplies the country of origin',
    origin.present && /norway/i.test(origin.value ?? ''),
    `present=${origin.present} value=${JSON.stringify(origin.value)}`,
  );
  assert(
    'a text-sourced declaration carries no bounding box',
    !origin.present || origin.bounding_box === null,
    JSON.stringify(origin.bounding_box),
  );
  assert(
    'a text-sourced declaration carries no millimetre estimate',
    !origin.present || origin.font_size_mm_est === null,
    String(origin.font_size_mm_est),
  );
  assert(
    'the country-of-origin finding against the label is cleared by the listing',
    asPhoto.compliance.violations.some((v) => v.ruleCode === 'LM-PCR-6(1)-COO') &&
      !asListing.compliance.violations.some((v) => v.ruleCode === 'LM-PCR-6(1)-COO'),
  );
  assert(
    'listing mode scores better than the bare label',
    asListing.compliance.score > asPhoto.compliance.score,
    `photo=${asPhoto.compliance.score} listing=${asListing.compliance.score}`,
  );
  assert(
    'marketing copy was not mistaken for a declaration',
    !DECLARATION_KEYS.some((key) =>
      /delivery|ratings|stars|add to cart/i.test(asListing.extraction[key].value ?? ''),
    ),
  );
  assert(
    'nothing was invented that appears in neither the image nor the text',
    DECLARATION_KEYS.every((key) => {
      const field = asListing.extraction[key];
      if (!field.present || !field.value) return true;
      const probe = field.value.toLowerCase().replace(/\s+/g, ' ').slice(0, 12);
      const inText = LISTING_TEXT.toLowerCase().replace(/\s+/g, ' ').includes(probe);
      return inText || asPhoto.extraction[key].present;
    }),
  );
  assert(
    'the response was not truncated (valid JSON through to the assessment blocks)',
    typeof asListing.extraction.image_assessment.readable === 'boolean',
  );

  console.log(`\n${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
