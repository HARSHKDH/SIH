/** Collapses whitespace and clips a label quotation to a readable length. */
export function truncate(value: string, max = 90): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}\u2026`;
}

/** Formats a millimetre measurement for a violation description. */
export function mm(value: number): string {
  return `${value.toFixed(value < 1 ? 2 : 1)} mm`;
}
