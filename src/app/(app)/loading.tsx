/**
 * Route-level skeleton.
 *
 * Mirrors the common page shape — a heading, a row of stat cards, a table — so the
 * layout does not jump when the real content arrives. Purely decorative, hence
 * `aria-hidden`; the live region on the page itself announces the change.
 */
export default function AppLoading() {
  return (
    <div aria-hidden="true" className="animate-pulse-soft">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-64 rounded bg-line" />
        <div className="h-4 w-96 max-w-full rounded bg-line/70" />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="rounded-card border border-line bg-surface px-5 py-4">
            <div className="h-3 w-24 rounded bg-line" />
            <div className="mt-3 h-7 w-16 rounded bg-line" />
            <div className="mt-2 h-3 w-32 rounded bg-line/70" />
          </div>
        ))}
      </div>

      <div className="rounded-card border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <div className="h-4 w-40 rounded bg-line" />
        </div>
        <div className="divide-y divide-line">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4">
              <div className="h-4 flex-1 rounded bg-line/70" />
              <div className="h-5 w-20 rounded-pill bg-line" />
              <div className="h-4 w-12 rounded bg-line/70" />
              <div className="hidden h-4 w-28 rounded bg-line/70 sm:block" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading
      </span>
    </div>
  );
}
