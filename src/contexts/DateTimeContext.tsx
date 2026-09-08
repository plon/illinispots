import React, {
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { getCampusDateTimeParts, type CampusDateTime } from "@/utils/time";
import {
  DateTimeContext,
  millisecondsUntilNextMinute,
} from "./dateTime";

interface DateTimeState {
  selectedDateTime: CampusDateTime;
  liveNow: Date;
  isLive: boolean;
}

function createLiveState(now = new Date()): DateTimeState {
  const { date, time } = getCampusDateTimeParts(now);
  return {
    selectedDateTime: { date, time: `${time.slice(0, 5)}:00` },
    liveNow: now,
    isLive: true,
  };
}

export function DateTimeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DateTimeState>(createLiveState);

  const setSelectedDateTime = useCallback((dateTime: CampusDateTime) => {
    setState((current) => ({
      ...current,
      selectedDateTime: dateTime,
      isLive: false,
    }));
  }, []);

  const resetToCurrentDateTime = useCallback(() => {
    setState(createLiveState());
  }, []);

  useEffect(() => {
    if (!state.isLive) return;

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

    if (document.visibilityState === "visible") scheduleNextMinute();
    document.addEventListener("visibilitychange", catchUpToNow);
    window.addEventListener("focus", catchUpToNow);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", catchUpToNow);
      window.removeEventListener("focus", catchUpToNow);
    };
  }, [state.isLive]);

  return (
    <DateTimeContext.Provider
      value={{
        selectedDateTime: state.selectedDateTime,
        liveNow: state.liveNow,
        setSelectedDateTime,
        isCurrentDateTime: state.isLive,
        resetToCurrentDateTime,
      }}
    >
      {children}
    </DateTimeContext.Provider>
  );
}
