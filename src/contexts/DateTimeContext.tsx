import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

const MINUTE_MS = 60_000;

export function startOfMinute(date: Date): Date {
  const minute = new Date(date);
  minute.setSeconds(0, 0);
  return minute;
}

export function millisecondsUntilNextMinute(date: Date): number {
  return MINUTE_MS - (date.getTime() % MINUTE_MS);
}

const padTwoDigits = (value: number): string => String(value).padStart(2, "0");

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`;
}

export function formatLocalTime(date: Date): string {
  return `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}:${padTwoDigits(date.getSeconds())}`;
}

interface DateTimeContextType {
  selectedDateTime: Date;
  setSelectedDateTime: (date: Date) => void;
  formattedDate: string;
  formattedTime: string;
  isCurrentDateTime: boolean;
  resetToCurrentDateTime: () => void;
}

const DateTimeContext = createContext<DateTimeContextType | undefined>(undefined);

export function DateTimeProvider({ children }: { children: ReactNode }) {
  const [selectedDateTime, setSelectedDateTimeState] = useState<Date>(() =>
    startOfMinute(new Date()),
  );
  const [isLive, setIsLive] = useState(true);

  const setSelectedDateTime = useCallback((date: Date) => {
    setIsLive(false);
    setSelectedDateTimeState(startOfMinute(date));
  }, []);

  const resetToCurrentDateTime = useCallback(() => {
    setIsLive(true);
    setSelectedDateTimeState(startOfMinute(new Date()));
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

      const now = new Date();
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        setSelectedDateTimeState(startOfMinute(new Date()));
        scheduleNextMinute();
      }, millisecondsUntilNextMinute(now));
    };

    const catchUpToNow = () => {
      if (document.visibilityState === "visible") {
        setSelectedDateTimeState(startOfMinute(new Date()));
        scheduleNextMinute();
      } else {
        stopTimer();
      }
    };

    if (document.visibilityState === "visible") {
      scheduleNextMinute();
    }
    document.addEventListener("visibilitychange", catchUpToNow);
    window.addEventListener("focus", catchUpToNow);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", catchUpToNow);
      window.removeEventListener("focus", catchUpToNow);
    };
  }, [isLive]);

  // Format the date as YYYY-MM-DD for API calls
  const formattedDate = formatLocalDate(selectedDateTime);
  
  // Format the time as HH:mm:ss for API calls
  const formattedTime = formatLocalTime(selectedDateTime);

  return (
    <DateTimeContext.Provider
      value={{
        selectedDateTime,
        setSelectedDateTime,
        formattedDate,
        formattedTime,
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
