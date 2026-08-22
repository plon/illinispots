import React, { useEffect, useRef, useState, useMemo } from "react";
import moment from "moment-timezone";
import { RoomScheduleBlock, AcademicBlockDetails } from "@/types";
import {
  HybridTooltip,
  HybridTooltipContent,
  HybridTooltipTrigger,
  TooltipProvider,
} from "@/components/ui/HybridTooltip";
import { Clock } from "lucide-react";

const CAMPUS_TIMEZONE = "America/Chicago";
const DAY_START_HOUR = 8; // 8:00 AM
const DAY_END_HOUR = 22; // 10:00 PM
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60; // 840 minutes
const HOUR_WIDTH_PX = 72; // 72px per hour = 1.2px per minute
const TOTAL_WIDTH_PX = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_WIDTH_PX; // 1008px

interface TimelineScheduleProps {
  scheduleData: RoomScheduleBlock[];
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (newDate: string) => void;
  buildingId?: string;
  roomNumber?: string;
}

// Convert "HH:mm:ss" or "HH:mm" to minutes from 8:00 AM
function getMinutesFromDayStart(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  const hour = parts[0] || 0;
  const min = parts[1] || 0;
  const totalMinutes = hour * 60 + min;
  return totalMinutes - DAY_START_HOUR * 60;
}

// Format "HH:mm:ss" to "9:30 AM"
function formatTimeString(timeStr: string): string {
  const parts = timeStr.split(":").map(Number);
  const hour = parts[0] || 0;
  const min = parts[1] || 0;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMin = min < 10 ? `0${min}` : `${min}`;
  return `${displayHour}:${displayMin} ${period}`;
}

