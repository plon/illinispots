import { useMemo } from "react";
import type { RoomScheduleProps } from "@/types";
import { TimelineSchedule } from "@/components/TimelineSchedule";
import { convertLibrarySlotsToScheduleBlocks } from "@/utils/timelineSchedule";

export function RoomSchedule({ slots }: RoomScheduleProps) {
  const scheduleBlocks = useMemo(
    () => convertLibrarySlotsToScheduleBlocks(slots),
    [slots],
  );

  return (
    <TimelineSchedule
      scheduleData={scheduleBlocks}
      emptyMessage="No schedule slots available for this room today."
    />
  );
}
