"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import { formatTime } from "@/utils/format";
import moment from "moment-timezone";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handleDateTimeChange = (dateTime: Date) => {
    setSelectedDateTime(dateTime);
    setOpen(false);
  };

  const closeContainer = () => {
    setOpen(false);
  };

  const formattedDate = moment(selectedDateTime).format("MMM D, YYYY");
  const formattedTimeStr = formatTime(moment(selectedDateTime).format("HH:mm"));

  const triggerButton = (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        `h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold ${
          !isCurrentDateTime ? "bg-muted" : ""
        }`,
        className,
      )}
      aria-label="Select date and time"
      title={`Selected: ${formattedDate} ${formattedTimeStr}`}
      disabled={isFetching}
    >
      <CalendarClock size={12} />
    </Button>
  );

  const dateTimePickerComponent = (
    <DateTimePicker
      initialDateTime={selectedDateTime}
      onDateTimeChange={handleDateTimeChange}
      compact={true}
      isFetching={isFetching}
      closeContainer={closeContainer}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="sm:max-w-xs p-0 [&>button:last-child]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Select Date and Time</DialogTitle>
          </DialogHeader>
          <div className="p-4 flex justify-center">
            {dateTimePickerComponent}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <div className="p-4 pt-2 flex justify-center">
          {dateTimePickerComponent}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DateTimeButton;
