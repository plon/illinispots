const SECONDS_PER_DAY = 24 * 60 * 60;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseClockTimeSeconds(time: string): number | null {
  const match = CLOCK_TIME_PATTERN.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const isEndOfDay = hour === 24 && minute === 0 && second === 0;
  if ((!isEndOfDay && hour > 23) || minute > 59 || second > 59) return null;

  return hour * 60 * 60 + minute * 60 + second;
}

/** Calculate an integer clock duration, wrapping an end before start at midnight. */
export function clockDurationMinutes(start: string, end: string): number {
  const startSeconds = parseClockTimeSeconds(start);
  const endSeconds = parseClockTimeSeconds(end);
  if (startSeconds === null || endSeconds === null) return 0;

  const durationSeconds =
    endSeconds < startSeconds
      ? endSeconds + SECONDS_PER_DAY - startSeconds
      : endSeconds - startSeconds;
  return Math.trunc(durationSeconds / 60);
}
