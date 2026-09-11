// Decision logic for the sidebar scroll container, kept pure so the
// contract stays unit-testable without a DOM.

export type SidebarScrollAction =
  | { readonly type: "reset" }
  | { readonly type: "restore"; readonly offset: number }
  | { readonly type: "none" };

// Opening a facility (from the list or another facility) always starts at
// the top. Returning to the list restores the saved list offset. Renders
// that stay on the list (search input, filters) leave scrolling alone.
export function resolveSidebarScrollTarget(
  prevFacilityId: string | null,
  nextFacilityId: string | null,
  savedListOffset: number,
): SidebarScrollAction {
  const wasList = prevFacilityId === null;
  const isList = nextFacilityId === null;

  if (!wasList && isList) {
    return { type: "restore", offset: savedListOffset };
  }
  if (!isList) {
    return { type: "reset" };
  }
  return { type: "none" };
}
