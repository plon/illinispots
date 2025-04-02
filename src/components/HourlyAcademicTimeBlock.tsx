import React from "react";
import moment from "moment-timezone";
import {
  HybridTooltip,
  HybridTooltipContent,
  HybridTooltipTrigger,
  TooltipProvider,
} from "@/components/ui/HybridTooltip";
import { HourlyScheduleBlock, BlockSection } from "@/types";

interface HourlyAcademicTimeBlockProps {
  block: HourlyScheduleBlock;
  baseWidthPx?: number; // Base width in pixels for 60 minutes (e.g., 56)
}

const HourlyAcademicTimeBlock = ({
  block,
  baseWidthPx = 56,
}: HourlyAcademicTimeBlockProps) => {
  const startTime = moment.tz(`1970-01-01T${block.start}`, "America/Chicago");
  const endTime = moment.tz(`1970-01-01T${block.end}`, "America/Chicago");

  let durationMinutes = endTime.diff(startTime, "minutes");
  if (durationMinutes < 0) {
    durationMinutes = 0;
  }

  // For hourly blocks, we want a consistent width based on the duration
  // Standard blocks will be 60 minutes = baseWidthPx
  const widthRatio = durationMinutes > 0 ? durationMinutes / 60 : 0;
  const calculatedWidthPx = Math.max(widthRatio * baseWidthPx, 4);

  const blockStyle = {
    width: `${calculatedWidthPx}px`,
  };

  // Calculate the tooltip content based on all sections
  const tooltipContent = (
    <>
      <p className="font-medium text-[13px] leading-tight">
        {startTime.format("h:mm A")} - {endTime.format("h:mm A")}
      </p>
      <p className="text-[12px] leading-tight">{durationMinutes} minutes</p>

      {/* If there's only one section, show its details */}
      {block.sections.length === 1 && (
        <div className="mt-1 border-t border-border pt-1">
          {block.sections[0].status === "available" ? (
            <p className="text-[12px] leading-tight text-green-600 font-medium">
              Available
            </p>
          ) : (
            <>
              <p className="text-[12px] leading-tight capitalize text-red-600 font-medium">
                {block.sections[0].details?.type === "class"
                  ? "Class"
                  : "Event"}
              </p>
              {block.sections[0].details && (
                <p className="text-[12px] leading-tight">
                  {block.sections[0].details.course ||
                    block.sections[0].details.identifier}
                  {block.sections[0].details.title
                    ? `: ${block.sections[0].details.title}`
                    : ""}
                </p>
              )}
            </>
          )}
        </div>
      )}
      {/* If there are multiple sections, show details for each */}
      {block.sections.length > 1 && (
        <div className="mt-1 border-t border-border pt-1">
          {block.sections.map((section, idx) => {
            const sectionStart = moment.tz(
              `1970-01-01T${section.start}`,
              "America/Chicago",
            );
            const sectionEnd = moment.tz(
              `1970-01-01T${section.end}`,
              "America/Chicago",
            );
            return (
              <div key={idx} className="mt-0.5">
                <p className="text-[12px] leading-tight">
                  {sectionStart.format("h:mm A")} -{" "}
                  {sectionEnd.format("h:mm A")}:
                  {section.status === "available" ? (
                    <span className="text-green-600"> Available</span>
                  ) : (
                    <span className="text-red-600">
                      {" "}
                      {section.details?.type === "class" ? "Class" : "Event"}
                    </span>
                  )}
                </p>
                {section.status !== "available" && section.details && (
                  <p className="text-[12px] leading-tight ml-2">
                    {section.details.course || section.details.identifier}:{" "}
                    {section.details.title}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <TooltipProvider delayDuration={50}>
      <HybridTooltip>
        <HybridTooltipTrigger asChild>
          <div
            className="h-14 border border-border shrink-0 flex"
            style={blockStyle}
          >
            {block.sections.map((section, index) => (
              <BlockSectionComponent key={index} section={section} parentBlock={block} />
            ))}
          </div>
        </HybridTooltipTrigger>
        <HybridTooltipContent className="w-fit p-1.5">
          {tooltipContent}
        </HybridTooltipContent>
      </HybridTooltip>
    </TooltipProvider>
  );
};

interface BlockSectionProps {
  section: BlockSection;
  parentBlock: HourlyScheduleBlock;
}

const BlockSectionComponent = ({ section, parentBlock }: BlockSectionProps) => {
  const startTime = moment.tz(`1970-01-01T${section.start}`, "America/Chicago");
  const endTime = moment.tz(`1970-01-01T${section.end}`, "America/Chicago");
  const parentStartTime = moment.tz(
    `1970-01-01T${parentBlock.start}`,
    "America/Chicago",
  );
  const parentEndTime = moment.tz(
    `1970-01-01T${parentBlock.end}`,
    "America/Chicago",
  );

  // Calculate the section's width as a percentage of the parent block
  const parentDuration = parentEndTime.diff(parentStartTime, "minutes");
  const sectionDuration = endTime.diff(startTime, "minutes");

  // Ensure we don't divide by zero and the percentage is valid
  const widthPercentage =
    parentDuration > 0 ? (sectionDuration / parentDuration) * 100 : 0;

  const isAvailable = section.status === "available";
  const bgColor = isAvailable ? "bg-green-200" : "bg-red-200";

  return (
    <div
      className={`h-full ${bgColor} hover:opacity-80 transition-opacity`}
      style={{ width: `${Math.max(widthPercentage, 1)}%` }} // Ensure minimum width of 1%
    />
  );
};

export default HourlyAcademicTimeBlock;
