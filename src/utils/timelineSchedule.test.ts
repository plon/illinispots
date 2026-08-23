import { describe, expect, it } from "bun:test";
import moment from "moment-timezone";
import type { RoomScheduleBlock } from "@/types";
import {
  buildTimelineDayOptions,
  buildTimelineModel,
  formatDuration,
  formatScheduleTime,
  getScheduleDurationMinutes,
  parseScheduleTime,
  TIMELINE_HOUR_WIDTH_PX,
} from "./timelineSchedule";

const schedule: RoomScheduleBlock[] = [
  {
    start: "07:30:00",
    end: "09:00:00",
    status: "available",
    details: null,
  },
  {
    start: "09:00:00",
    end: "10:15:00",
    status: "class",
    details: { type: "class", course: "CS 374", title: "Algorithms" },
  },
  {
    start: "10:15:00",
    end: "23:15:00",
    status: "available",
    details: null,
  },
];

describe("buildTimelineDayOptions", () => {
  it("keeps the selected date in a stable seven-day window", () => {
    const today = "2026-08-20";
    const firstWindow = buildTimelineDayOptions("2026-08-25", today);
    const nextWindow = buildTimelineDayOptions("2026-08-27", today);
    const previousWindow = buildTimelineDayOptions("2026-08-19", today);

    expect(firstWindow.map(({ date }) => date)).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
    ]);
    expect(nextWindow[0].date).toBe("2026-08-27");
    expect(previousWindow.at(-1)?.date).toBe("2026-08-19");
    expect(firstWindow[0].label).toBe("Today");
  });

  it("matches Moment calendar windows across Chicago DST boundaries", () => {
    for (const [today, selectedDate] of [
      ["2026-03-07", "2026-03-12"],
      ["2026-03-08", "2026-03-01"],
      ["2026-10-31", "2026-11-03"],
      ["2026-11-01", "2026-11-09"],
    ]) {
      const todayMoment = moment.tz(today, "America/Chicago");
      const selectedMoment = moment.tz(selectedDate, "America/Chicago");
      const offset = Math.floor(selectedMoment.diff(todayMoment, "days") / 7) * 7;
      const firstDay = todayMoment.clone().add(offset, "days");
      const expected = Array.from({ length: 7 }, (_, index) => {
        const day = firstDay.clone().add(index, "days");
        const date = day.format("YYYY-MM-DD");
        return { date, label: date === today ? "Today" : day.format("ddd D") };
      });

      expect(buildTimelineDayOptions(selectedDate, today)).toEqual(expected);
    }
  });
});

describe("buildTimelineModel", () => {
  it("derives ruler bounds and block positions from the schedule", () => {
    const model = buildTimelineModel(schedule);

    expect(model.startHour).toBe(7);
    expect(model.endHour).toBe(24);
    expect(model.totalHours).toBe(17);
    expect(model.totalWidthPx).toBe(17 * TIMELINE_HOUR_WIDTH_PX);
    expect(model.ticks.at(0)).toEqual({
      hour: 7,
      label: "7 AM",
      positionPx: 0,
    });
    expect(model.ticks.at(-1)).toEqual({
      hour: 24,
      label: "12 AM",
      positionPx: 17 * TIMELINE_HOUR_WIDTH_PX,
    });
    expect(model.blocks[1]).toMatchObject({
      durationMinutes: 75,
      leftPx: 2 * TIMELINE_HOUR_WIDTH_PX,
      widthPx: 1.25 * TIMELINE_HOUR_WIDTH_PX,
    });
  });

  it("uses stable defaults when there are no valid schedule blocks", () => {
    const invalidSchedule: RoomScheduleBlock[] = [
      {
        start: "99:00:00",
        end: "not-a-time",
        status: "available",
        details: null,
      },
    ];

    const model = buildTimelineModel(invalidSchedule);

    expect(model.startHour).toBe(8);
    expect(model.endHour).toBe(22);
    expect(model.blocks).toEqual([]);
  });
});

describe("timeline time formatting", () => {
  it("validates schedule times", () => {
    expect(parseScheduleTime("09:30:30")).toBe(570.5);
    expect(parseScheduleTime("24:00:00")).toBeNull();
    expect(parseScheduleTime("09:90:00")).toBeNull();
    expect(parseScheduleTime("n/a")).toBeNull();
  });

  it("formats times and durations", () => {
    expect(formatScheduleTime("00:05:00")).toBe("12:05 AM");
    expect(formatScheduleTime("13:30:00")).toBe("1:30 PM");
    expect(formatDuration(80)).toBe("1h 20m");
    expect(getScheduleDurationMinutes("09:00:30", "10:00:00")).toBe(59);
    expect(getScheduleDurationMinutes("10:00:00", "09:00:00")).toBe(0);
  });
});
