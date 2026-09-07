'use client';

import { useEffect, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CardBody, CardFooter } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/field';
import type { ScanDetailDto } from '@/lib/api/dto';
import { apiFetch, errorMessage } from '@/lib/http';

const MAX_LENGTH = 4000;

/**
 * The officer's own observation.
 *
 * Amending the note clears the stored PDF, and the form says so up front rather than
 * silently invalidating a report the officer may already have downloaded. The next
 * download regenerates it from the extraction on file.
 */
export function OfficerNoteForm({
  scan,
  onSaved,
  readOnly = false,
}: {
  scan: ScanDetailDto;
  onSaved?: (scan: ScanDetailDto) => void;
  readOnly?: boolean;
}) {
  const [note, setNote] = useState(scan.officerNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Keep in step when the parent refreshes the scan (a retry, or a poll tick).
  useEffect(() => {
    setNote(scan.officerNote ?? '');
  }, [scan.officerNote]);

  const dirty = note.trim() !== (scan.officerNote ?? '').trim();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ scan: ScanDetailDto; reportInvalidated: boolean }>(
        `/api/scans/${scan.id}`,
        { method: 'PATCH', body: JSON.stringify({ officerNote: note.trim() || null }) },
      );
      onSaved?.(result.scan);
      setSavedAt(Date.now());
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save the note.'));
    } finally {
      setSaving(false);
    }
  }

  if (readOnly) {
    return (
      <CardBody>
        {scan.officerNote ? (
          <p className="whitespace-pre-wrap text-body text-ink">{scan.officerNote}</p>
        ) : (
          <p className="text-body italic text-ink-muted">No observation was recorded.</p>
        )}
        <p className="mt-3 text-label text-ink-muted">
          Only the officer who recorded this scan can amend the note.
        </p>
      </CardBody>
    );
  }

  return (
    <>
      <CardBody className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Field
          label="Observation"
          hint={`Reprinted verbatim in the PDF report. ${note.length}/${MAX_LENGTH} characters.`}
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_LENGTH))}
              rows={5}
              maxLength={MAX_LENGTH}
              // A real ellipsis character: JSX attribute values are literal strings,
              // so a "\u2026" escape would render as those six characters.
              placeholder="Where the sample was taken, how many units of the batch were on the shelf, anything the photograph does not show…"
            />
          )}
        </Field>
      </CardBody>

      <CardFooter className="justify-between">
        <p className="text-label text-ink-muted">
          {savedAt && !dirty
            ? 'Saved. The report will be rebuilt on next download.'
            : dirty
              ? 'Saving replaces the stored PDF report.'
              : 'No unsaved changes.'}
        </p>
        <Button type="button" onClick={save} loading={saving} disabled={!dirty}>
          Save note
        </Button>
      </CardFooter>
    </>
  );
}
