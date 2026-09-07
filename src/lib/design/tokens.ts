/**
 * The palette as plain values.
 *
 * Tailwind covers the app UI, but two consumers need raw hex: the Puppeteer
 * report template (inline CSS, no build step) and the Recharts components on the
 * admin screen. Keeping one source of truth here is what stops the PDF from
 * slowly drifting away from the screen it was printed from.
 */
export const palette = {
  brand: '#1E3A5F',
  brandHover: '#2C5282',
  brandMuted: '#EDF1F7',

  canvas: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceMuted: '#FBFCFD',

  ink: '#1A202C',
  inkSecondary: '#4A5568',
  inkMuted: '#718096',
  inkInverse: '#FFFFFF',

  line: '#E2E8F0',
  lineStrong: '#CBD5E0',

  compliant: '#2F6E4E',
  compliantSoft: '#EAF2ED',
  compliantBorder: '#C3DACB',

  moderate: '#B7791F',
  moderateSoft: '#FAF3E6',
  moderateBorder: '#EBD9B4',

  critical: '#9B2C2C',
  criticalSoft: '#F7EBEB',
  criticalBorder: '#E6C6C6',

  neutral: '#718096',
  neutralSoft: '#F1F3F6',
  neutralBorder: '#DDE2E9',
} as const;

export type RuleSeverityKey = 'CRITICAL' | 'MODERATE' | 'MINOR';

/** Severity -> colour trio. MINOR deliberately uses the neutral slate, not amber. */
export const severityPalette: Record<
  RuleSeverityKey,
  { fg: string; bg: string; border: string; label: string }
> = {
  CRITICAL: {
    fg: palette.critical,
    bg: palette.criticalSoft,
    border: palette.criticalBorder,
    label: 'Critical',
  },
  MODERATE: {
    fg: palette.moderate,
    bg: palette.moderateSoft,
    border: palette.moderateBorder,
    label: 'Moderate',
  },
  MINOR: {
    fg: palette.neutral,
    bg: palette.neutralSoft,
    border: palette.neutralBorder,
    label: 'Minor',
  },
};

export type ComplianceBandKey = 'COMPLIANT' | 'MINOR_ISSUES' | 'NON_COMPLIANT' | 'SERIOUS';

export const bandPalette: Record<
  ComplianceBandKey,
  { fg: string; bg: string; border: string; label: string }
> = {
  COMPLIANT: {
    fg: palette.compliant,
    bg: palette.compliantSoft,
    border: palette.compliantBorder,
    label: 'Compliant',
  },
  MINOR_ISSUES: {
    fg: palette.moderate,
    bg: palette.moderateSoft,
    border: palette.moderateBorder,
    label: 'Minor issues',
  },
  NON_COMPLIANT: {
    fg: palette.critical,
    bg: palette.criticalSoft,
    border: palette.criticalBorder,
    label: 'Non-compliant',
  },
  SERIOUS: {
    fg: palette.critical,
    bg: palette.criticalSoft,
    border: palette.criticalBorder,
    label: 'Seriously non-compliant',
  },
};

/** Ordered series colours for the admin charts — muted, never neon. */
export const chartSeries = [
  palette.brand,
  palette.brandHover,
  palette.moderate,
  palette.critical,
  palette.compliant,
  palette.inkMuted,
] as const;

export const fontStack =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
