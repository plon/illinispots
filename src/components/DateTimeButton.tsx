import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import {
    formatLocalTime,
    useDateTimeContext,
} from "@/contexts/DateTimeContext";
import { formatTime } from "@/utils/format";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
});

import { DateTimePicker } from "@/components/ui/date-time-picker";
import DesktopDialog from "@/components/ui/desktop-dialog";
import MobileDrawer from "@/components/ui/mobile-drawer";

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
    const triggerRef = useRef<HTMLButtonElement>(null);
    const isDesktop = useMediaQuery("(min-width: 768px)");

    const handleDateTimeChange = (dateTime: Date) => {
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

    const formattedDate = DISPLAY_DATE_FORMATTER.format(selectedDateTime);
    const formattedTimeStr = formatTime(
        formatLocalTime(selectedDateTime).slice(0, 5),
    );
    const formattedDateTimeSubtext =
        `${selectedDateTime.getMonth() + 1}/${selectedDateTime.getDate()} ${formattedTimeStr}`;

    const triggerButton = (
        <Button
            ref={triggerRef}
            variant="outline"
            className={cn(
                `h-9 rounded-full lg:rounded-lg border flex items-center gap-2 w-9 lg:w-auto px-0 lg:px-3 shrink-0 ${!isCurrentDateTime ? "bg-muted" : ""
                }`,
                className,
            )}
            aria-label="Select date and time"
            aria-expanded={open}
            aria-haspopup="dialog"
            title={`Selected: ${formattedDate} ${formattedTimeStr}`}
            disabled={isFetching}
            onClick={() => setOpen(true)}
        >
            <CalendarClock size={16} className="lg:w-4 lg:h-4" />
            <span className="hidden lg:inline text-sm font-light">
                {isCurrentDateTime ? "Now" : formattedDateTimeSubtext}
            </span>
        </Button>
    );

    const dateTimePickerComponent = open ? (
        <DateTimePicker
            initialDateTime={selectedDateTime}
            onDateTimeChange={handleDateTimeChange}
            onResetToNow={handleResetToNow}
            compact={true}
            isFetching={isFetching}
            closeContainer={closeContainer}
        />
    ) : null;

    if (isDesktop) {
        return (
            <>
                {triggerButton}
                {open && (
                    <DesktopDialog
                        open={open}
                        onOpenChange={setOpen}
                        returnFocusRef={triggerRef}
                        title="Select Date and Time"
                        contentClassName="sm:max-w-xs p-0 [&>button:last-child]:hidden"
                    >
                        <div className="p-4 flex justify-center">
                            {dateTimePickerComponent}
                        </div>
                    </DesktopDialog>
                )}
            </>
        );
    }

    return (
        <>
            {triggerButton}
            {open && (
                <MobileDrawer
                    open={open}
                    onOpenChange={setOpen}
                    returnFocusRef={triggerRef}
                    contentClassName="flex flex-col items-center"
                >
                    <div className="p-4 pt-2 flex justify-center w-full">
                        {dateTimePickerComponent}
                    </div>
                </MobileDrawer>
            )}
        </>
    );
};

export default DateTimeButton;
