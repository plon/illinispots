import { createContext, useContext } from "react";
import type { CampusDateTime } from "@/utils/time";

const MINUTE_MS = 60_000;

export function millisecondsUntilNextMinute(date: Date): number {
  return MINUTE_MS - (date.getTime() % MINUTE_MS);
}

type DateTimeContextType = {
  selectedDateTime: CampusDateTime;
  liveNow: Date;
  setSelectedDateTime: (dateTime: CampusDateTime) => void;
  isCurrentDateTime: boolean;
  resetToCurrentDateTime: () => void;
};

export const DateTimeContext = createContext<DateTimeContextType | undefined>(
  undefined,
);

export function useDateTimeContext() {
  const context = useContext(DateTimeContext);
  if (context === undefined) {
    throw new Error("useDateTimeContext must be used within DateTimeProvider");
  }
  return context;
}