// Format duration minutes into "1h 20m" or "50m"
function formatDurationMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export const TimelineSchedule: React.FC<TimelineScheduleProps> = ({
  scheduleData,
  selectedDate,
  onDateChange,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentCampusTime, setCurrentCampusTime] = useState(() =>
    moment().tz(CAMPUS_TIMEZONE),
  );

  // Mouse drag-to-scroll state
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCampusTime(moment().tz(CAMPUS_TIMEZONE));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = currentCampusTime.format("YYYY-MM-DD");
  const isToday = selectedDate === todayStr;

  // 7-day strip
  const daysList = useMemo(() => {
    const list = [];
    const base = moment.tz(todayStr, CAMPUS_TIMEZONE);
    for (let i = 0; i < 7; i++) {
      const dayMoment = base.clone().add(i, "days");
      list.push({
        dateStr: dayMoment.format("YYYY-MM-DD"),
        label: i === 0 ? "Today" : dayMoment.format("ddd D"),
        isToday: i === 0,
      });
    }
    return list;
  }, [todayStr]);

  // Current time position in px along timeline (0 to 1008)
  const currentTimePositionPx = useMemo(() => {
    if (!isToday) return null;
    const currentMinutes =
      currentCampusTime.hours() * 60 + currentCampusTime.minutes();
    const startMinutes = DAY_START_HOUR * 60;
    const endMinutes = DAY_END_HOUR * 60;

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      return null;
    }

    const minutesFromStart = currentMinutes - startMinutes;
    const ratio = minutesFromStart / TOTAL_MINUTES;
    return ratio * TOTAL_WIDTH_PX;
  }, [isToday, currentCampusTime]);

  // Auto-scroll to current time on mount / date change
  useEffect(() => {
    if (scrollContainerRef.current) {
      if (currentTimePositionPx !== null) {
        const containerWidth = scrollContainerRef.current.clientWidth;
        const targetScroll = Math.max(
          0,
          currentTimePositionPx - containerWidth * 0.35,
        );
        scrollContainerRef.current.scrollTo({
          left: targetScroll,
          behavior: "smooth",
        });
      } else {
        scrollContainerRef.current.scrollTo({
          left: 0,
          behavior: "smooth",
        });
      }
    }
  }, [selectedDate, currentTimePositionPx]);

  // Mouse wheel scroll conversion
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && e.deltaX === 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.2;
    scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  // 15 hour ticks [8 AM, 9 AM, ..., 10 PM]
  const hourTicks = useMemo(() => {
    const ticks = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
      const m = moment().tz(CAMPUS_TIMEZONE).hour(h).minute(0);
      const positionPx = (h - DAY_START_HOUR) * HOUR_WIDTH_PX;
      ticks.push({
        hour: h,
        label: m.format("h A"),
        positionPx,
      });
    }
    return ticks;
  }, []);

  return (
    <div className="w-full max-w-full min-w-0 space-y-1.5 pt-1 pb-0.5 overflow-hidden">
      {/* 1. Minimal Day Selector Strip */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 w-full min-w-0">
        {daysList.map((day) => {
          const isSelected = day.dateStr === selectedDate;
          return (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => onDateChange(day.dateStr)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors shrink-0 cursor-pointer ${
                isSelected
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      {/* 2. Timeline Track & Ruler */}
      <div className="w-full max-w-full min-w-0 rounded-md bg-muted/20 border border-border/50 overflow-hidden">
        <div
          ref={scrollContainerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden select-none px-3 pt-2 pb-3 cursor-grab active:cursor-grabbing"
          style={{
            scrollbarWidth: "thin",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            className="relative"
            style={{ width: `${TOTAL_WIDTH_PX}px`, minWidth: `${TOTAL_WIDTH_PX}px` }}
          >
            {/* Top Hour Ruler with Accurate Ticks */}
            <div className="relative h-6 border-b border-border/40 mb-1 w-full">
              {hourTicks.map((tick) => {
                const alignTransform =
                  tick.hour === DAY_START_HOUR
                    ? "translateX(0)"
                    : tick.hour === DAY_END_HOUR
                    ? "translateX(-100%)"
                    : "translateX(-50%)";

                return (
                  <div
                    key={tick.hour}
                    className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                    style={{
                      left: `${tick.positionPx}px`,
                      transform: alignTransform,
                    }}
                  >
                    <span className="text-[10px] text-muted-foreground/80 font-normal leading-none whitespace-nowrap">
                      {tick.label}
                    </span>
                    <div className="w-[1px] h-2 bg-border/80 mt-1" />
                  </div>
                );
              })}
            </div>

            {/* Continuous Timeline Track (8 AM to 10 PM) */}
            <div className="relative h-12 rounded bg-muted/30 border border-border/60 overflow-hidden w-full">
              {/* Background Hourly Dividers */}
              {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR - 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-r border-border/25 pointer-events-none"
                  style={{ left: `${(i + 1) * HOUR_WIDTH_PX}px` }}
                />
              ))}

              {/* Continuous Blocks */}
              <TooltipProvider delayDuration={50}>
                {scheduleData.map((block, idx) => {
                  const startMin = Math.max(0, getMinutesFromDayStart(block.start));
                  const endMin = Math.min(TOTAL_MINUTES, getMinutesFromDayStart(block.end));
                  const durationMin = Math.max(0, endMin - startMin);

                  if (durationMin <= 0) return null;

                  const leftPx = (startMin / TOTAL_MINUTES) * TOTAL_WIDTH_PX;
                  const widthPx = (durationMin / TOTAL_MINUTES) * TOTAL_WIDTH_PX;

                  const isAvailable = block.status === "available";
                  const details = block.details as AcademicBlockDetails | null;

                  const endMoment = moment.tz(
                    `${selectedDate} ${block.end}`,
                    CAMPUS_TIMEZONE,
                  );
                  const isPast =
                    isToday &&
                    endMoment.isBefore(currentCampusTime);

                  const startTimeStr = formatTimeString(block.start);
                  const endTimeStr = formatTimeString(block.end);

                  return (
                    <HybridTooltip key={idx}>
                      <HybridTooltipTrigger asChild>
                        <div
                          className={`absolute top-0 bottom-0 border-r border-background/50 transition-colors cursor-pointer flex items-center justify-center px-1.5 overflow-hidden ${
                            isAvailable
                              ? "bg-emerald-500/25 dark:bg-emerald-950/70 border-emerald-600/30 text-emerald-900 dark:text-emerald-300 hover:bg-emerald-500/35 dark:hover:bg-emerald-900/80"
                              : "bg-rose-500/30 dark:bg-rose-950/80 border-rose-600/40 text-rose-950 dark:text-rose-200 hover:bg-rose-500/40 dark:hover:bg-rose-900/90"
                          } ${isPast ? "opacity-45" : ""}`}
                          style={{
                            left: `${leftPx}px`,
                            width: `${widthPx}px`,
                          }}
                        >
                          {/* Course / Event Name only (Clean & Minimal) */}
                          {!isAvailable && widthPx >= 30 && (
                            <span className="truncate text-[10.5px] font-semibold text-foreground/90 leading-none">
                              {details?.course || details?.title || "Class"}
                            </span>
                          )}
                        </div>
                      </HybridTooltipTrigger>

                      <HybridTooltipContent className="w-56 p-2.5 bg-popover text-popover-foreground border border-border shadow-md text-xs">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between font-medium">
                            <span
                              className={
                                isAvailable
                                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                  : "text-rose-600 dark:text-rose-400 font-semibold"
                              }
                            >
                              {isAvailable
                                ? "Available"
                                : details?.course || "Class"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDurationMinutes(durationMin)}
                            </span>
                          </div>

                          {!isAvailable && details?.title && (
                            <p className="text-xs text-popover-foreground font-medium leading-tight">
                              {details.title}
                            </p>
                          )}

                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                            <span>
                              {startTimeStr} – {endTimeStr}
                            </span>
                          </div>
                        </div>
                      </HybridTooltipContent>
                    </HybridTooltip>
                  );
                })}
              </TooltipProvider>

              {/* Minimal Current Time Line */}
              {currentTimePositionPx !== null && (
                <div
                  className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                  style={{
                    left: `${currentTimePositionPx}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 -mt-0.5" />
                  <div className="w-[1.5px] h-full bg-red-500 shadow-xs" />
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
