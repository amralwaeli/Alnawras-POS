import React from 'react';
import * as Sentry from '@sentry/react';

/**
 * Initialise Sentry error tracking.
 *
 * No-op unless VITE_SENTRY_DSN is set, so the app runs identically with or
 * without a configured Sentry project. Errors-only (no performance tracing /
 * session replay) to stay light and comfortably inside the free tier.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0, // errors only — keeps us inside the free plan
    sendDefaultPii: false,
  });
}

/** Full-screen fallback shown instead of a blank white screen when the UI crashes. */
function CrashScreen({ resetError }: { resetError: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-gray-600">
        The screen hit an unexpected error. Your data is safe — try again, or reload the app.
      </p>
      <div className="flex gap-3">
        <button
          onClick={resetError}
          className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm active:scale-95"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 active:scale-95"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

/**
 * Wrap the app so any render crash is caught (and reported to Sentry when a DSN
 * is configured) instead of leaving the user staring at a white screen.
 */
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <CrashScreen resetError={resetError} />}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
