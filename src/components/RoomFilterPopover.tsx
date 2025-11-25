import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, X, Hourglass, Clock } from "lucide-react";

interface RoomFilterPopoverProps {
    minDuration: number | undefined;
    setMinDuration: (value: number | undefined) => void;
    freeUntil: string;
    setFreeUntil: (value: string) => void;
    startTime: string;
    setStartTime: (value: string) => void;
    activeFilterCount: number;
    hasActiveFilters: boolean;
    onClearAll: () => void;
    matchingRoomsCount: number;
}

const RoomFilterPopover: React.FC<RoomFilterPopoverProps> = ({
    minDuration,
    setMinDuration,
    freeUntil,
    setFreeUntil,
    startTime,
    setStartTime,
    activeFilterCount,
    hasActiveFilters,
    onClearAll,
    matchingRoomsCount,
}) => {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={hasActiveFilters ? "default" : "outline"}
                    size="sm"
                    className={`h-9 md:h-9 rounded-full border-2 flex items-center gap-2 px-3 transition-all duration-200 ${hasActiveFilters
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : "border-foreground/20 hover:border-foreground/40"
                        }`}
                    aria-label="Filter options"
                >
                    <Filter size={16} />
                    <span className="text-xs font-medium">
                        {activeFilterCount > 0 ? `${activeFilterCount}` : "Filter"}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-80 p-0 overflow-hidden border-border/50 shadow-xl"
                align="end"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="bg-muted/30 p-4 border-b border-border/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="bg-primary/10 p-1.5 rounded-md">
                            <Filter size={14} className="text-primary" />
                        </div>
                        <h4 className="font-semibold text-sm">Filters</h4>
                    </div>
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={onClearAll}
                        >
                            <X size={12} className="mr-1" />
                            Clear all
                        </Button>
                    )}
                </div>

                <div className="p-4 space-y-6">
                    <div className="text-[10px] text-muted-foreground bg-muted/30 -mx-4 -mt-4 px-4 py-2 border-b border-border/50">
                        <span className="font-medium text-foreground">{matchingRoomsCount}</span> room
                        {matchingRoomsCount === 1 ? "" : "s"} match
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
            </PopoverContent>
        </Popover>
    );
};

export default RoomFilterPopover;
