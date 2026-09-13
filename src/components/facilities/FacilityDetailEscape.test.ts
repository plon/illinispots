import { describe, expect, it } from "bun:test";
import { shouldIgnoreEscapeForBack } from "./FacilityDetailPage";

const mockElement = (
  tagName: string,
  attributes: Record<string, string> = {},
) => {
  const element = {
    tagName: tagName.toUpperCase(),
    attributes,
    closest(query: string) {
      const matches = query.split(",").some((rawSelector) => {
        const selector = rawSelector.trim();
        const attributeSeparator = '="';
        const separatorIndex = selector.indexOf(attributeSeparator);

        if (
          selector.startsWith("[") &&
          selector.endsWith('"]') &&
          separatorIndex > 1
        ) {
          const name = selector.slice(1, separatorIndex);
          const value = selector.slice(
            separatorIndex + attributeSeparator.length,
            -2,
          );
          return attributes[name] === value;
        }

        return selector.toUpperCase() === element.tagName;
      });

      return matches ? element : null;
    },
  };

  return element;
};

describe("shouldIgnoreEscapeForBack", () => {
  it("ignores Escape from inputs and interactive containers", () => {
    const ignoredTargets = [
      mockElement("input"),
      mockElement("textarea"),
      mockElement("select"),
      mockElement("div", { contenteditable: "true" }),
      mockElement("div", { role: "dialog" }),
      mockElement("div", { role: "menu" }),
    ];

    for (const target of ignoredTargets) {
      expect(shouldIgnoreEscapeForBack(target)).toBe(true);
    }
  });

  it("allows Escape from ordinary content to go back", () => {
    expect(shouldIgnoreEscapeForBack(mockElement("div"))).toBe(false);
    expect(shouldIgnoreEscapeForBack(mockElement("body"))).toBe(false);
    expect(shouldIgnoreEscapeForBack(null)).toBe(false);
    expect(shouldIgnoreEscapeForBack(undefined)).toBe(false);
  });
});
