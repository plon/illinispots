import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function millisecondsUntilNextMinute(nowMs: number): number {
  const elapsedInMinute = ((nowMs % MINUTE_MS) + MINUTE_MS) % MINUTE_MS;
  return elapsedInMinute === 0 ? MINUTE_MS : MINUTE_MS - elapsedInMinute;
}

/**
 * Exposes wall-clock time as React state at the precision displayed by the UI.
 * The timeout is realigned after every tick and whenever the page resumes, so
 * background-tab throttling and timer drift cannot leave availability stale.
 */
export function useCurrentMinute(enabled: boolean): Date {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: number | undefined;

    const scheduleNextMinute = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setCurrentTime(new Date());
        scheduleNextMinute();
      }, millisecondsUntilNextMinute(Date.now()));
    };

    const synchronize = () => {
      setCurrentTime(new Date());
      scheduleNextMinute();
    };

    const synchronizeVisiblePage = () => {
      if (document.visibilityState === "visible") synchronize();
    };

    synchronize();
    window.addEventListener("focus", synchronize);
    window.addEventListener("pageshow", synchronize);
    document.addEventListener("visibilitychange", synchronizeVisiblePage);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", synchronize);
      window.removeEventListener("pageshow", synchronize);
      document.removeEventListener("visibilitychange", synchronizeVisiblePage);
    };
  }, [enabled]);

  return currentTime;
}
