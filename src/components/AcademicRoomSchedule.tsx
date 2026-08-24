import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import HourlyAcademicTimeBlock from "@/components/HourlyAcademicTimeBlock";
import { RoomScheduleBlock } from "@/types";
import { processScheduleIntoHourlyBlocks } from "@/utils/scheduleUtils";

interface AcademicRoomScheduleProps {
  scheduleData: RoomScheduleBlock[];
}

const AcademicRoomSchedule: React.FC<AcademicRoomScheduleProps> = ({
  scheduleData,
}) => {
  // Process the schedule data into hourly blocks
  const hourlyBlocks = processScheduleIntoHourlyBlocks(scheduleData);

  return (
    <div className="px-1 py-2">
      <ScrollArea className="w-full pb-2">
        <div className="flex flex-wrap gap-1">
          {hourlyBlocks.map((block, index) => (
            <HourlyAcademicTimeBlock key={index} block={block} baseWidthPx={56} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AcademicRoomSchedule;
