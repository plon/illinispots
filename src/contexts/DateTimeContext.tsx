import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { getCampusDateTimeParts, type CampusDateTimeParts } from "@/utils/time";

const MINUTE_MS = 60_000;

export function startOfMinute(date: Date): Date {
  const minute = new Date(date);
  minute.setSeconds(0, 0);
  return minute;
}

export function millisecondsUntilNextMinute(date: Date): number {
  return MINUTE_MS - (date.getTime() % MINUTE_MS);
}

export type SelectedCampusDateTime = Pick<CampusDateTimeParts, "date" | "time">;

interface DateTimeContextType {
  selectedDateTime: SelectedCampusDateTime;
  setSelectedDateTime: (dateTime: SelectedCampusDateTime) => void;
  formattedDate: string;
  formattedTime: string;
  isCurrentDateTime: boolean;
  resetToCurrentDateTime: () => void;
}

const DateTimeContext = createContext<DateTimeContextType | undefined>(undefined);

function currentCampusDateTime(): SelectedCampusDateTime {
  const { date, time } = getCampusDateTimeParts();
  return { date, time: `${time.slice(0, 5)}:00` };
}

export function DateTimeProvider({ children }: { children: ReactNode }) {
  const [selectedDateTime, setSelectedDateTimeState] =
    useState<SelectedCampusDateTime>(currentCampusDateTime);
  const [isLive, setIsLive] = useState(true);

  const setSelectedDateTime = useCallback((dateTime: SelectedCampusDateTime) => {
    setIsLive(false);
    setSelectedDateTimeState(dateTime);
  }, []);

  const resetToCurrentDateTime = useCallback(() => {
    setIsLive(true);
    setSelectedDateTimeState(currentCampusDateTime());
  }, []);

  useEffect(() => {
    if (!isLive) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const stopTimer = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };
    const scheduleNextMinute = () => {
      stopTimer();
      if (document.visibilityState !== "visible") return;

      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        setSelectedDateTimeState(currentCampusDateTime());
        scheduleNextMinute();
      }, millisecondsUntilNextMinute(new Date()));
    };
    const catchUpToNow = () => {
      if (document.visibilityState === "visible") {
        setSelectedDateTimeState(currentCampusDateTime());
        scheduleNextMinute();
      } else {
        stopTimer();
      }
    };

    if (document.visibilityState === "visible") scheduleNextMinute();
    document.addEventListener("visibilitychange", catchUpToNow);
    window.addEventListener("focus", catchUpToNow);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", catchUpToNow);
      window.removeEventListener("focus", catchUpToNow);
    };
  }, [isLive]);

  return (
    <DateTimeContext.Provider
      value={{
        selectedDateTime,
        setSelectedDateTime,
        formattedDate: selectedDateTime.date,
        formattedTime: selectedDateTime.time,
        isCurrentDateTime: isLive,
        resetToCurrentDateTime,
      }}
    >
      {children}
    </DateTimeContext.Provider>
  );
}

export function useDateTimeContext() {
  const context = useContext(DateTimeContext);
  if (context === undefined) {
    throw new Error("useDateTimeContext must be used within a DateTimeProvider");
  }
  return context;
}
