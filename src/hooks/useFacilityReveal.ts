import { useCallback, useEffect, useState } from "react";
import type { FacilityAccordionGroup } from "@/types";

export interface FacilityRevealEnvironment {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frameId: number) => void;
  setFallback: (callback: () => void, delay: number) => number;
  clearFallback: (fallbackId: number) => void;
  prefersReducedMotion: () => boolean;
}

const browserEnvironment: FacilityRevealEnvironment = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (frameId) => cancelAnimationFrame(frameId),
  setFallback: (callback, delay) => window.setTimeout(callback, delay),
  clearFallback: (fallbackId) => window.clearTimeout(fallbackId),
  prefersReducedMotion: () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

interface PendingReveal {
  group: FacilityAccordionGroup;
  facilityId: string;
  cancel: () => void;
}

export interface FacilityRevealController {
  registerFacility: (
    group: FacilityAccordionGroup,
    facilityId: string,
    element: HTMLDivElement | null,
  ) => void;
  revealFacility: (
    group: FacilityAccordionGroup,
    facilityId: string,
    waitForExpansion: boolean,
    viewport: HTMLDivElement,
  ) => void;
  dispose: () => void;
}

export const createFacilityRevealController = (
  environment: FacilityRevealEnvironment = browserEnvironment,
): FacilityRevealController => {
  const facilityElements: Record<
    FacilityAccordionGroup,
    Map<string, HTMLDivElement>
  > = {
    library: new Map(),
    building: new Map(),
  };
  let pendingReveal: PendingReveal | null = null;

  const registerFacility = (
    group: FacilityAccordionGroup,
    facilityId: string,
    element: HTMLDivElement | null,
  ) => {
    if (element) {
      facilityElements[group].set(facilityId, element);
    } else {
      facilityElements[group].delete(facilityId);
    }
  };

  const revealFacility = (
    group: FacilityAccordionGroup,
    facilityId: string,
    waitForExpansion: boolean,
    viewport: HTMLDivElement,
  ) => {
    if (
      pendingReveal?.group === group &&
      pendingReveal.facilityId === facilityId
    ) {
      return;
    }

    pendingReveal?.cancel();

    const element = facilityElements[group].get(facilityId);
    if (!element) return;

    const prefersReducedMotion = environment.prefersReducedMotion();
    let frameId: number | null = null;
    let fallbackId: number | null = null;
    let handleAnimationEnd: (() => void) | null = null;

    const scroll = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const top = Math.max(
        0,
        viewport.scrollTop + elementRect.top - viewportRect.top - 8,
      );

      viewport.scrollTo({
        top,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    };

    const operation: PendingReveal = {
      group,
      facilityId,
      cancel: () => {
        if (frameId !== null) environment.cancelFrame(frameId);
        if (fallbackId !== null) environment.clearFallback(fallbackId);
        if (handleAnimationEnd) {
          element.removeEventListener("animationend", handleAnimationEnd);
        }
        if (pendingReveal === operation) pendingReveal = null;
      },
    };

    const finish = () => {
      operation.cancel();
      scroll();
    };

    pendingReveal = operation;
    frameId = environment.requestFrame(() => {
      frameId = null;
      if (!waitForExpansion) {
        finish();
        return;
      }

      handleAnimationEnd = finish;
      element.addEventListener("animationend", handleAnimationEnd);
      fallbackId = environment.setFallback(finish, 250);
    });
  };

  return {
    registerFacility,
    revealFacility,
    dispose: () => {
      pendingReveal?.cancel();
      facilityElements.library.clear();
      facilityElements.building.clear();
    },
  };
};

export const useFacilityReveal = (
  scrollAreaRef: React.RefObject<HTMLDivElement | null>,
) => {
  const [controller] = useState(() => createFacilityRevealController());

  useEffect(() => () => controller.dispose(), [controller]);

  const registerFacility = useCallback<
    FacilityRevealController["registerFacility"]
  >((group, facilityId, element) => {
    controller.registerFacility(group, facilityId, element);
  }, [controller]);

  const revealFacility = useCallback(
    (
      group: FacilityAccordionGroup,
      facilityId: string,
      waitForExpansion: boolean,
    ) => {
      const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>(
        "[data-radix-scroll-area-viewport]",
      );
      if (!viewport) return;

      controller.revealFacility(
        group,
        facilityId,
        waitForExpansion,
        viewport,
      );
    },
    [controller, scrollAreaRef],
  );

  return { registerFacility, revealFacility };
};
