import React from 'react';
import moment from "moment-timezone";
import {
  HybridTooltip,
  HybridTooltipContent,
  HybridTooltipTrigger,
  TooltipProvider,
} from "@/components/ui/HybridTooltip";
import { RoomScheduleBlock, AcademicBlockDetails } from '@/types';

interface AcademicTimeBlockProps {
  block: RoomScheduleBlock;
  baseWidthPx?: number; // Base width in pixels for 60 minutes (e.g., 56)
}

const AcademicTimeBlock = ({ block, baseWidthPx = 56 }: AcademicTimeBlockProps) => {
  const startTime = moment.tz(`1970-01-01T${block.start}`, "America/Chicago");
  const endTime = moment.tz(`1970-01-01T${block.end}`, "America/Chicago");

  let durationMinutes = endTime.diff(startTime, "minutes");
  if (durationMinutes < 0) {
     durationMinutes = 0;
  }

  const widthRatio = durationMinutes > 0 ? durationMinutes / 60 : 0;
  const calculatedWidthPx = Math.max(widthRatio * baseWidthPx, 4);

  const blockStyle = {
    width: `${calculatedWidthPx}px`,
  };

  const isAvailable = block.status === "available";
  const bgColor = isAvailable ? "bg-green-200" : "bg-red-200";

  const academicDetails = !isAvailable ? block.details as AcademicBlockDetails : null;

  const tooltipContent = isAvailable ? (
    <>
      <p className="font-medium text-[13px] leading-tight">
        {startTime.format("h:mm A")} - {endTime.format("h:mm A")}
      </p>
      <p className="text-[12px] leading-tight mt-0.5">Available</p>
      <p className="text-[12px] leading-tight">{durationMinutes} minutes</p>
    </>
  ) : (
    <>
      <p className="font-medium text-[13px] leading-tight">
        {startTime.format("h:mm A")} - {endTime.format("h:mm A")}
      </p>
      <p className="text-[12px] leading-tight mt-0.5 capitalize">
        {academicDetails?.type}: {academicDetails?.course || academicDetails?.identifier}
      </p>
      <p className="text-[12px] leading-tight">{academicDetails?.title}</p>
      <p className="text-[12px] leading-tight">{durationMinutes} minutes</p>
    </>
  );

  return (
    <TooltipProvider delayDuration={50}>
      <HybridTooltip>
        <HybridTooltipTrigger asChild>
          <div
            className={`h-14 border border-border ${bgColor} hover:opacity-80 transition-opacity shrink-0`}
            style={blockStyle}
          />
        </HybridTooltipTrigger>
        <HybridTooltipContent className="w-fit p-1.5">
          {tooltipContent}
        </HybridTooltipContent>
      </HybridTooltip>
    </TooltipProvider>
  );
};

export default AcademicTimeBlock;
