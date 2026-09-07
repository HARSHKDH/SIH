import { DECLARATION_KEYS, type BoundingBox } from '@/lib/extraction/schema';
import { DECLARATION_LABEL_INLINE } from '@/lib/labels';

import type { RuleClause, RuleContext } from '../types';

/**
 * Rule 6(2) — the mandatory declarations shall be grouped together and given at one
 * place on the package.
 *
 * This is the only clause that judges *where* declarations sit rather than whether they
 * exist, and the bounding boxes returned for every declaration are what make it
 * possible. A compliant pack keeps its mandatory block in one contiguous region; a
 * non-compliant one strands the MRP on the front, the address in a side gusset and the
 * consumer care on the back, so a shopper cannot find them together.
 *
 * Two complementary tests, because "not grouped" has two distinct geometries:
 *
 *   A. **Separation** — one declaration exiled from the block the others form.
 *      Measured leave-one-out: the reference block is built from the *other*
 *      declarations, so the suspect cannot drag the reference towards itself. (An
 *      earlier mean-plus-sigma version was silently useless for exactly that reason:
 *      the outlier inflated both the mean and the deviation, making its own threshold
 *      unreachable.)
 *
 *   B. **Dispersion** — declarations spread thinly across a large area rather than
 *      exiled individually. Measured as how much of the region they span is actually
 *      covered by declaration text. A tight block fills roughly half its own bounding
 *      region; text flung to the corners fills a small fraction of it.
 *
 * Both are deliberately conservative. A photograph is a flat projection of a
 * three-dimensional pack, so apparent distance is not proof of a separate panel — the
 * finding is MINOR and names the specific declaration so the officer verifies a
 * concrete claim against the package rather than trusting an opaque score.
 */

/** Below this many located declarations there is not enough signal to judge grouping. */
const MIN_LOCATED_DECLARATIONS = 4;

/**
 * Test A: how far outside the others' block a declaration must sit, as a fraction of
 * the image. 0.25 is a quarter of the frame — a gap that reads as a different panel
 * rather than ordinary spacing.
 */
const SEPARATION_THRESHOLD = 0.25;

/**
 * Test B: minimum share of the spanned region that declaration text must cover.
 * Calibrated against real layouts — a tidy mandatory block measures around 0.5, while
 * declarations scattered to the corners fall below 0.10.
 */
const MIN_COVERAGE_RATIO = 0.15;

/** Only apply the dispersion test once declarations span a substantial area. */
const MIN_SPANNED_AREA = 0.3;

interface Located {
  label: string;
  box: BoundingBox;
  centreX: number;
  centreY: number;
}

function locatedDeclarations(ctx: RuleContext): Located[] {
  return DECLARATION_KEYS.flatMap((key) => {
    const field = ctx.extraction[key];
    const box = field.bounding_box;
    if (!field.present || !box) return [];

    return [
      {
        label: DECLARATION_LABEL_INLINE[key],
        box,
        centreX: box.x + box.width / 2,
        centreY: box.y + box.height / 2,
      },
    ];
  });
}

interface Region {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundingRegion(items: Located[]): Region {
  return {
    minX: Math.min(...items.map((d) => d.box.x)),
    minY: Math.min(...items.map((d) => d.box.y)),
    maxX: Math.max(...items.map((d) => d.box.x + d.box.width)),
    maxY: Math.max(...items.map((d) => d.box.y + d.box.height)),
  };
}

/** Euclidean distance from a point to a rectangle; zero when the point is inside. */
function distanceToRegion(x: number, y: number, region: Region): number {
  const dx = Math.max(region.minX - x, 0, x - region.maxX);
  const dy = Math.max(region.minY - y, 0, y - region.maxY);
  return Math.hypot(dx, dy);
}

export const rule6_2_declarationsGrouped: RuleClause = {
  code: 'LM-PCR-6(2)',
  title: 'Declarations grouped together at one place',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(2): the declarations required under Rule 6(1) shall be grouped together and given at one place on the package.',
  weight: 5,
  appliesTo: (ctx) => locatedDeclarations(ctx).length >= MIN_LOCATED_DECLARATIONS,
  evaluate: (ctx) => {
    const located = locatedDeclarations(ctx);
    if (located.length < MIN_LOCATED_DECLARATIONS) return null;

    // ---- Test A: individually separated declarations (leave-one-out) ----
    const separated = located
      .map((candidate) => {
        const others = located.filter((other) => other !== candidate);
        const gap = distanceToRegion(candidate.centreX, candidate.centreY, boundingRegion(others));
        return { label: candidate.label, gap };
      })
      .filter((entry) => entry.gap > SEPARATION_THRESHOLD)
      .sort((a, b) => b.gap - a.gap);

    if (separated.length > 0) {
      const named = separated.map((entry) => entry.label).join(', ');
      const single = separated.length === 1;

      return {
        ruleCode: 'LM-PCR-6(2)',
        ruleTitle: 'Declarations grouped together at one place',
        description:
          `The mandatory declarations are not grouped in one place. The ${named} ` +
          `${single ? 'declaration sits' : 'declarations sit'} well away from the block formed by ` +
          `the others (roughly ${Math.round(separated[0].gap * 100)}% of the panel away), so a ` +
          `consumer would not find the declarations together as Rule 6(2) requires.`,
        severity: 'MINOR',
        suggestedAction:
          'Verify against the package whether the separated declaration is on a different panel. If it is, require the artwork to bring all mandatory declarations into a single contiguous block.',
      };
    }

    // ---- Test B: thinly dispersed across a large area ----
    const region = boundingRegion(located);
    const spannedArea = (region.maxX - region.minX) * (region.maxY - region.minY);
    if (spannedArea < MIN_SPANNED_AREA) return null;

    const coveredArea = located.reduce((sum, d) => sum + d.box.width * d.box.height, 0);
    const coverage = coveredArea / spannedArea;
    if (coverage >= MIN_COVERAGE_RATIO) return null;

    return {
      ruleCode: 'LM-PCR-6(2)',
      ruleTitle: 'Declarations grouped together at one place',
      description:
        `The mandatory declarations are scattered rather than grouped: they span roughly ` +
        `${Math.round(spannedArea * 100)}% of the panel but the declaration text itself covers only ` +
        `about ${Math.round(coverage * 100)}% of that area. Rule 6(2) requires them to be given ` +
        `together at one place.`,
      severity: 'MINOR',
      suggestedAction:
        'Require the artwork to consolidate the mandatory declarations into a single contiguous block on one panel, rather than distributing them around the package.',
    };
  },
};
