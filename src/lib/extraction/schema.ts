import { z } from 'zod';

/**
 * The contract between the vision model and the rule engine.
 *
 * Everything downstream (rule clauses, Declaration rows, the PDF) is written
 * against this shape, so the model is *forced* to produce exactly this via
 * Anthropic tool-use rather than asked politely for "some JSON".
 */

// ---------------------------------------------------------------------------
// Zod validation (runtime guard on whatever the model returns)
// ---------------------------------------------------------------------------

export const boundingBoxSchema = z.object({
  /** Normalised 0–1 coordinates, origin at the top-left of the image. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const declarationFieldSchema = z.object({
  /** False means "this declaration is genuinely absent from the label". */
  present: z.boolean(),
  /** Verbatim text as printed. Null whenever `present` is false. */
  value: z.string().trim().min(1).nullable().catch(null),
  confidence: z.number().min(0).max(1).catch(0),
  bounding_box: boundingBoxSchema.nullable().catch(null),
  /** Estimated printed cap-height in millimetres — drives the Rule 9 checks. */
  font_size_mm_est: z.number().positive().max(200).nullable().catch(null),
  notes: z.string().nullable().catch(null),
});

export const relativeTextSizesSchema = z.object({
  principal_display_panel_area_cm2_est: z.number().positive().max(100000).nullable().catch(null),
  largest_text_height_mm_est: z.number().positive().max(200).nullable().catch(null),
  smallest_declaration_text_height_mm_est: z.number().positive().max(200).nullable().catch(null),
  /**
   * The model's own judgement on whether the smallest mandatory declaration is
   * too small to be read by a consumer with normal vision. Rule 9 is about
   * legibility, and a human-style judgement call is more faithful to it than a
   * pure millimetre threshold.
   */
  smallest_appears_illegible: z.boolean(),
  notes: z.string().nullable().catch(null),
});

export const imageAssessmentSchema = z.object({
  /** False for photos too blurry, dark or cropped to adjudicate. */
  readable: z.boolean(),
  /** Guards against someone photographing a receipt, a shelf, or a pet. */
  is_packaged_commodity_label: z.boolean(),
  issues: z.array(z.string()).max(12).catch([]),
  detected_languages: z.array(z.string()).max(8).catch([]),
});

export const labelExtractionSchema = z.object({
  manufacturer_name_address: declarationFieldSchema,
  net_quantity: declarationFieldSchema,
  mrp: declarationFieldSchema,
  mfg_date: declarationFieldSchema,
  consumer_care: declarationFieldSchema,
  country_of_origin: declarationFieldSchema,
  unit_sale_price: declarationFieldSchema,
  relative_text_sizes: relativeTextSizesSchema,
  image_assessment: imageAssessmentSchema,
  overall_notes: z.string().nullable().catch(null),
});

export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type DeclarationField = z.infer<typeof declarationFieldSchema>;
export type RelativeTextSizes = z.infer<typeof relativeTextSizesSchema>;
export type ImageAssessment = z.infer<typeof imageAssessmentSchema>;
export type LabelExtraction = z.infer<typeof labelExtractionSchema>;

/** The seven declaration keys, in the order they appear on the detail screen. */
export const DECLARATION_KEYS = [
  'manufacturer_name_address',
  'net_quantity',
  'mrp',
  'mfg_date',
  'consumer_care',
  'country_of_origin',
  'unit_sale_price',
] as const;

export type DeclarationKey = (typeof DECLARATION_KEYS)[number];

/** Maps the model's snake_case keys onto the Prisma `DeclarationType` enum. */
export const DECLARATION_KEY_TO_PRISMA_TYPE = {
  manufacturer_name_address: 'MANUFACTURER_NAME_ADDRESS',
  net_quantity: 'NET_QUANTITY',
  mrp: 'MRP',
  mfg_date: 'MFG_DATE',
  consumer_care: 'CONSUMER_CARE',
  country_of_origin: 'COUNTRY_OF_ORIGIN',
  unit_sale_price: 'UNIT_SALE_PRICE',
} as const satisfies Record<DeclarationKey, string>;

export type PrismaDeclarationType = (typeof DECLARATION_KEY_TO_PRISMA_TYPE)[DeclarationKey];

/** The inverse map, used when serialising Declaration rows back out to the UI. */
export const PRISMA_TYPE_TO_DECLARATION_KEY = Object.fromEntries(
  Object.entries(DECLARATION_KEY_TO_PRISMA_TYPE).map(([key, value]) => [value, key]),
) as Record<PrismaDeclarationType, DeclarationKey>;

