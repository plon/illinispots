import { RoomStatus } from "@/types";

export const STATUS_BADGE_STYLES = {
  [RoomStatus.AVAILABLE]:
    "bg-green-50 text-green-700 border-green-300 dark:bg-green-950/60 dark:text-green-400 dark:border-green-800",
  [RoomStatus.PASSING_PERIOD]:
    "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950/60 dark:text-yellow-400 dark:border-yellow-800",
  [RoomStatus.OPENING_SOON]:
    "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800",
  [RoomStatus.RESERVED]:
    "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800",
  [RoomStatus.OCCUPIED]:
    "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800",
  [RoomStatus.UNAVAILABLE]:
    "bg-gray-50 text-gray-700 border-gray-300 dark:bg-muted dark:text-muted-foreground dark:border-border",
  closed:
    "bg-gray-50 text-gray-700 border-gray-300 dark:bg-muted dark:text-muted-foreground dark:border-border",
} as const;

export function getFacilityAvailabilityBadgeStyle(
  isOpen: boolean,
  availableCount: number,
): string {
  if (!isOpen) return STATUS_BADGE_STYLES.closed;
  return availableCount > 0
    ? STATUS_BADGE_STYLES[RoomStatus.AVAILABLE]
    : STATUS_BADGE_STYLES[RoomStatus.OCCUPIED];
}
