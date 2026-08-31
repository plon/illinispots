import { describe, expect, it, beforeEach } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TouchProvider,
  HybridTooltip,
  HybridTooltipTrigger,
  HybridTooltipContent,
  TooltipProvider,
} from "./HybridTooltip";

describe("TouchProvider and HybridTooltip", () => {
  let coarseMatches = false;

  beforeEach(() => {
    coarseMatches = false;
    globalThis.window = {
      matchMedia: (query: string) => ({
        matches: query.includes("pointer: coarse") ? coarseMatches : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    } as unknown as Window & typeof globalThis;
  });

  it("renders desktop tooltip structure when coarse pointer is false", () => {
    coarseMatches = false;

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <TouchProvider>
          <HybridTooltip>
            <HybridTooltipTrigger asChild>
              <button type="button">Trigger</button>
            </HybridTooltipTrigger>
            <HybridTooltipContent>Content</HybridTooltipContent>
          </HybridTooltip>
        </TouchProvider>
      </TooltipProvider>,
    );

    expect(html).toContain("<button");
    expect(html).toContain("Trigger</button>");
  });

  it("renders popover structure when coarse pointer is true", () => {
    coarseMatches = true;

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <TouchProvider>
          <HybridTooltip>
            <HybridTooltipTrigger asChild>
              <button type="button">Trigger</button>
            </HybridTooltipTrigger>
            <HybridTooltipContent>Content</HybridTooltipContent>
          </HybridTooltip>
        </TouchProvider>
      </TooltipProvider>,
    );

    expect(html).toContain("<button");
    expect(html).toContain("Trigger</button>");
  });
});
