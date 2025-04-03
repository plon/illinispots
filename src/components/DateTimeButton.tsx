"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import { formatTime } from "@/utils/format";
import moment from "moment-timezone";

interface DateTimeButtonProps {
  className?: string;
  isFetching: boolean;
}

const DateTimeButton: React.FC<DateTimeButtonProps> = ({
  className,
  isFetching,
}) => {
  const { selectedDateTime, setSelectedDateTime, isCurrentDateTime } =
    useDateTimeContext();
  const [isOpen, setIsOpen] = useState(false);

  const handleDateTimeChange = (dateTime: Date) => {
    setSelectedDateTime(dateTime);
    setIsOpen(false);
  };

  const formattedDate = moment(selectedDateTime).format("MMM D, YYYY");
  const formattedTimeStr = formatTime(moment(selectedDateTime).format("HH:mm"));

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold ${
            !isCurrentDateTime ? "bg-muted" : ""
          } ${className || ""}`}
          aria-label="Select date and time"
          title={`Selected: ${formattedDate} ${formattedTimeStr}`}
          disabled={isFetching}
        >
          <CalendarClock size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="p-3">
          <h3 className="font-medium text-sm mb-2">Select Date & Time</h3>
          <DateTimePicker
            initialDateTime={selectedDateTime}
            onDateTimeChange={handleDateTimeChange}
            compact={true}
            isFetching={isFetching}
            closePopover={() => setIsOpen(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateTimeButton;
