import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  formatTimeForDisplay,
  getCampusDateTimeParts,
} from "@/utils/time";
import { Clock } from "lucide-react";
import type { RoomScheduleBlock } from "@/types";
import {
  HybridTooltip,
  HybridTooltipContent,
  HybridTooltipTrigger,
  TooltipProvider,
} from "@/components/ui/HybridTooltip";
import {
  buildTimelineDayOptions,
  buildTimelineModel,
  formatDuration,
} from "@/utils/timelineSchedule";

interface TimelineScheduleProps {
  scheduleData: RoomScheduleBlock[];
  selectedDate?: string;
  onDateChange?: (newDate: string) => void;
  onBlockClick?: (block: RoomScheduleBlock) => void;
  emptyMessage?: string;
}

function DaySelector({
  selectedDate,
  today,
  onDateChange,
}: {
  selectedDate: string;
  today: string;
  onDateChange: (date: string) => void;
}) {
  const days = useMemo(
    () => buildTimelineDayOptions(selectedDate, today),
    [selectedDate, today],
  );

  return (
    <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
      {days.map((day) => {
        const isSelected = day.date === selectedDate;
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onDateChange(day.date)}
            aria-pressed={isSelected}
            className={`shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${
              isSelected
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

export const TimelineSchedule: React.FC<TimelineScheduleProps> = ({
  scheduleData,
  selectedDate,
  onDateChange,
  onBlockClick,
  emptyMessage,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(Date.now);
  const timeline = useMemo(
    () => buildTimelineModel(scheduleData),
    [scheduleData],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const currentCampusTime = getCampusDateTimeParts(currentTime);
  const today = currentCampusTime.date;
  const activeDate = selectedDate ?? today;
  const isToday = activeDate === today;
  const currentMinutes = currentCampusTime.hour * 60 + currentCampusTime.minute;
  const totalMinutes = timeline.totalHours * 60;
  const currentTimePercent =
    isToday &&
    totalMinutes > 0 &&
    currentMinutes >= timeline.startMinutes &&
    currentMinutes <= timeline.endMinutes
      ? ((currentMinutes - timeline.startMinutes) / totalMinutes) * 100
      : null;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let targetScroll = 0;
    if (isToday) {
      const now = getCampusDateTimeParts();
      const minutes = now.hour * 60 + now.minute;
      const totalMinutes = timeline.totalHours * 60;
      if (
        totalMinutes > 0 &&
        minutes >= timeline.startMinutes &&
        minutes <= timeline.endMinutes
      ) {
        const fraction = (minutes - timeline.startMinutes) / totalMinutes;
        const position = fraction * container.scrollWidth;
        targetScroll = Math.max(0, position - container.clientWidth * 0.35);
      }
    }

    container.scrollTo({ left: targetScroll, behavior: "smooth" });
  }, [isToday, activeDate, timeline.endMinutes, timeline.startMinutes, timeline.totalHours]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isDraggingRef.current = true;
    dragStartXRef.current = event.pageX - container.offsetLeft;
    dragStartScrollRef.current = container.scrollLeft;
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!isDraggingRef.current || !container) return;

    event.preventDefault();
    const currentX = event.pageX - container.offsetLeft;
    container.scrollLeft =
      dragStartScrollRef.current - (currentX - dragStartXRef.current) * 1.2;
  };

  const stopDragging = () => {
    isDraggingRef.current = false;
  };

  if (scheduleData.length === 0) {
    return (
      <div className="w-full min-w-0 max-w-full rounded-md border border-border/50 bg-muted/20 p-3 text-center text-xs text-muted-foreground">
        {emptyMessage ?? "No schedule slots available for this room."}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5 overflow-hidden pb-0.5 pt-1">
      {onDateChange && (
        <DaySelector
          selectedDate={activeDate}
          today={today}
          onDateChange={onDateChange}
        />
      )}

      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-md border border-border/50 bg-muted/20">
        <div
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          className="w-full min-w-0 max-w-full cursor-grab select-none overflow-x-auto overflow-y-hidden px-3 pb-3 pt-2 active:cursor-grabbing"
          style={{
            scrollbarWidth: "thin",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            className="relative w-full"
            style={{
              minWidth: `${timeline.totalWidthPx}px`,
            }}
          >
            <div className="relative mb-1 h-6 w-full border-b border-border/40">
              {timeline.ticks.map((tick) => {
                const transform =
                  tick.hour === timeline.startHour
                    ? "translateX(0)"
                    : tick.hour === timeline.endHour
                      ? "translateX(-100%)"
                      : "translateX(-50%)";

                return (
                  <div
                    key={tick.hour}
                    className="pointer-events-none absolute bottom-0 top-0 flex flex-col items-center"
                    style={{ left: `${tick.percent}%`, transform }}
                  >
                    <span className="whitespace-nowrap text-[10px] font-normal leading-none text-muted-foreground/80">
                      {tick.label}
                    </span>
                    <div className="mt-1 h-2 w-px bg-border/80" />
                  </div>
                );
              })}
            </div>

            <div className="relative h-12 w-full overflow-hidden rounded border border-border/60 bg-muted/30">
              {Array.from({ length: timeline.totalHours - 1 }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="pointer-events-none absolute bottom-0 top-0 border-r border-border/25"
                    style={{
                      left: `${((index + 1) / timeline.totalHours) * 100}%`,
                    }}
                  />
                ),
              )}

              <TooltipProvider delayDuration={50}>
                {timeline.blocks.map(
                  ({ block, durationMinutes, leftPercent, widthPercent, widthPx }) => {
                    const isAvailable = block.status === "available";
                    const isPast =
                      isToday && block.end <= currentCampusTime.time;
                    const details = block.details;
                    const displayLabel =
                      details?.course ||
                      (details?.identifier && details.identifier !== "Reserved"
                        ? details.identifier
                        : details?.title && details.title !== "Reserved"
                          ? details.title
                          : null);
                    const eventLabel =
                      displayLabel ||
                      (block.status === "event" ? "Reserved" : "Class");
                    const blockDescription = isAvailable
                      ? `Available, ${formatDuration(durationMinutes)}, ${formatTimeForDisplay(block.start)} to ${formatTimeForDisplay(block.end)}`
                      : `${eventLabel}${details?.title && details.title !== eventLabel ? `: ${details.title}` : ""}, ${formatDuration(durationMinutes)}, ${formatTimeForDisplay(block.start)} to ${formatTimeForDisplay(block.end)}`;

                    return (
                      <HybridTooltip
                        key={`${block.start}-${block.end}-${block.status}`}
                      >
                        <HybridTooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={blockDescription}
                            onClick={() => {
                              if (onBlockClick) {
                                onBlockClick(block);
                              }
                            }}
                            className={`absolute bottom-0 top-0 flex cursor-pointer items-center justify-center overflow-hidden border-r border-background/50 px-1.5 transition-colors focus-visible:z-10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                              isAvailable
                                ? "border-emerald-600/30 bg-emerald-500/25 text-emerald-900 hover:bg-emerald-500/35 dark:bg-emerald-950/70 dark:text-emerald-300 dark:hover:bg-emerald-900/80"
                                : "border-rose-600/40 bg-rose-500/30 text-rose-950 hover:bg-rose-500/40 dark:bg-rose-950/80 dark:text-rose-200 dark:hover:bg-rose-900/90"
                            } ${isPast ? "opacity-45" : ""}`}
                            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          >
                            {!isAvailable && displayLabel && widthPx >= 36 && (
                              <span className="truncate text-[10.5px] font-semibold leading-none text-foreground/90">
                                {displayLabel}
                              </span>
                            )}
                          </button>
                        </HybridTooltipTrigger>

                        <HybridTooltipContent className="w-56 border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between font-medium">
                              <span
                                className={`font-semibold ${
                                  isAvailable
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {isAvailable ? "Available" : eventLabel}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {formatDuration(durationMinutes)}
                              </span>
                            </div>

                            {!isAvailable && details?.title && details.title !== eventLabel && (
                              <p className="text-xs font-medium leading-tight text-popover-foreground">
                                {details.title}
                              </p>
                            )}

                            <div className="flex items-center gap-1.5 border-t border-border/60 pt-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                              <span>
                                {formatTimeForDisplay(block.start)} -{" "}
                                {formatTimeForDisplay(block.end)}
                              </span>
                            </div>
                          </div>
                        </HybridTooltipContent>
                      </HybridTooltip>
                    );
                  },
                )}
              </TooltipProvider>

              {currentTimePercent !== null && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-20 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${currentTimePercent}%` }}
                >
                  <div className="-mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                  <div className="h-full w-[1.5px] bg-red-500 shadow-2xs" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineSchedule;
