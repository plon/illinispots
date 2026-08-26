import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import {
  type CampusDateTime,
  parseTimeToMinutes,
} from "@/utils/time";

interface DateTimePickerProps {
  initialDateTime: CampusDateTime;
  onDateTimeChange: (dateTime: CampusDateTime) => void;
  onResetToNow: () => void;
  isFetching: boolean;
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
}: DateTimePickerProps) {
  const id = useId();
  const [localSelectedDate, setLocalSelectedDate] = useState<Date | undefined>(
    () => dateStringToCalendarDate(initialDateTime.date),
  );
  const [localTimeValue, setLocalTimeValue] = useState(
    () => initialDateTime.time.slice(0, 5),
  );

  const selectedDate = localSelectedDate
    ? calendarDateToString(localSelectedDate)
    : null;
  const isValidSelection =
    selectedDate !== null && parseTimeToMinutes(localTimeValue) !== null;

  const handleConfirm = () => {
    if (!selectedDate || !isValidSelection) return;
    onDateTimeChange({ date: selectedDate, time: `${localTimeValue}:00` });
  };

  return (
    <div className="w-[280px]">
      <div
        className={`rounded-lg border border-border overflow-hidden bg-card ${isFetching ? "opacity-70" : ""}`}
      >
        <Calendar
          mode="single"
          className="p-1 bg-background"
          selected={localSelectedDate}
          onSelect={setLocalSelectedDate}
          initialFocus
          disabled={isFetching}
        />

        <div className="border-t border-border p-3 bg-muted/10">
          <div className="flex items-center gap-3">
            <Label htmlFor={id} className="text-xs font-medium text-foreground shrink-0">
              Time
            </Label>
            <div className="relative grow min-w-0">
              <Input
                id={id}
                type="time"
                step="60"
                value={localTimeValue}
                onChange={(event) => setLocalTimeValue(event.target.value)}
                className="peer pl-8 pr-2.5 h-8 text-xs font-mono appearance-none [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-0 [&::-webkit-calendar-picker-indicator]:hidden"
                disabled={isFetching}
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-2.5 text-muted-foreground/80 peer-disabled:opacity-50">
                <Clock size={13} strokeWidth={2} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResetToNow}
          className="h-8 text-xs flex-1 font-normal"
          disabled={isFetching}
        >
          <RotateCcw size={13} className="mr-1.5" />
          Now
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleConfirm}
          className="h-8 text-xs flex-1 font-medium"
          disabled={isFetching || !isValidSelection}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

export { DateTimePicker };
