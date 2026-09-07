'use client';

import { useState } from 'react';

import { PlusIcon } from '@/components/layout/icons';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { CellStack, TableWrap, Td, Th } from '@/components/ui/table';
import type { AdminUserDto } from '@/lib/api/dto';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { formatDate, formatRelative } from '@/lib/format';
import { apiFetch, errorMessage, fieldErrors } from '@/lib/http';
import { ROLE_LABEL } from '@/lib/labels';

/**
 * Officer account management.
 *
 * Accounts are deactivated, never deleted: `Scan.userId` cascades, so removing an
 * officer would erase their entire inspection history along with them. Deactivation
 * revokes access on the next request (the session check re-reads `isActive`) while
 * leaving the audit trail intact — which is the behaviour a record-keeping system
 * has to have.
 *
 * The server refuses to let an admin lock the department out of its own tool
 * (no self-deactivation, no self-demotion, no removing the last active admin); those
 * refusals surface here as plain error messages rather than being pre-empted in the
 * UI, so the guarantee lives in one place.
 */
export function OfficerRoster({ initialUsers }: { initialUsers: AdminUserDto[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [showCreate, setShowCreate] = useState(initialUsers.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function replace(updated: AdminUserDto) {
    setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
  }

  async function patch(id: string, body: Record<string, unknown>, successMessage: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ user: AdminUserDto }>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      replace(result.user);
      setNotice(successMessage);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update that account.'));
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(user: AdminUserDto) {
    const next = window.prompt(
      `Set a new password for ${user.name} (minimum ${PASSWORD_MIN_LENGTH} characters).\n\nShare it with them over a channel you trust — it is not emailed.`,
    );
    if (next === null) return;
    if (next.length < PASSWORD_MIN_LENGTH) {
      setError(`The password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    await patch(user.id, { password: next }, `Password reset for ${user.name}.`);
  }

  return (
    <Card>
      <CardHeader
        title="Officer accounts"
        description={`${users.filter((user) => user.isActive).length} active of ${users.length}`}
        as="h3"
        actions={
          <Button
            type="button"
            variant={showCreate ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setShowCreate((open) => !open)}
          >
            {showCreate ? (
              'Cancel'
            ) : (
              <>
                <PlusIcon className="h-3.5 w-3.5" />
                Add officer
              </>
            )}
          </Button>
        }
      />

      {(error || notice) && (
        <CardBody className="pb-0">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {notice && !error ? <Alert tone="success">{notice}</Alert> : null}
        </CardBody>
      )}

      {showCreate ? (
        <CreateOfficerForm
          onCreated={(user) => {
            setUsers((current) => [...current, user]);
            setShowCreate(false);
            setNotice(`Account created for ${user.name}.`);
            setError(null);
          }}
        />
      ) : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>Officer</Th>
            <Th>Role</Th>
            <Th>Posting</Th>
            <Th align="right">Scans</Th>
            <Th>Last sign-in</Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const busy = busyId === user.id;

            return (
              <tr key={user.id} className={user.isActive ? undefined : 'opacity-60'}>
                <Td>
                  <CellStack primary={user.name} secondary={user.email} />
                  {!user.isActive ? (
                    <Badge tone="critical" className="mt-1.5">
                      Deactivated
                    </Badge>
                  ) : null}
                </Td>

                <Td>
                  <Select
                    aria-label={`Role for ${user.name}`}
                    value={user.role}
                    disabled={busy}
                    onChange={(event) =>
                      patch(
                        user.id,
                        { role: event.target.value },
                        `${user.name} is now ${ROLE_LABEL[event.target.value as 'OFFICER' | 'ADMIN']}.`,
                      )
                    }
                    className="h-9 w-40 text-label"
                  >
                    <option value="OFFICER">Officer</option>
                    <option value="ADMIN">Administrator</option>
                  </Select>
                </Td>

                <Td>
                  <CellStack
                    primary={
                      <span className="font-normal text-ink-secondary">
                        {user.designation ?? '—'}
                      </span>
                    }
                    secondary={user.jurisdiction ?? 'No jurisdiction recorded'}
                  />
                </Td>

                <Td align="right">
                  <span className="text-body font-semibold tabular-nums text-ink">
                    {user.scanCount}
                  </span>
                </Td>

                <Td>
                  <CellStack
                    primary={
                      <span className="font-normal text-ink-secondary">
                        {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never'}
                      </span>
                    }
                    secondary={`Added ${formatDate(user.createdAt)}`}
                  />
                </Td>

                <Td align="right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => resetPassword(user)}
                    >
                      Reset password
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      onClick={() =>
                        patch(
                          user.id,
                          { isActive: !user.isActive },
                          user.isActive
                            ? `${user.name} deactivated. Access is revoked immediately.`
                            : `${user.name} reactivated.`,
                        )
                      }
                    >
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CreateOfficerForm({ onCreated }: { onCreated: (user: AdminUserDto) => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'OFFICER',
    designation: '',
    jurisdiction: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setErrors({});

    try {
      const result = await apiFetch<{ user: AdminUserDto }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          designation: form.designation || null,
          jurisdiction: form.jurisdiction || null,
        }),
      });
      onCreated(result.user);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create the account.'));
      setErrors(fieldErrors(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="border-b border-line bg-surface-muted px-4 py-4 sm:px-5">
      {error ? (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Full name" error={errors.name} required>
          {({ id, invalid }) => (
            <Input
              id={id}
              aria-invalid={invalid || undefined}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="A. Ramaswamy"
              required
            />
          )}
        </Field>

        <Field label="Email address" error={errors.email} required>
          {({ id, invalid }) => (
            <Input
              id={id}
              aria-invalid={invalid || undefined}
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="officer@legalmetrology.gov.in"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          )}
        </Field>

        <Field
          label="Initial password"
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. Share it over a channel you trust.`}
          required
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              type="text"
              value={form.password}
              onChange={(event) => set('password', event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
            />
          )}
        </Field>

        <Field label="Role">
          {({ id }) => (
            <Select id={id} value={form.role} onChange={(event) => set('role', event.target.value)}>
              <option value="OFFICER">Officer</option>
              <option value="ADMIN">Administrator</option>
            </Select>
          )}
        </Field>

        <Field label="Designation" hint="Optional. Printed on reports.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={form.designation}
              onChange={(event) => set('designation', event.target.value)}
              placeholder="Inspector, Circle III"
            />
          )}
        </Field>

        <Field label="Jurisdiction" hint="Optional. Printed on reports.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={form.jurisdiction}
              onChange={(event) => set('jurisdiction', event.target.value)}
              placeholder="Coimbatore District"
            />
          )}
        </Field>
      </div>

      <div className="mt-3.5 flex justify-end">
        <Button type="submit" loading={submitting}>
          Create account
        </Button>
      </div>
    </form>
  );
}
