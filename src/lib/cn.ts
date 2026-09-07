import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Custom font sizes from `tailwind.config.ts`.
 *
 * This list is the whole reason `extendTailwindMerge` is used instead of the plain
 * `twMerge`. tailwind-merge resolves a `text-*` class by checking the value against
 * the known font-size scale: anything it recognises is a font size, anything else is a
 * text colour. It knows nothing about a bespoke theme, so `text-body` looked like a
 * *colour* — putting it in the same conflict group as `text-ink-inverse`, where only
 * the last one survives.
 *
 * The practical effect was a real bug: `buttonClasses()` applies the variant
 * (`bg-brand text-ink-inverse`) before the size (`text-body`), so the white text was
 * silently stripped and every primary button rendered near-black text on the deep
 * slate background — a contrast ratio of 1.42, effectively invisible.
 *
 * Declaring the scale here puts font sizes and text colours back in separate groups,
 * so both survive a merge. Any font size added to the Tailwind theme must be added
 * here too.
 */
const CUSTOM_FONT_SIZES = [
  'micro',
  'label',
  'body',
  'body-lg',
  'h3',
  'h2',
  'h1',
  'stat',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...CUSTOM_FONT_SIZES] }],
    },
  },
});

/**
 * Conditional class names with Tailwind conflict resolution.
 *
 * `clsx` handles the conditionals; `twMerge` makes sure a caller-supplied `className`
 * actually wins over a component's default (so `px-4` passed into a button that
 * defaults to `px-3` replaces it rather than fighting it in the stylesheet).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
