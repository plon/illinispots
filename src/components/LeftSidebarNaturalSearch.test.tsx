import { describe, expect, it, mock } from "bun:test";

mock.module("@posthog/react", () => ({
  usePostHog: () => ({ capture: () => {} }),
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NaturalSearchPrompt } from "./LeftSidebar";

describe("NaturalSearchPrompt", () => {
  it("offers a clear action on ambiguous times instead of a dead end", () => {
    const html = renderToStaticMarkup(
      <NaturalSearchPrompt
        interpretation={{
          locationQuery: "CIF",
          temporalText: "2",
          dateTime: null,
          error: "ambiguous-time",
        }}
        onApply={() => {}}
        onClear={() => {}}
      />,
    );
    expect(html).toContain("Add AM or PM");
    expect(html).toContain("Clear search");
    expect(html).toContain("CIF");
  });

  it("confirms the time before applying a valid temporal search", () => {
    const html = renderToStaticMarkup(
      <NaturalSearchPrompt
        interpretation={{
          locationQuery: "CIF",
          temporalText: "tomorrow at 2 pm",
          dateTime: { date: "2026-09-14", time: "14:00:00" },
          error: null,
        }}
        onApply={() => {}}
        onClear={() => {}}
      />,
    );
    expect(html).toContain("Search this time");
  });
});
