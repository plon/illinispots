"use client";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw } from "lucide-react";
import { useId, useState, useEffect } from "react";
import moment from "moment-timezone";

interface DateTimePickerProps {
  initialDateTime?: Date;
  onDateTimeChange?: (dateTime: Date) => void;
  showResetButton?: boolean;
  compact?: boolean;
  isFetching?: boolean;
  closePopover?: () => void;
}

function DateTimePicker({
  initialDateTime = new Date(),
  onDateTimeChange,
  showResetButton = true,
  compact = false,
  isFetching = false,
  closePopover,
}: DateTimePickerProps) {
  const id = useId();
  const [localSelectedDate, setLocalSelectedDate] = useState<Date | undefined>(
    initialDateTime,
  );
  const initialTimeValue = moment(initialDateTime).format("HH:mm");
  const [localTimeValue, setLocalTimeValue] = useState(initialTimeValue);

  useEffect(() => {
    setLocalSelectedDate(initialDateTime);
    setLocalTimeValue(moment(initialDateTime).format("HH:mm"));
  }, [initialDateTime]);

  const getCombinedDateTime = (date: Date, time: string): Date | undefined => {
    const [hours, minutes] = time.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      console.error("Error parsing time value:", time);
      return undefined;
    }
    const combinedDate = new Date(date.getTime());
    combinedDate.setHours(hours);
    combinedDate.setMinutes(minutes);
    combinedDate.setSeconds(0);
    combinedDate.setMilliseconds(0);
    return combinedDate;
  };

  const handleDateSelect = (date: Date | undefined) => {
    setLocalSelectedDate(date);
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTimeValue(event.target.value);
  };

  const handleConfirm = () => {
    if (localSelectedDate) {
      const combinedDateTime = getCombinedDateTime(
        localSelectedDate,
        localTimeValue,
      );
      if (combinedDateTime && onDateTimeChange) {
        onDateTimeChange(combinedDateTime);
        if (closePopover) closePopover();
      }
    }
  };

  const handleReset = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    setLocalSelectedDate(now);
    setLocalTimeValue(moment(now).format("HH:mm"));
    if (onDateTimeChange) {
      onDateTimeChange(now);
      if (closePopover) closePopover();
    }
  };

  const currentLocalFullDateTime = localSelectedDate
    ? getCombinedDateTime(localSelectedDate, localTimeValue)
    : undefined;
  const initialComparableDateTime = new Date(initialDateTime.getTime());
  initialComparableDateTime.setSeconds(0, 0);
  const hasChanges =
    !currentLocalFullDateTime ||
    currentLocalFullDateTime.getTime() !== initialComparableDateTime.getTime();

  // --- Format the preview text (Updated Format String) ---
  const previewText = currentLocalFullDateTime
    ? moment(currentLocalFullDateTime).format("M/D/YY h:mm A") // <-- Updated format
    : "Invalid date/time";
  // ---

  return (
    <div className={compact ? "w-[280px]" : ""}>
      <div
        className={`rounded-lg border border-border ${isFetching ? "opacity-70" : ""}`}
      >
        {/* Calendar */}
        <Calendar
          mode="single"
          className={compact ? "p-1 bg-background" : "p-2 bg-background"}
          selected={localSelectedDate}
          onSelect={handleDateSelect}
          initialFocus
          disabled={isFetching}
        />
        {/* Time Input Section */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3">
            <Label htmlFor={id} className="text-xs">
              Enter time
            </Label>
            <div className="relative grow">
              <Input
                id={id}
                type="time"
                step="60"
                value={localTimeValue}
                onChange={handleTimeChange}
                className="peer ps-9 [&::-webkit-calendar-picker-indicator]:hidden"
                disabled={isFetching}
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
                <Clock size={16} strokeWidth={2} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section with Preview and Buttons */}
      <div className="mt-2 flex justify-between items-center gap-2">
        {/* Preview Text */}
        <p className="text-xs text-muted-foreground truncate flex-1 mr-2">
          {previewText}
        </p>

        {/* Buttons Group */}
        <div className="flex items-center gap-2">
          {showResetButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-7 px-2"
              disabled={isFetching}
            >
              <RotateCcw size={14} className="mr-1" />
              Now
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleConfirm}
            className="h-7 px-3"
            disabled={isFetching || !hasChanges}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

export { DateTimePicker };
