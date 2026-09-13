import { describe, expect, it, mock } from "bun:test";

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
