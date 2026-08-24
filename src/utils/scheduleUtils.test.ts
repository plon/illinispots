import { describe, expect, it } from "bun:test";
import type { RoomScheduleBlock } from "@/types";
import { processScheduleIntoHourlyBlocks } from "./scheduleUtils";

describe("processScheduleIntoHourlyBlocks", () => {
  it("splits schedule sections at hour boundaries without losing details", () => {
    const classDetails = {
      type: "class" as const,
      course: "CS 374",
      title: "Algorithms",
    };
    const schedule: RoomScheduleBlock[] = [
      {
        start: "08:15:00",
        end: "08:45:00",
        status: "available",
        details: null,
      },
      {
        start: "08:45:00",
        end: "09:30:00",
        status: "class",
        details: classDetails,
      },
      {
        start: "09:30:00",
        end: "10:30:00",
        status: "available",
        details: null,
      },
    ];

    expect(processScheduleIntoHourlyBlocks(schedule)).toEqual([
      {
        start: "08:15:00",
        end: "09:00:00",
        sections: [
          schedule[0],
          {
            start: "08:45:00",
            end: "09:00:00",
            status: "class",
            details: classDetails,
          },
        ],
      },
      {
        start: "09:00:00",
        end: "10:00:00",
        sections: [
          {
            start: "09:00:00",
            end: "09:30:00",
            status: "class",
            details: classDetails,
          },
          {
            start: "09:30:00",
            end: "10:00:00",
            status: "available",
            details: null,
          },
        ],
      },
      {
        start: "10:00:00",
        end: "10:30:00",
        sections: [
          {
            start: "10:00:00",
            end: "10:30:00",
            status: "available",
            details: null,
          },
        ],
      },
    ]);
  });

  it("fills gaps and supports a midnight end boundary", () => {
    const schedule: RoomScheduleBlock[] = [
      {
        start: "22:30:00",
        end: "23:00:00",
        status: "class",
        details: null,
      },
      {
        start: "23:30:00",
        end: "24:00:00",
        status: "class",
        details: null,
      },
    ];

    expect(processScheduleIntoHourlyBlocks(schedule)).toEqual([
      {
        start: "22:30:00",
        end: "23:00:00",
        sections: [schedule[0]],
      },
      {
        start: "23:00:00",
        end: "24:00:00",
        sections: [
          {
            start: "23:00:00",
            end: "23:30:00",
            status: "available",
            details: null,
          },
          {
            start: "23:30:00",
            end: "24:00:00",
            status: "class",
            details: null,
          },
        ],
      },
    ]);
  });

  it("returns no blocks for an empty schedule", () => {
    expect(processScheduleIntoHourlyBlocks([])).toEqual([]);
  });
});
