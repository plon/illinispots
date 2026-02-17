import React, { useState } from "react";
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
import { ListFilter, Hourglass, Clock, Building2, DoorOpen, Search } from "lucide-react";

interface RoomFilterPopoverProps {
    minDuration: number | undefined;
    setMinDuration: (value: number | undefined) => void;
    freeUntil: string;
    setFreeUntil: (value: string) => void;
    startTime: string;
    setStartTime: (value: string) => void;
    hasActiveFilters: boolean;
    onClearAll: () => void;
    matchingRoomsCount: number;
    searchMode: "facilities" | "rooms";
    setSearchMode: (mode: "facilities" | "rooms") => void;
}

const RoomFilterPopover: React.FC<RoomFilterPopoverProps> = ({
    minDuration,
    setMinDuration,
    freeUntil,
    setFreeUntil,
    startTime,
    setStartTime,
    hasActiveFilters,
    onClearAll,
    matchingRoomsCount,
    searchMode,
    setSearchMode,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 768px)");

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
                            onClick={onClearAll}
                        >
                            Clear all
                        </Button>
                    )}
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                        <Search size={14} className="text-muted-foreground" />
                        Search By
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            variant={searchMode === "facilities" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSearchMode("facilities")}
                            className={`h-9 text-xs font-medium transition-all flex items-center gap-1.5 ${searchMode === "facilities"
                                ? "shadow-sm"
                                : "hover:border-primary/50 hover:bg-primary/5"
                                }`}
                        >
                            <Building2 size={14} />
                            Building
                        </Button>
                        <Button
                            variant={searchMode === "rooms" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSearchMode("rooms")}
                            className={`h-9 text-xs font-medium transition-all flex items-center gap-1.5 ${searchMode === "rooms"
                                ? "shadow-sm"
                                : "hover:border-primary/50 hover:bg-primary/5"
                                }`}
                        >
                            <DoorOpen size={14} />
                            Room
                        </Button>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                            <Clock size={14} className="text-muted-foreground" />
                            Start Time
                        </div>
                        {startTime && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent underline"
                                onClick={() => setStartTime("")}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    <div className="relative">
                        <Input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            onFocus={() => {
                                if (!startTime) {
                                    const now = new Date();
                                    const hours = String(now.getHours()).padStart(2, '0');
                                    const minutes = String(now.getMinutes()).padStart(2, '0');
                                    setStartTime(`${hours}:${minutes}`);
                                }
                            }}
                            className="h-9 pl-9 font-mono text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                            placeholder="When room must be free"
                        />
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-muted-foreground pl-1">
                        Find rooms that are available by this time.
                    </p>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                            <Clock size={14} className="text-muted-foreground" />
                            Minimum Duration
                        </div>
                        {minDuration && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent underline"
                                onClick={() => setMinDuration(undefined)}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {[30, 60, 120, 240].map((mins) => (
                            <Button
                                key={mins}
                                variant={minDuration === mins ? "default" : "outline"}
                                size="sm"
                                onClick={() =>
                                    setMinDuration(minDuration === mins ? undefined : mins)
                                }
                                className={`h-9 text-xs font-medium transition-all ${minDuration === mins
                                    ? "shadow-sm"
                                    : "hover:border-primary/50 hover:bg-primary/5"
                                    }`}
                            >
                                {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                            <Hourglass size={14} className="text-muted-foreground" />
                            Free Until
                        </div>
                        {freeUntil && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent underline"
                                onClick={() => setFreeUntil("")}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                            {["12:00", "15:00", "18:00"].map((time) => (
                                <Button
                                    key={time}
                                    variant={freeUntil === time ? "default" : "outline"}
                                    size="sm"
                                    onClick={() =>
                                        setFreeUntil(freeUntil === time ? "" : time)
                                    }
                                    className={`h-8 text-xs font-medium transition-all ${freeUntil === time
                                        ? "shadow-sm"
                                        : "hover:border-primary/50 hover:bg-primary/5"
                                        }`}
                                >
                                    {time}
                                </Button>
                            ))}
                        </div>
                        <div className="relative">
                            <Input
                                type="time"
                                value={freeUntil}
                                onChange={(e) => setFreeUntil(e.target.value)}
                                onFocus={() => {
                                    if (!freeUntil) {
                                        const now = new Date();
                                        const hours = String(now.getHours()).padStart(2, '0');
                                        const minutes = String(now.getMinutes()).padStart(2, '0');
                                        setFreeUntil(`${hours}:${minutes}`);
                                    }
                                }}
                                className="h-9 pl-9 font-mono text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                                placeholder="Custom time"
                            />
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground pl-1">
                        Find rooms available at least until this time today.
                    </p>
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
