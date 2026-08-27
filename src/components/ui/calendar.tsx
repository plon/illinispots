import * as React from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export interface CalendarProps {
  className?: string;
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  disabled?: boolean;
  showOutsideDays?: boolean;
  mode?: "single";
  initialFocus?: boolean;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function Calendar({
  className,
  selected,
  onSelect,
  disabled = false,
  showOutsideDays = true,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() =>
    startOfMonth(selected ?? new Date()),
  );

  React.useEffect(() => {
    if (selected) {
      setCurrentMonth(startOfMonth(selected));
    }
  }, [selected]);

  const days = React.useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonth]);

  const handlePreviousMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  return (
    <div className={cn("p-2", className)}>
      <div className="relative flex h-9 items-center justify-between">
        <button
          type="button"
          onClick={handlePreviousMonth}
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "size-9 text-muted-foreground/80 hover:text-foreground p-0",
          )}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="text-sm font-medium">
          {format(currentMonth, "MMMM yyyy")}
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "size-9 text-muted-foreground/80 hover:text-foreground p-0",
          )}
          aria-label="Next month"
        >
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 text-center">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="size-9 p-0 text-xs font-medium text-muted-foreground/80 flex items-center justify-center"
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-y-0.5 justify-items-center">
        {days.map((day) => {
          const isSelected = selected ? isSameDay(day, selected) : false;
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);

          if (!isCurrentMonth && !showOutsideDays) {
            return (
              <div
                key={day.toISOString()}
                className="size-9 p-0"
                aria-hidden="true"
              />
            );
          }

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                if (!isCurrentMonth) {
                  setCurrentMonth(startOfMonth(day));
                }
                onSelect?.(isSelected ? undefined : day);
              }}
              className={cn(
                "relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg p-0 text-sm outline-offset-2 focus:outline-none focus-visible:z-10 hover:bg-accent hover:text-foreground",
                !isCurrentMonth && "text-muted-foreground/40",
                isSelected &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground font-medium",
                isTodayDate && !isSelected && "font-semibold text-primary",
                disabled && "text-foreground/30 line-through pointer-events-none",
              )}
              aria-label={format(day, "EEEE, MMMM d, yyyy")}
              aria-selected={isSelected ? "true" : undefined}
            >
              {format(day, "d")}
              {isTodayDate && (
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-1 start-1/2 size-[3px] -translate-x-1/2 rounded-full",
                    isSelected ? "bg-primary-foreground" : "bg-primary",
                  )}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
