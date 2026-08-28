import React, { useState } from "react";
import { usePostHog } from "@posthog/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Drawer,
    DrawerContent,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ListFilter, Clock } from "lucide-react";
import { getCampusDateTimeParts } from "@/utils/time";

const PRESET_DURATIONS = [30, 60, 120, 240] as const;
const MIN_CUSTOM_DURATION = 1;

interface RoomFilterPopoverProps {
    minDuration: number | undefined;
    setMinDuration: (value: number | undefined) => void;
    freeUntil: string;
    setFreeUntil: (value: string) => void;
    hasActiveFilters: boolean;
    onClearAll: () => void;
    matchingRoomsCount: number;
}

const RoomFilterPopover: React.FC<RoomFilterPopoverProps> = ({
    minDuration,
    setMinDuration,
    freeUntil,
    setFreeUntil,
    hasActiveFilters,
    onClearAll,
    matchingRoomsCount,
}) => {
    const posthog = usePostHog();
    const [isOpen, setIsOpen] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const [isCustomDurationOpen, setIsCustomDurationOpen] = useState(false);
    const [customDuration, setCustomDuration] = useState(() =>
        minDuration !== undefined && !PRESET_DURATIONS.includes(minDuration as (typeof PRESET_DURATIONS)[number])
            ? String(minDuration)
            : "",
    );

    const customDurationNumber = customDuration === "" ? undefined : Number(customDuration);
    const isCustomDurationValid =
        customDurationNumber !== undefined &&
        Number.isInteger(customDurationNumber) &&
        customDurationNumber >= MIN_CUSTOM_DURATION;
    const hasCustomDurationError = customDuration !== "" && !isCustomDurationValid;

    const handleCustomDurationChange = (value: string) => {
        setCustomDuration(value);

        if (value === "") {
            setMinDuration(undefined);
            return;
        }

        const parsedValue = Number(value);
        if (
            Number.isInteger(parsedValue) &&
            parsedValue >= MIN_CUSTOM_DURATION
        ) {
            setMinDuration(parsedValue);
        } else {
            setMinDuration(undefined);
        }
    };

    const captureCustomDuration = () => {
        if (isCustomDurationValid) {
            posthog.capture("room_filter_applied", {
                filter_type: "minimum_duration",
                minimum_duration_minutes: customDurationNumber,
                selection_source: "custom",
            });
        }
    };

    const applyFreeUntil = (value: string, selectionSource: "picker" | "focus_default") => {
        setFreeUntil(value);
        posthog.capture("room_filter_applied", {
            filter_type: "free_until",
            ...(value
                ? { free_until: value, selection_source: selectionSource }
                : { action: "cleared" }),
        });
    };

    const clearFreeUntil = () => {
        setFreeUntil("");
        posthog.capture("room_filter_applied", {
            filter_type: "free_until",
            action: "cleared",
        });
    };

    const openCustomDuration = () => {
        if (!customDuration && minDuration !== undefined) {
            setCustomDuration(String(minDuration));
        }
        setIsCustomDurationOpen(true);
    };

    const selectPresetDuration = (duration: number | undefined) => {
        posthog.capture("room_filter_applied", {
            filter_type: "minimum_duration",
            ...(duration === undefined
                ? { action: "cleared" }
                : { minimum_duration_minutes: duration }),
        });
        setIsCustomDurationOpen(false);
        setCustomDuration("");
        setMinDuration(duration);
    };

    const clearMinimumDuration = () => {
        posthog.capture("room_filter_applied", {
            filter_type: "minimum_duration",
            action: "cleared",
        });
        setIsCustomDurationOpen(false);
        setCustomDuration("");
        setMinDuration(undefined);
    };

    const clearAllFilters = () => {
        posthog.capture("room_filter_applied", {
            filter_type: "all",
            action: "cleared",
        });
        setIsCustomDurationOpen(false);
        setCustomDuration("");
        onClearAll();
    };

    const TriggerButton = (
        <Button
            variant={hasActiveFilters ? "default" : "outline"}
            size="icon"
            className={`h-9 w-9 rounded-full border transition-all duration-200 ${hasActiveFilters
                ? "border-primary bg-primary text-primary-foreground shadow-md"
                : "border-input hover:border-foreground/40"
                }`}
            aria-label="Filter options"
        >
            <ListFilter size={16} />
        </Button>
    );

    const content = (
        <div>
            <div className="px-4 space-y-6 pb-4">
                <div className="text-xs text-muted-foreground bg-muted/30 -mx-4 px-4 py-3 border-b border-border/50 flex items-center justify-between">
                    <span>
                        <span className="font-medium text-foreground">{matchingRoomsCount}</span> room
                        {matchingRoomsCount === 1 ? "" : "s"} match
                    </span>
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1 text-xs text-muted-foreground hover:text-destructive hover:bg-transparent underline"
                            onClick={clearAllFilters}
                        >
                            Clear all
                        </Button>
                    )}
                </div>



                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                            <Clock size={14} className="text-muted-foreground" />
                            Free Until
                        </div>
                        {freeUntil && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent underline"
                                onClick={clearFreeUntil}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    <div className="relative">
                        <Input
                            type="time"
                            value={freeUntil}
                            onChange={(e) => applyFreeUntil(e.target.value, "picker")}
                            onFocus={() => {
                                if (!freeUntil) {
                                    const campusNow = getCampusDateTimeParts();
                                    applyFreeUntil(campusNow.time.slice(0, 5), "focus_default");
                                }
                            }}
                            className="h-9 pl-9 pr-3 font-mono text-sm appearance-none [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-0 [&::-webkit-calendar-picker-indicator]:hidden"
                            placeholder="Custom time"
                        />
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                            <Clock size={14} className="text-muted-foreground" />
                            Available for at least
                        </div>
                        {minDuration && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent underline"
                                onClick={clearMinimumDuration}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                        {PRESET_DURATIONS.map((mins) => (
                            <Button
                                key={mins}
                                variant={minDuration === mins && !isCustomDurationOpen ? "default" : "outline"}
                                size="sm"
                                onClick={() => selectPresetDuration(minDuration === mins && !isCustomDurationOpen ? undefined : mins)}
                                className={`h-9 text-xs font-medium transition-all ${minDuration === mins && !isCustomDurationOpen
                                    ? "shadow-sm"
                                    : "hover:border-primary/50 hover:bg-primary/5"
                                    }`}
                            >
                                {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                            </Button>
                        ))}
                        <Button
                            variant={isCustomDurationOpen ? "default" : "outline"}
                            size="sm"
                            onClick={openCustomDuration}
                            className={`h-9 text-xs font-medium transition-all ${isCustomDurationOpen
                                ? "shadow-sm"
                                : "hover:border-primary/50 hover:bg-primary/5"
                                }`}
                        >
                            Custom
                        </Button>
                    </div>
                    {isCustomDurationOpen && (
                        <div className="space-y-1.5">
                            <div className="relative">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={MIN_CUSTOM_DURATION}
                                    step={1}
                                    value={customDuration}
                                    onChange={(e) => handleCustomDurationChange(e.target.value)}
                                    onBlur={captureCustomDuration}
                                    placeholder="e.g. 90"
                                    aria-label="Custom minimum availability duration in minutes"
                                    aria-invalid={hasCustomDurationError}
                                    className={`h-9 pr-14 font-mono text-sm ${hasCustomDurationError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    min
                                </span>
                            </div>
                            {hasCustomDurationError && (
                                <p className="text-[10px] pl-1 text-destructive">
                                    Enter a whole number of minutes, at least 1.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    if (isDesktop) {
        return (
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    {TriggerButton}
                </PopoverTrigger>
                <PopoverContent
                    className="w-80 p-0 border-border/50 shadow-xl"
                    side="bottom"
                    align="end"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    {content}
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
            <DrawerTrigger asChild>
                {TriggerButton}
            </DrawerTrigger>
            <DrawerContent className="max-h-[90vh]">
                <div className="overflow-y-auto">
                    {content}
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default RoomFilterPopover;
