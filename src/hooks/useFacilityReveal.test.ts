import { describe, expect, test } from "bun:test";
import {
  createFacilityRevealController,
  type FacilityRevealEnvironment,
} from "@/hooks/useFacilityReveal";

class FakeElement extends EventTarget {
  constructor(private readonly top: number) {
    super();
  }

  getBoundingClientRect() {
    return { top: this.top } as DOMRect;
  }
}

class FakeViewport extends FakeElement {
  scrollTop = 50;
  scrollCalls: ScrollToOptions[] = [];

  scrollTo(options: ScrollToOptions) {
    this.scrollCalls.push(options);
  }
}

const createEnvironment = (prefersReducedMotion = false) => {
  let frameCallback: FrameRequestCallback | null = null;
  let fallbackCallback: (() => void) | null = null;

  const environment: FacilityRevealEnvironment = {
    requestFrame: (callback) => {
      frameCallback = callback;
      return 1;
    },
    cancelFrame: () => {
      frameCallback = null;
    },
    setFallback: (callback) => {
      fallbackCallback = callback;
      return 2;
    },
    clearFallback: () => {
      fallbackCallback = null;
    },
    prefersReducedMotion: () => prefersReducedMotion,
  };

  return {
    environment,
    runFrame: () => {
      const callback = frameCallback;
      frameCallback = null;
      callback?.(0);
    },
    runFallback: () => {
      const callback = fallbackCallback;
      fallbackCallback = null;
      callback?.();
    },
  };
};

describe("facility reveal controller", () => {
  test("coalesces a repeated reveal while expansion is settling", () => {
    const viewport = new FakeViewport(100);
    const element = new FakeElement(400);
    const { environment, runFrame } = createEnvironment();
    const controller = createFacilityRevealController(environment);
    controller.registerFacility(
      "building",
      "cif",
      element as unknown as HTMLDivElement,
    );

    controller.revealFacility(
      "building",
      "cif",
      true,
      viewport as unknown as HTMLDivElement,
    );
    runFrame();
    controller.revealFacility(
      "building",
      "cif",
      false,
      viewport as unknown as HTMLDivElement,
    );

    expect(viewport.scrollCalls).toEqual([]);
    element.dispatchEvent(new Event("animationend"));
    expect(viewport.scrollCalls).toEqual([{ top: 342, behavior: "smooth" }]);
  });

  test("waits for layout in reduced-motion mode and scrolls instantly", () => {
    const viewport = new FakeViewport(100);
    const element = new FakeElement(400);
    const { environment, runFrame } = createEnvironment(true);
    const controller = createFacilityRevealController(environment);
    controller.registerFacility(
      "library",
      "main-library",
      element as unknown as HTMLDivElement,
    );

    controller.revealFacility(
      "library",
      "main-library",
      true,
      viewport as unknown as HTMLDivElement,
    );
    runFrame();

    expect(viewport.scrollCalls).toEqual([]);
    element.dispatchEvent(new Event("animationend"));
    expect(viewport.scrollCalls).toEqual([{ top: 342, behavior: "auto" }]);
  });
});
