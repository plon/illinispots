import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

mock.module("@posthog/react", () => ({
  usePostHog: () => ({ capture: () => {} }),
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module("@/contexts/DateTimeContext", () => ({
  useDateTimeContext: () => ({
    selectedDateTime: { date: "2026-09-13", time: "12:00:00" },
    setSelectedDateTime: () => {},
    isCurrentDateTime: false,
    resetToCurrentDateTime: () => {},
  }),
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DateTimeButton from "./DateTimeButton";

describe("DateTimeButton", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Test files share one process and some leave a bare global window
    // behind. Stub a complete one so SSR never depends on run order.
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { href: "http://localhost/" },
      matchMedia: (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("stays enabled during background fetching so time travel is never locked", () => {
    const html = renderToStaticMarkup(<DateTimeButton isFetching />);
    expect(html).toContain("Select date and time");
    expect(html).not.toContain("disabled=");
  });

  it("announces background fetching without disabling", () => {
    const html = renderToStaticMarkup(<DateTimeButton isFetching />);
    expect(html).toContain('aria-busy="true"');
  });
});
