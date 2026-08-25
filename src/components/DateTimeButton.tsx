import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import { formatDateForDisplay, formatTimeForDisplay } from "@/utils/time";
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
    const {
        selectedDateTime,
        setSelectedDateTime,
        isCurrentDateTime,
        resetToCurrentDateTime,
    } = useDateTimeContext();
    const [open, setOpen] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 768px)");

    const handleDateTimeChange = (dateTime: typeof selectedDateTime) => {
        setSelectedDateTime(dateTime);
        setOpen(false);
    };

    const handleResetToNow = () => {
        resetToCurrentDateTime();
        setOpen(false);
    };

    const closeContainer = () => {
        setOpen(false);
    };

    const formattedDate = formatDateForDisplay(selectedDateTime.date);
    const formattedTimeStr = formatTimeForDisplay(selectedDateTime.time);
    const [, month, day] = selectedDateTime.date.split("-");
    const formattedDateTimeSubtext = `${Number(month)}/${Number(day)} ${formattedTimeStr}`;

    const triggerButton = (
        <Button
            variant="outline"
            className={cn(
                `h-9 rounded-full lg:rounded-lg border flex items-center gap-2 w-9 lg:w-auto px-0 lg:px-3 shrink-0 ${!isCurrentDateTime ? "bg-muted" : ""
                }`,
                className,
            )}
            aria-label="Select date and time"
            title={`Selected: ${formattedDate} ${formattedTimeStr}`}
            disabled={isFetching}
        >
            <CalendarClock size={16} className="lg:w-4 lg:h-4" />
            <span className="hidden lg:inline text-sm font-light">
                {isCurrentDateTime ? "Now" : formattedDateTimeSubtext}
            </span>
        </Button>
    );

    const dateTimePickerComponent = (
        <DateTimePicker
            initialDateTime={selectedDateTime}
            onDateTimeChange={handleDateTimeChange}
            onResetToNow={handleResetToNow}
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
            <DrawerContent className="flex flex-col items-center">
                <div className="p-4 pt-2 flex justify-center w-full">
                    {dateTimePickerComponent}
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default DateTimeButton;
