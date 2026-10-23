import React, {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { getCampusDateTimeParts, type CampusDateTime } from "@/utils/time";

const MINUTE_MS = 60_000;

export function millisecondsUntilNextMinute(date: Date): number {
  return MINUTE_MS - (date.getTime() % MINUTE_MS);
}

interface DateTimeContextType {
  selectedDateTime: CampusDateTime;
  liveNow: Date;
  setSelectedDateTime: (dateTime: CampusDateTime) => void;
  isCurrentDateTime: boolean;
  resetToCurrentDateTime: () => void;
}

interface DateTimeState {
  selectedDateTime: CampusDateTime;
  liveNow: Date;
  isLive: boolean;
}

interface DateTimeProviderProps {
  children: ReactNode;
  selection?: CampusDateTime | null;
  onSelectionChange?: (selection: CampusDateTime | null) => void;
}

const DateTimeContext = createContext<DateTimeContextType | undefined>(undefined);

function createLiveState(now = new Date()): DateTimeState {
  const { date, time } = getCampusDateTimeParts(now);
  return {
    selectedDateTime: { date, time: `${time.slice(0, 5)}:00` },
    liveNow: now,
    isLive: true,
  };
}

export function DateTimeProvider({
  children,
  selection,
  onSelectionChange,
}: DateTimeProviderProps) {
  const [state, setState] = useState<DateTimeState>(createLiveState);
  const isControlled = selection !== undefined;
  const isLive = isControlled ? selection === null : state.isLive;
  const selectedDateTime = isControlled
    ? selection ?? state.selectedDateTime
    : state.selectedDateTime;

  const setSelectedDateTime = useCallback((dateTime: CampusDateTime) => {
    if (isControlled) {
      onSelectionChange?.(dateTime);
      return;
    }
    setState((current) => ({
      ...current,
      selectedDateTime: dateTime,
      isLive: false,
    }));
  }, [isControlled, onSelectionChange]);

  const resetToCurrentDateTime = useCallback(() => {
    if (isControlled) {
      onSelectionChange?.(null);
      return;
    }
    setState(createLiveState());
  }, [isControlled, onSelectionChange]);

  useEffect(() => {
    if (!isLive) {return;}

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const stopTimer = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };
    const scheduleNextMinute = () => {
      stopTimer();
      if (document.visibilityState !== "visible") {return;}

      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        setState(createLiveState());
        scheduleNextMinute();
      }, millisecondsUntilNextMinute(new Date()));
    };
    const catchUpToNow = () => {
      if (document.visibilityState === "visible") {
        setState(createLiveState());
        scheduleNextMinute();
      } else {
        stopTimer();
      }
    };

    catchUpToNow();
    document.addEventListener("visibilitychange", catchUpToNow);
    window.addEventListener("focus", catchUpToNow);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", catchUpToNow);
      window.removeEventListener("focus", catchUpToNow);
    };
  }, [isLive]);

  const value = useMemo<DateTimeContextType>(
    () => ({
      selectedDateTime,
      liveNow: state.liveNow,
      setSelectedDateTime,
      isCurrentDateTime: isLive,
      resetToCurrentDateTime,
    }),
    [
      selectedDateTime,
      state.liveNow,
      isLive,
      setSelectedDateTime,
      resetToCurrentDateTime,
    ],
  );

  return (
    <DateTimeContext.Provider value={value}>
      {children}
    </DateTimeContext.Provider>
  );
}

export function useDateTimeContext() {
  const context = useContext(DateTimeContext);
  if (context === undefined) {
    throw new Error("useDateTimeContext must be used within DateTimeProvider");
  }
  return context;
}
