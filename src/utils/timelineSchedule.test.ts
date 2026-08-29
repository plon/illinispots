import { describe, expect, it } from "bun:test";
import type { RoomScheduleBlock, TimeSlot } from "@/types";
import {
  buildTimelineDayOptions,
  buildTimelineModel,
  convertLibrarySlotsToScheduleBlocks,
  formatDuration,
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
      percent: 0,
      positionPx: 0,
    });
    expect(model.ticks.at(-1)).toEqual({
      hour: 24,
      label: "12 AM",
      percent: 100,
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

describe("formatDuration", () => {
  it("formats timeline durations", () => {
    expect(formatDuration(80)).toBe("1h 20m");
  });
});

describe("convertLibrarySlotsToScheduleBlocks", () => {
  it("converts library slots into schedule blocks preserving discrete slots", () => {
    const slots: TimeSlot[] = [
      { start: "10:00:00", end: "10:30:00", available: true },
      { start: "10:30:00", end: "11:00:00", available: true },
      { start: "11:00:00", end: "12:00:00", available: false },
    ];

    const blocks = convertLibrarySlotsToScheduleBlocks(slots);

    expect(blocks).toEqual([
      {
        start: "10:00:00",
        end: "10:30:00",
        status: "available",
        details: null,
      },
      {
        start: "10:30:00",
        end: "11:00:00",
        status: "available",
        details: null,
      },
      {
        start: "11:00:00",
        end: "12:00:00",
        status: "event",
        details: {
          type: "event",
          title: "Reserved",
          identifier: "Reserved",
        },
      },
    ]);
  });

  it("handles midnight end times in timeline model", () => {
    const slots: TimeSlot[] = [
      { start: "23:00:00", end: "00:00:00", available: true },
    ];
    const blocks = convertLibrarySlotsToScheduleBlocks(slots);
    const model = buildTimelineModel(blocks);

    expect(model.startHour).toBe(23);
    expect(model.endHour).toBe(24);
    expect(model.blocks[0]).toMatchObject({
      durationMinutes: 60,
      widthPx: TIMELINE_HOUR_WIDTH_PX,
    });
  });
});
