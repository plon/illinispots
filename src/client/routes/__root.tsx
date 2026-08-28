import { useEffect } from "react";
import { PostHogProvider, usePostHog } from "@posthog/react";
import {
  Outlet,
  createRootRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { getClientConfig } from "@/client/config";
import { Sentry } from "@/client/observability";

function RootError({ error, reset }: ErrorComponentProps) {
  const posthog = usePostHog();

  useEffect(() => {
    Sentry.captureException(error);
    posthog.captureException(error);
  }, [error, posthog]);

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

function RootComponent() {
  const config = getClientConfig();

  if (!config.posthogProjectToken || !config.posthogHost) {
    if (import.meta.env.DEV) {
      const variableName = !config.posthogProjectToken
        ? "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN"
        : "VITE_PUBLIC_POSTHOG_HOST";
      throw new Error(
        `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`,
      );
    }

    return <Outlet />;
  }

  return (
    <PostHogProvider
      apiKey={config.posthogProjectToken}
      options={{
        api_host: config.posthogHost,
        defaults: "2026-01-30",
        capture_exceptions: true,
        debug: import.meta.env.DEV,
      }}
    >
      <Outlet />
    </PostHogProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
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
