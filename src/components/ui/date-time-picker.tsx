import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw } from "lucide-react";
import { useId, useState, useEffect } from "react";
import {
  type CampusDateTime,
  formatDateForDisplay,
  formatTimeForDisplay,
  getCampusDateTimeParts,
  parseTimeToMinutes,
} from "@/utils/time";

interface DateTimePickerProps {
  initialDateTime: CampusDateTime;
  onDateTimeChange: (dateTime: CampusDateTime) => void;
  onResetToNow: () => void;
  isFetching: boolean;
  closeContainer: () => void;
}

function dateStringToCalendarDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function calendarDateToString(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function DateTimePicker({
  initialDateTime,
  onDateTimeChange,
  onResetToNow,
  isFetching,
  closeContainer,
}: DateTimePickerProps) {
  const id = useId();
  const [localSelectedDate, setLocalSelectedDate] = useState<Date | undefined>(
    () => dateStringToCalendarDate(initialDateTime.date),
  );
  const [localTimeValue, setLocalTimeValue] = useState(
    initialDateTime.time.slice(0, 5),
  );

  useEffect(() => {
    setLocalSelectedDate(dateStringToCalendarDate(initialDateTime.date));
    setLocalTimeValue(initialDateTime.time.slice(0, 5));
  }, [initialDateTime]);

  const selectedDate = localSelectedDate
    ? calendarDateToString(localSelectedDate)
    : null;
  const isValidSelection =
    selectedDate !== null && parseTimeToMinutes(localTimeValue) !== null;

  const handleConfirm = () => {
    if (!selectedDate || !isValidSelection) return;
    onDateTimeChange({ date: selectedDate, time: `${localTimeValue}:00` });
    closeContainer();
  };

  const handleReset = () => {
    const now = getCampusDateTimeParts();
    setLocalSelectedDate(dateStringToCalendarDate(now.date));
    setLocalTimeValue(now.time.slice(0, 5));
    onResetToNow();
    closeContainer();
  };

  const previewText = isValidSelection
    ? `${formatDateForDisplay(selectedDate)} ${formatTimeForDisplay(localTimeValue)}`
    : "Invalid date/time";

  return (
    <div className="w-[280px]">
      <div
        className={`rounded-lg border border-border overflow-hidden ${isFetching ? "opacity-70" : ""}`}
      >
        <Calendar
          mode="single"
          className="p-1 bg-background"
          selected={localSelectedDate}
          onSelect={setLocalSelectedDate}
          initialFocus
          disabled={isFetching}
        />
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3">
            <Label htmlFor={id} className="text-xs">
              Enter time
            </Label>
            <div className="relative grow min-w-0">
              <Input
                id={id}
                type="time"
                step="60"
                value={localTimeValue}
                onChange={(event) => setLocalTimeValue(event.target.value)}
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

      <div className="mt-2 flex justify-between items-center gap-2">
        <p className="text-xs text-muted-foreground truncate flex-1 mr-2">
          {previewText}
        </p>
        <div className="flex items-center gap-2">
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
          <Button
            size="sm"
            onClick={handleConfirm}
            className="h-7 px-3"
            disabled={isFetching || !isValidSelection}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

export { DateTimePicker };
