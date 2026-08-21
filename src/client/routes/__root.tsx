import { useEffect } from "react";
import {
  Outlet,
  createRootRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Sentry } from "@/client/observability";

function RootError({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          illiniSpots could not load this view. The error has been reported.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

export const Route = createRootRoute({
  component: Outlet,
  errorComponent: RootError,
  notFoundComponent: () => (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <a className="text-sm underline" href="/">
          Return to illiniSpots
        </a>
      </div>
    </main>
  ),
});
