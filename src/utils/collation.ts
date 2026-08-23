const ROOM_NUMBER_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Natural ordering for room labels without rebuilding a collator per comparison. */
export function compareRoomNumbers(first: string, second: string): number {
  return ROOM_NUMBER_COLLATOR.compare(first, second);
}
