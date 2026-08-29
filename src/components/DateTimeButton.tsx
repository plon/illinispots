import React, { useState } from "react";
import { usePostHog } from "@/client/analytics";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import { formatDateForDisplay, formatShortMonthDay, formatTimeForDisplay } from "@/utils/time";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
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
    const posthog = usePostHog();
    const {
        selectedDateTime,
        setSelectedDateTime,
        isCurrentDateTime,
        resetToCurrentDateTime,
    } = useDateTimeContext();
    const [open, setOpen] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 768px)");

    const handleDateTimeChange = (dateTime: typeof selectedDateTime) => {
        posthog.capture("date_time_changed", {
            selected_date: dateTime.date,
            selected_time: dateTime.time,
        });
        setSelectedDateTime(dateTime);
        setOpen(false);
    };

    const handleResetToNow = () => {
        posthog.capture("date_time_changed", {
            selection: "now",
        });
        resetToCurrentDateTime();
        setOpen(false);
    };

    const formattedDate = formatDateForDisplay(selectedDateTime.date);
    const formattedTimeStr = formatTimeForDisplay(selectedDateTime.time);
    const formattedDateTimeSubtext = `${formatShortMonthDay(selectedDateTime.date)} ${formattedTimeStr}`;

    const triggerButton = (
        <Button
            variant="outline"
            className={cn(
                `relative h-9 rounded-full lg:rounded-lg border flex items-center gap-2 w-9 lg:w-auto px-0 lg:px-3 shrink-0 transition-colors ${
                    !isCurrentDateTime
                        ? "border-primary/50 bg-primary/10 text-primary font-medium hover:bg-primary/15"
                        : "border-input hover:border-foreground/40 text-foreground"
                }`,
                className,
            )}
            aria-label={`Select date and time. Currently viewing ${
                isCurrentDateTime ? "live" : `${formattedDate} ${formattedTimeStr}`
            }`}
            title={`Selected: ${formattedDate} ${formattedTimeStr}`}
            disabled={isFetching}
        >
            <CalendarClock size={16} className="lg:w-4 lg:h-4" />
            <span className="hidden lg:inline text-sm font-light">
                {isCurrentDateTime ? "Now" : formattedDateTimeSubtext}
            </span>
            {!isCurrentDateTime && (
                <span className="lg:hidden absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background" />
            )}
        </Button>
    );

    const dateTimePickerComponent = (
        <DateTimePicker
            initialDateTime={selectedDateTime}
            onDateTimeChange={handleDateTimeChange}
            onResetToNow={handleResetToNow}
            isFetching={isFetching}
        />
    );

    if (isDesktop) {
        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
                <PopoverContent
                    className="w-auto p-3 border-border/60 shadow-xl"
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    {dateTimePickerComponent}
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
            <DrawerContent className="flex flex-col items-center max-h-[90vh]">
                <div className="p-4 pt-2 flex justify-center w-full overflow-y-auto">
                    {dateTimePickerComponent}
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default DateTimeButton;
