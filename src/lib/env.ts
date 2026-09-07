import { z } from 'zod';

/**
 * Central, validated view of the process environment.
 *
 * Design note: everything is optional-with-default at parse time so that
 * `next build` (which evaluates module graphs without a real environment) never
 * explodes. Values that genuinely cannot be defaulted are fetched through the
 * `require*` helpers at the bottom, which throw a precise, actionable error at
 * the exact moment they are needed.
 */

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const intish = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const parsed = Number.parseInt(v ?? '', 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // Extraction provider. Left empty, the provider is inferred from whichever key
  // is present (Gemini wins if both are), so the common case needs no config.
  EXTRACTION_PROVIDER: z.enum(['gemini', 'claude', 'mock', 'auto']).default('auto'),

  // --- Google Gemini (default provider) ---
  GEMINI_API_KEY: z.string().default(''),
  /**
   * Primary vision model.
   *
   * Deliberately *not* the newest flagship. `gemini-3.8-flash` is the most
   * capacity-constrained model on the free tier and returned 503 "this model is
   * currently experiencing high demand" repeatedly in testing, costing ~30 seconds per
   * scan before failover. `gemini-3.5-flash` is generally available, answered every
   * probe in under four seconds, and transcribes a label just as accurately — label OCR
   * does not need frontier reasoning.
   */
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  /**
   * Models to fall back to when the primary answers 503 "high demand" or 429.
   * Ordered cheapest/fastest first, with the flagship last as a long-shot.
   */
  GEMINI_FALLBACK_MODELS: z.string().default('gemini-3.5-flash-lite,gemini-3.8-flash'),
  /**
   * Output ceiling for one extraction.
   *
   * 8192 rather than 4096. The response carries seven declaration fields of six
   * properties each plus two assessment blocks, and a truncated response is not a
   * degraded answer — it is invalid JSON, so the scan fails outright. An e-commerce
   * listing scan writes a note on more fields than a photograph does and was the case
   * that first overran 4096. Headroom here costs nothing: billing is on tokens actually
   * produced, not on the ceiling.
   */
  GEMINI_MAX_OUTPUT_TOKENS: intish(8192),

  // --- Anthropic Claude (alternative provider) ---
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MAX_TOKENS: intish(2048),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('./storage'),

  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().default(''),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  AWS_S3_ENDPOINT: z.string().default(''),
  AWS_S3_FORCE_PATH_STYLE: booleanish,

  APP_BASE_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Legal Metrology Compliance Checker'),

  WORKER_CONCURRENCY: intish(3),
  SCAN_JOB_ATTEMPTS: intish(3),

  PUPPETEER_EXECUTABLE_PATH: z.string().default(''),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  // Should be unreachable given every field has a default, but never let a
  // malformed environment take the whole process down silently.
  console.warn(
    '[env] Environment validation produced issues, falling back to defaults:',
    parsed.error.flatten().fieldErrors,
  );
  return envSchema.parse({});
}

export const env = loadEnv();

export type Env = typeof env;

// ---------------------------------------------------------------------------
// Derived flags
// ---------------------------------------------------------------------------

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

export const hasGeminiKey = env.GEMINI_API_KEY.trim().length > 0;
export const hasAnthropicKey = env.ANTHROPIC_API_KEY.trim().length > 0;

/** Which vision provider actually performs extraction. */
export type ExtractionProvider = 'gemini' | 'claude' | 'mock';

/**
 * Resolves the extraction provider.
 *
 * `EXTRACTION_PROVIDER` pins it explicitly; otherwise it is inferred from whichever
 * key is configured, with Gemini taking precedence. When no key is present at all
 * the pipeline degrades to deterministic mock extraction so the queue, rule engine
 * and PDF report remain fully demonstrable offline — the substitution is confined to
 * the vision call and is surfaced in the UI rather than hidden.
 */
function resolveExtractionProvider(): ExtractionProvider {
  switch (env.EXTRACTION_PROVIDER) {
    case 'mock':
      return 'mock';
    case 'gemini':
      return hasGeminiKey ? 'gemini' : 'mock';
    case 'claude':
      return hasAnthropicKey ? 'claude' : 'mock';
    default:
      if (hasGeminiKey) return 'gemini';
      if (hasAnthropicKey) return 'claude';
      return 'mock';
  }
}

export const extractionProvider: ExtractionProvider = resolveExtractionProvider();

/** True when a real vision API will be called (i.e. not the offline extractor). */
export const hasVisionProvider = extractionProvider !== 'mock';

/** Model identifier for the active provider, for display and for the PDF report. */
export const extractionModel =
  extractionProvider === 'gemini'
    ? env.GEMINI_MODEL
    : extractionProvider === 'claude'
      ? env.ANTHROPIC_MODEL
      : 'mock-extractor';

export const EXTRACTION_PROVIDER_LABEL: Record<ExtractionProvider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  mock: 'Offline extractor',
};

/** Primary model first, then each configured fallback, de-duplicated. */
export function geminiModelChain(): string[] {
  const fallbacks = env.GEMINI_FALLBACK_MODELS.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set([env.GEMINI_MODEL, ...fallbacks])];
}

/**
 * S3 is only considered usable when the driver is selected *and* the bucket and
 * credentials are present. Otherwise we silently degrade to local disk, which
 * is the behaviour the brief asks for.
 */
export const s3IsConfigured =
  env.STORAGE_DRIVER === 's3' &&
  env.AWS_S3_BUCKET.length > 0 &&
  env.AWS_ACCESS_KEY_ID.length > 0 &&
  env.AWS_SECRET_ACCESS_KEY.length > 0;

export const activeStorageDriver: 'local' | 's3' = s3IsConfigured ? 's3' : 'local';

// ---------------------------------------------------------------------------
// Hard requirements, checked lazily
// ---------------------------------------------------------------------------

const MIN_SECRET_LENGTH = 32;

export function requireJwtSecret(): string {
  const secret = env.JWT_SECRET.trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return secret;
}

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Point it at your PostgreSQL instance.');
  }
  return env.DATABASE_URL;
}

export function requireGeminiKey(): string {
  if (!hasGeminiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set, cannot call the vision API. Get a key at https://aistudio.google.com/apikey',
    );
  }
  return env.GEMINI_API_KEY;
}

export function requireAnthropicKey(): string {
  if (!hasAnthropicKey) {
    throw new Error('ANTHROPIC_API_KEY is not set, cannot call the vision API.');
  }
  return env.ANTHROPIC_API_KEY;
}
