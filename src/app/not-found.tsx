import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-card">
        <p className="font-mono text-label uppercase tracking-wider text-ink-muted">Error 404</p>
        <h1 className="mt-2 text-h1 font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-body text-ink-secondary">
          That address does not exist in this application.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-9 items-center rounded-control bg-brand px-4 text-body font-medium text-ink-inverse transition-colors hover:bg-brand-hover"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
