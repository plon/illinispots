import React, { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Drawer,
    DrawerContent,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {
    formatLocalTime,
    useDateTimeContext,
} from "@/contexts/DateTimeContext";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { formatTime } from "@/utils/format";

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
});

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

    const close = () => setOpen(false);
    const handleDateTimeChange = (dateTime: Date) => {
        setSelectedDateTime(dateTime);
        close();
    };
    const handleResetToNow = () => {
        resetToCurrentDateTime();
        close();
    };

    const formattedDate = DISPLAY_DATE_FORMATTER.format(selectedDateTime);
    const formattedTime = formatTime(
        formatLocalTime(selectedDateTime).slice(0, 5),
    );
    const formattedDateTimeSubtext = `${selectedDateTime.getMonth() + 1}/${selectedDateTime.getDate()} ${formattedTime}`;

    const trigger = (
        <Button
            variant="outline"
            className={cn(
                "h-9 rounded-full lg:rounded-lg border flex items-center gap-2 w-9 lg:w-auto px-0 lg:px-3 shrink-0",
                !isCurrentDateTime && "bg-muted",
                className,
            )}
            aria-label="Select date and time"
            title={`Selected: ${formattedDate} ${formattedTime}`}
            disabled={isFetching}
        >
            <CalendarClock size={16} className="lg:w-4 lg:h-4" />
            <span className="hidden lg:inline text-sm font-light">
                {isCurrentDateTime ? "Now" : formattedDateTimeSubtext}
            </span>
        </Button>
    );

    const picker = open ? (
        <DateTimePicker
            initialDateTime={selectedDateTime}
            onDateTimeChange={handleDateTimeChange}
            onResetToNow={handleResetToNow}
            compact
            isFetching={isFetching}
            closeContainer={close}
        />
    ) : null;

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>{trigger}</DialogTrigger>
                <DialogContent className="sm:max-w-xs p-0 [&>button:last-child]:hidden">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Select Date and Time</DialogTitle>
                    </DialogHeader>
                    <div className="p-4 flex justify-center">{picker}</div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>{trigger}</DrawerTrigger>
            <DrawerContent className="flex flex-col items-center">
                <div className="p-4 pt-2 flex justify-center w-full">
                    {picker}
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default DateTimeButton;
