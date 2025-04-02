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
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-200" />
          <span className="text-xs text-muted-foreground">Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-200" />
          <span className="text-xs text-muted-foreground">Class/Event</span>
        </div>
      </div>
    </div>
  );
};

export default AcademicRoomSchedule;