/** Stable display order for the seven declarations. */
export const DECLARATION_ORDER: Record<DeclarationKey, number> = Object.fromEntries(
  DECLARATION_KEYS.map((key, index) => [key, index]),
) as Record<DeclarationKey, number>;

// ---------------------------------------------------------------------------
// JSON Schema handed to Anthropic as the tool input schema
// ---------------------------------------------------------------------------

function jsonDeclarationField(label: string, guidance: string) {
  return {
    type: 'object' as const,
    description: `${label}. ${guidance}`,
    properties: {
      /*
       * Worded to cover both kinds of inspection, and it has to be.
       *
       * These descriptions are handed to Gemini as `responseJsonSchema`, where they
       * constrain structured decoding more strongly than the prompt does. An earlier
       * version said "visible on the label in this image", which silently overrode the
       * e-commerce listing instructions in the user prompt: declarations published only
       * as page text came back absent no matter what the prompt said. The
       * no-invention guarantee is preserved — what changed is that captured listing
       * text now counts as evidence, which is what Rule 6(10) requires.
       */
      present: {
        type: 'boolean',
        description: `True only if ${label.toLowerCase()} is actually present in the evidence given — visible on the label in the image, or, when captured listing text has been supplied, stated in that text. Never true merely because such products usually declare it.`,
      },
      value: {
        type: ['string', 'null'],
        description:
          'The text exactly as printed on the label, or as published in the captured listing text, preserving units, currency symbols and punctuation. Null if not present or not legible.',
      },
      confidence: {
        type: 'number',
        description:
          'Your confidence that this reading is correct, from 0 to 1. Use a low value when the text is partly obscured.',
      },
      bounding_box: {
        type: ['object', 'null'],
        description:
          'Location of the text in normalised image coordinates (0-1), origin top-left. Null if not present, and null when the value was read from captured listing text rather than from the image.',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        required: ['x', 'y', 'width', 'height'],
        additionalProperties: false,
      },
      font_size_mm_est: {
        type: ['number', 'null'],
        description:
          'Estimated printed cap-height of this text in millimetres, inferred from the apparent physical size of the package. Null if you cannot estimate it, and null when the value was read from captured listing text, which has no printed height.',
      },
      notes: {
        type: ['string', 'null'],
        description: 'Short observation, e.g. "printed over a seam", "partially cut off". Null if nothing to note.',
      },
    },
    required: ['present', 'value', 'confidence', 'bounding_box', 'font_size_mm_est', 'notes'],
    additionalProperties: false,
  };
}

export const EXTRACTION_TOOL_NAME = 'record_label_declarations';

export const EXTRACTION_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    manufacturer_name_address: jsonDeclarationField(
      'Name and complete address of the manufacturer, packer or importer',
      'Capture the full block including street, city and PIN code if shown.',
    ),
    net_quantity: jsonDeclarationField(
      'Net quantity declaration',
      'Include the number and the unit exactly as printed, e.g. "500 g", "1 L", "20 N".',
    ),
    mrp: jsonDeclarationField(
      'Maximum retail price (MRP)',
      'Include the currency symbol and any "inclusive of all taxes" wording in the value.',
    ),
    mfg_date: jsonDeclarationField(
      'Date of manufacture, packing or import',
      'Capture as printed, e.g. "MFD 03/2026", "PKD JAN 2026".',
    ),
    consumer_care: jsonDeclarationField(
      'Consumer care details',
      'Name/designation, phone number, and/or email address for complaints.',
    ),
    country_of_origin: jsonDeclarationField(
      'Country of origin',
      'Mandatory for imported packages, commonly printed as "Made in ...".',
    ),
    unit_sale_price: jsonDeclarationField(
      'Unit sale price',
      'Price per standard unit, e.g. "Rs. 90 per kg". Distinct from MRP.',
    ),
    relative_text_sizes: {
      type: 'object' as const,
      description: 'Physical size assessment used to judge legibility of the declarations.',
      properties: {
        principal_display_panel_area_cm2_est: {
          type: ['number', 'null'],
          description: 'Estimated area of the principal display panel in square centimetres. Null if unclear.',
        },
        largest_text_height_mm_est: {
          type: ['number', 'null'],
          description: 'Cap-height in millimetres of the largest text on the panel (usually the brand name).',
        },
        smallest_declaration_text_height_mm_est: {
          type: ['number', 'null'],
          description: 'Cap-height in millimetres of the smallest of the mandatory declarations above.',
        },
        smallest_appears_illegible: {
          type: 'boolean',
          description:
            'True if the smallest mandatory declaration is too small or low-contrast for a consumer with normal vision to read comfortably at arm\u2019s length.',
        },
        notes: {
          type: ['string', 'null'],
          description: 'Brief reasoning for the legibility judgement. Null if nothing to add.',
        },
      },
      required: [
        'principal_display_panel_area_cm2_est',
        'largest_text_height_mm_est',
        'smallest_declaration_text_height_mm_est',
        'smallest_appears_illegible',
        'notes',
      ],
      additionalProperties: false,
    },
    image_assessment: {
      type: 'object' as const,
      description: 'Whether this image can be adjudicated at all.',
      properties: {
        readable: {
          type: 'boolean',
          description: 'False if the photo is too blurry, dark, glared or cropped to read the declarations.',
        },
        is_packaged_commodity_label: {
          type: 'boolean',
          description: 'False if this is not a photograph of a pre-packaged commodity label.',
        },
        issues: {
          type: 'array',
          items: { type: 'string' },
          description: 'Short tags for image problems, e.g. ["glare", "text cut off at the right edge"].',
        },
        detected_languages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Languages visible on the label, e.g. ["English", "Hindi"].',
        },
      },
      required: ['readable', 'is_packaged_commodity_label', 'issues', 'detected_languages'],
      additionalProperties: false,
    },
    overall_notes: {
      type: ['string', 'null'],
      description: 'One or two sentences an inspecting officer would find useful. Null if nothing to add.',
    },
  },
  required: [
    'manufacturer_name_address',
    'net_quantity',
    'mrp',
    'mfg_date',
    'consumer_care',
    'country_of_origin',
    'unit_sale_price',
    'relative_text_sizes',
    'image_assessment',
    'overall_notes',
  ],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Provider-specific shaping of the same canonical schema
