'use client';

import { useId, useState } from 'react';

import { CameraIcon, LinkIcon } from '@/components/layout/icons';
import { ListingScanForm } from '@/components/scans/listing-scan-form';
import { NewScanForm } from '@/components/scans/new-scan-form';
import { cn } from '@/lib/cn';

type Mode = 'photograph' | 'listing';

const MODES: ReadonlyArray<{
  key: Mode;
  label: string;
  hint: string;
  Icon: typeof CameraIcon;
}> = [
  {
    key: 'photograph',
    label: 'Photograph a pack',
    hint: 'A physical package in a shop or godown',
    Icon: CameraIcon,
  },
  {
    key: 'listing',
    label: 'E-commerce listing',
    hint: 'A product page offered for sale online',
    Icon: LinkIcon,
  },
];

/**
 * Chooses between the two kinds of subject an inspection can have.
 *
 * A tablist rather than two separate pages: an officer working a market visit switches
 * between a shelf in front of them and the same product listed online, and the choice is
 * about what is being inspected, not about which part of the application to visit. Both
 * paths converge on the same queue, rule engine and report, so presenting them as one
 * screen with two modes is also the honest description of what the system does.
 */
export function ScanIntake() {
  const [mode, setMode] = useState<Mode>('photograph');
  const baseId = useId();

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="What are you inspecting?"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {MODES.map(({ key, label, hint, Icon }) => {
          const selected = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${key}`}
              onClick={() => setMode(key)}
              className={cn(
                'flex items-start gap-3 rounded-card border px-4 py-3 text-left transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                selected
                  ? 'border-brand bg-brand-muted'
                  : 'border-line bg-surface hover:border-line-strong hover:bg-surface-muted',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill',
                  selected ? 'bg-brand text-ink-inverse' : 'bg-surface-muted text-ink-muted',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-body font-medium',
                    selected ? 'text-brand' : 'text-ink',
                  )}
                >
                  {label}
                </span>
                <span className="block text-label text-ink-secondary">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        Each panel is unmounted when not selected rather than hidden. That resets a
        half-filled form on switching, which is the behaviour that avoids the real
        hazard here: submitting a URL while a photograph is still selected, or the
        reverse.
      */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${mode}`}
        aria-labelledby={`${baseId}-tab-${mode}`}
      >
        {mode === 'photograph' ? <NewScanForm /> : <ListingScanForm />}
      </div>
    </div>
  );
}
