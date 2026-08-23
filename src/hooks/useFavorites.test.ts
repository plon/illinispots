import { expect, it, mock, spyOn } from "bun:test";
import { loadFavorites } from "./useFavorites";

it("falls back when browser policy blocks localStorage access", () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const errorLog = spyOn(console, "error").mockImplementation(() => {});

  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });

    expect(loadFavorites()).toEqual([]);
    expect(errorLog).toHaveBeenCalledTimes(1);
  } finally {
    if (storageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
    mock.restore();
  }
});