// ---------------------------------------------------------------------------

type JsonSchemaNode = Record<string, unknown>;

/**
 * Rewrites `type: ["string", "null"]` unions as `anyOf: [{type:"string"},{type:"null"}]`.
 *
 * The schema above is written in standard JSON Schema, which Anthropic accepts
 * verbatim. Gemini's `responseJsonSchema` documents a *subset* of JSON Schema:
 * `anyOf` is explicitly supported, an array-valued `type` is not. Rather than
 * maintaining a second copy of a 150-line schema — which would inevitably drift —
 * the one canonical schema is mechanically converted here.
 *
 * Everything else passes through untouched, so adding a field to the schema above
 * needs no change in this function.
 */
export function toGeminiJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiJsonSchema);
  if (node === null || typeof node !== 'object') return node;

  const source = node as JsonSchemaNode;

  // Convert children first, so the rewrite below operates on finished sub-schemas.
  // `type` is left alone here because it is the thing being rewritten.
  const converted: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(source)) {
    converted[key] = key === 'type' ? value : toGeminiJsonSchema(value);
  }

  if (!Array.isArray(converted.type)) return converted;

  const types = converted.type.filter((entry): entry is string => typeof entry === 'string');

  // Sibling constraints (properties, items, required, …) belong on the non-null
  // branch; dropping them would widen the schema. `description` stays outside the
  // union so the field documentation is not duplicated per branch.
  const siblings: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(converted)) {
    if (key !== 'type' && key !== 'description') siblings[key] = value;
  }

  return {
    ...(converted.description !== undefined ? { description: converted.description } : {}),
    anyOf: types.map((entry) => (entry === 'null' ? { type: 'null' } : { type: entry, ...siblings })),
  };
}

/** The extraction schema in the dialect Gemini's `responseJsonSchema` accepts. */
export const GEMINI_EXTRACTION_SCHEMA = toGeminiJsonSchema(EXTRACTION_TOOL_SCHEMA);

/** An extraction with every field absent — used as the shape for fallbacks. */
export function emptyExtraction(reason: string): LabelExtraction {
  const absent: DeclarationField = {
    present: false,
    value: null,
    confidence: 0,
    bounding_box: null,
    font_size_mm_est: null,
    notes: null,
  };

  return {
    manufacturer_name_address: { ...absent },
    net_quantity: { ...absent },
    mrp: { ...absent },
    mfg_date: { ...absent },
    consumer_care: { ...absent },
    country_of_origin: { ...absent },
    unit_sale_price: { ...absent },
    relative_text_sizes: {
      principal_display_panel_area_cm2_est: null,
      largest_text_height_mm_est: null,
      smallest_declaration_text_height_mm_est: null,
      smallest_appears_illegible: false,
      notes: null,
    },
    image_assessment: {
      readable: false,
      is_packaged_commodity_label: false,
      issues: [reason],
      detected_languages: [],
    },
    overall_notes: reason,
  };
}
