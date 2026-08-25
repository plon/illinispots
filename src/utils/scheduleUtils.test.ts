import { describe, expect, it } from "bun:test";
import type { RoomScheduleBlock } from "@/types";
import { processScheduleIntoHourlyBlocks } from "./scheduleUtils";

describe("processScheduleIntoHourlyBlocks", () => {
  it("splits schedule data at hour boundaries without date objects", () => {
    const schedule: RoomScheduleBlock[] = [
      {
        start: "07:30:00",
        end: "08:15:00",
        status: "available",
        details: null,
      },
      {
        start: "08:15:00",
        end: "09:15:00",
        status: "class",
        details: { type: "class", title: "Algorithms" },
      },
    ];

    expect(processScheduleIntoHourlyBlocks(schedule)).toEqual([
      {
        start: "07:30:00",
        end: "08:00:00",
        sections: [
          {
            start: "07:30:00",
            end: "08:00:00",
            status: "available",
            details: null,
          },
        ],
      },
      {
        start: "08:00:00",
        end: "09:00:00",
        sections: [
          {
            start: "08:00:00",
            end: "08:15:00",
            status: "available",
            details: null,
          },
          {
            start: "08:15:00",
            end: "09:00:00",
            status: "class",
            details: { type: "class", title: "Algorithms" },
          },
        ],
      },
      {
        start: "09:00:00",
        end: "09:15:00",
        sections: [
          {
            start: "09:00:00",
            end: "09:15:00",
            status: "class",
            details: { type: "class", title: "Algorithms" },
          },
        ],
      },
    ]);
  });

  it("keeps blocks that end at midnight", () => {
    expect(
      processScheduleIntoHourlyBlocks([
        {
          start: "23:00:00",
          end: "24:00:00",
          status: "available",
          details: null,
        },
      ]),
    ).toEqual([
      {
        start: "23:00:00",
        end: "00:00:00",
        sections: [
          {
            start: "23:00:00",
            end: "00:00:00",
            status: "available",
            details: null,
          },
        ],
      },
    ]);
  });

  it("ignores invalid and zero-length blocks", () => {
    expect(
      processScheduleIntoHourlyBlocks([
        { start: "invalid", end: "09:00:00", status: "available", details: null },
        { start: "09:00:00", end: "09:00:00", status: "available", details: null },
      ]),
    ).toEqual([]);
  });
});
