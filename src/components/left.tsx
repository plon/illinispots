import React, {
    useRef,
    Dispatch,
    SetStateAction,
    useEffect,
    useMemo,
    useCallback,
    memo,
    useState,
} from "react";
import { usePostHog } from "@posthog/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/HybridTooltip";
import {
    Facility,
    FacilityStatus,
    FacilityType,
} from "@/types";
import {
    Github,
    Map as MapIcon,
    BadgeHelp,
    Search,
    X,
    LoaderPinwheel,
    MoreHorizontal,
    Star,
    CalendarClock,
    RotateCcw,
} from "lucide-react";
import DateTimeButton from "@/components/DateTimeButton";
import { FavoritesSection } from "@/components/FavoritesSection";
import { AddFavoritesDialog } from "@/components/AddFavoritesDialog";
import RoomFilter from "@/components/RoomFilter";
import { SearchResults } from "@/components/SearchResults";
import { FacilityListView } from "@/components/facilities/FacilityListView";
import { useFavorites } from "@/hooks/useFavorites";
import { isRoomAvailable, FilterCriteria } from "@/utils/filterUtils";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
    parseTimeToMinutes,
    formatDateForDisplay,
    formatTimeForDisplay,
    getCampusDateTimeParts,
} from "@/utils/time";
import type {
    NaturalLanguageSearchResult,
    parseNaturalLanguageSearch,
} from "@/utils/naturalLanguageSearch";

type NaturalLanguageParser = typeof parseNaturalLanguageSearch;
interface LeftSidebarProps {
    facilityData: FacilityStatus | null;
    showMap: boolean;
    setShowMap: Dispatch<SetStateAction<boolean>>;
    expandedFacilityIds: string[];
    onExpandedFacilityIdsChange: (facilityIds: string[]) => void;
    onExternalSelectFacility: (facilityId: string) => void;
    scrollTargetId?: string | null;
    scrollTargetTimestamp?: number;
    isFetching: boolean;
    isLibraryFetching: boolean;
    isAcademicLoading?: boolean;
    error?: string | null;
    onRetry?: () => void;
}

interface ActiveTimeBannerProps {
    selectedDate: string;
    selectedTime: string;
    onReset: () => void;
}

const ActiveTimeBanner: React.FC<ActiveTimeBannerProps> = ({
    selectedDate,
    selectedTime,
    onReset,
}) => {
    const campusToday = useMemo(() => getCampusDateTimeParts().date, []);
    const dateLabel = selectedDate === campusToday ? "Today" : formatDateForDisplay(selectedDate);

    return (
        <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 flex items-center justify-between text-xs text-foreground shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 font-medium text-primary">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                    Viewing {dateLabel} at {formatTimeForDisplay(selectedTime)}
                </span>
            </div>
            <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/15 shrink-0 font-normal underline"
            >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to now
            </Button>
        </div>
    );
};

interface NaturalSearchPromptProps {
    interpretation: NaturalLanguageSearchResult;
    onApply: () => void;
}

const NaturalSearchPrompt: React.FC<NaturalSearchPromptProps> = ({
    interpretation,
    onApply,
}) => {
    const errorMessage =
        interpretation.error === "ambiguous-time"
            ? "Add AM or PM so we know which time you mean."
            : interpretation.error === "multiple-date-times"
                ? "Use one date and time in each search."
                : null;
    const target = interpretation.dateTime;

    return (
        <div className="px-4 py-8 flex justify-center">
            <div className="w-full max-w-sm rounded-lg border bg-card p-4 space-y-3 text-center">
                <CalendarClock className="h-6 w-6 mx-auto text-primary" />
                {errorMessage ? (
                    <>
                        <p className="text-sm font-medium">Clarify your search</p>
                        <p className="text-xs text-muted-foreground">{errorMessage}</p>
                    </>
                ) : target ? (
                    <>
                        <div className="space-y-1">
                            <p className="text-sm font-medium">
                                {interpretation.locationQuery
                                    ? `Search ${interpretation.locationQuery}`
                                    : "View all spots"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {formatDateForDisplay(target.date)} at{" "}
                                {formatTimeForDisplay(target.time)}
                            </p>
                        </div>
                        <Button size="sm" onClick={onApply} className="h-8 text-xs">
                            Search this time
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                            Press Enter to apply
                        </p>
                    </>
                ) : null}
            </div>
        </div>
    );
};

const LeftSidebar: React.FC<LeftSidebarProps> = ({
    facilityData,
    showMap,
    setShowMap,
    expandedFacilityIds,
    onExpandedFacilityIdsChange,
    onExternalSelectFacility,
    scrollTargetId,
    scrollTargetTimestamp,
    isFetching,
    isLibraryFetching,
    isAcademicLoading = false,
    error = null,
    onRetry,
}) => {
    const posthog = usePostHog();
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [naturalLanguageParser, setNaturalLanguageParser] =
        useState<NaturalLanguageParser | null>(null);
    const { favorites, toggleFavorite } = useFavorites();
    const {
        selectedDateTime,
        setSelectedDateTime,
        isCurrentDateTime,
        resetToCurrentDateTime,
    } = useDateTimeContext();
    const [minDuration, setMinDuration] = useState<number | undefined>(undefined);
    const [freeUntil, setFreeUntil] = useState<string>("");

    const filterCriteria: FilterCriteria = useMemo(
        () => ({
            minDuration,
            freeUntil: freeUntil || undefined,
            nowMinutes: parseTimeToMinutes(selectedDateTime.time) ?? undefined,
        }),
        [minDuration, freeUntil, selectedDateTime],
    );

    const hasActiveFilters = !!minDuration || !!freeUntil;
    const isSearching = searchTerm.trim().length > 0;
    const naturalSearch = useMemo<NaturalLanguageSearchResult>(() => {
        if (naturalLanguageParser) {
            return naturalLanguageParser(searchTerm);
        }

        return {
            locationQuery: searchTerm.trim(),
            temporalText: null,
            dateTime: null,
            error: null,
        };
    }, [naturalLanguageParser, searchTerm]);
    const hasTemporalSearch = naturalSearch.temporalText !== null;

    const loadNaturalLanguageParser = useCallback(() => {
        void import("@/utils/naturalLanguageSearch").then(
            ({ parseNaturalLanguageSearch }) => {
                setNaturalLanguageParser(() => parseNaturalLanguageSearch);
            },
        );
    }, []);

    const applyNaturalSearch = useCallback(() => {
        if (naturalSearch.error || !naturalSearch.dateTime) return;

        posthog.capture("availability_search_applied", {
            has_location_query: Boolean(naturalSearch.locationQuery),
            selected_date: naturalSearch.dateTime.date,
            selected_time: naturalSearch.dateTime.time,
        });
        setSelectedDateTime(naturalSearch.dateTime);
        setSearchTerm(naturalSearch.locationQuery);
    }, [naturalSearch, posthog, setSelectedDateTime]);

    const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        applyNaturalSearch();
    };

    const facilityDataMatchesSelection = useMemo(() => {
        if (!facilityData || isCurrentDateTime) return true;

        const responseInstant = new Date(facilityData.timestamp);
        if (Number.isNaN(responseInstant.getTime())) return false;
        const responseDateTime = getCampusDateTimeParts(responseInstant);

        return (
            responseDateTime.date === selectedDateTime.date &&
            responseDateTime.time.slice(0, 5) === selectedDateTime.time.slice(0, 5)
        );
    }, [facilityData, isCurrentDateTime, selectedDateTime]);

    const searchFacilityData = facilityDataMatchesSelection ? facilityData : null;

    const filterFacilitiesByAvailability = useCallback(
        (facilities: Facility[]) => {
            if (!hasActiveFilters) {
                return facilities;
            }
            return facilities.filter((facility) => {
                return Object.values(facility.rooms).some((room) =>
                    isRoomAvailable(room, filterCriteria),
                );
            });
        },
        [hasActiveFilters, filterCriteria],
    );

    const libraryFacilities = useMemo(() => {
        const allLibraries = facilityData
            ? Object.values(facilityData.facilities)
                .filter((facility) => facility.type === FacilityType.LIBRARY)
                .sort((a, b) => a.name.localeCompare(b.name))
            : [];
        return filterFacilitiesByAvailability(allLibraries);
    }, [facilityData, filterFacilitiesByAvailability]);

    const academicFacilities = useMemo(() => {
        const allAcademic = facilityData
            ? Object.values(facilityData.facilities)
                .filter((facility) => facility.type === FacilityType.ACADEMIC)
                .sort((a, b) => a.name.localeCompare(b.name))
            : [];
        return filterFacilitiesByAvailability(allAcademic);
    }, [facilityData, filterFacilitiesByAvailability]);

    const handleFavoriteClick = useCallback(
        (
            facilityId: string,
            type: "library" | "academic",
            facilityName: string,
        ) => {
            posthog.capture("facility_selected", {
                facility_id: facilityId,
                facility_name: facilityName,
                facility_type: type,
                selection_source: "favorites",
            });

            onExternalSelectFacility(facilityId);
        },
        [onExternalSelectFacility, posthog],
    );

    // Auto-scroll ONLY when triggered by an external source (map or favorites)
    useEffect(() => {
        if (!scrollTargetId) return;
        const element = document.getElementById(`facility-${scrollTargetId}`);
        if (element) {
            element.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    }, [scrollTargetId, scrollTargetTimestamp]);
    const matchingRoomsCount = useMemo(() => {
        const allFacilities = facilityData
            ? Object.values(facilityData.facilities)
            : [];
        let count = 0;
        allFacilities.forEach((facility) => {
            Object.values(facility.rooms).forEach((room) => {
                if (isRoomAvailable(room, filterCriteria)) {
                    count++;
                }
            });
        });
        return count;
    }, [facilityData, filterCriteria]);

    const clearFilters = () => {
        setMinDuration(undefined);
        setFreeUntil("");
    };

    const resetSelectedDateTime = useCallback(() => {
        posthog.capture("date_time_changed", {
            selection: "now",
            selection_source: "active_time_banner",
        });
        resetToCurrentDateTime();
    }, [posthog, resetToCurrentDateTime]);

    const [isFavoritesDialogOpen, setIsFavoritesDialogOpen] = useState(false);

    return (
        <div
            className={`h-full bg-background flex flex-col relative ${
                showMap ? "border-t md:border-t-0 md:border-r" : ""
            }`}
        >
            <div className="sidebar-header py-2 px-3 md:py-3 md:px-4 border-b flex select-none items-center gap-2">
                <h1 className="text-base md:text-lg font-bold shrink-0 leading-none">
                    <span style={{ color: "#FF5F05" }}>illini</span>
                    <span className="text-[#13294B] dark:text-foreground">Spots</span>
                </h1>
                <TooltipProvider delayDuration={50}>
                    <div className="flex-1 min-w-0 flex gap-2 items-center">
                        <form
                            className="relative flex-1 min-w-[70px]"
                            onSubmit={handleSearchSubmit}
                        >
                            <Search
                                className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                type="text"
                                value={searchTerm}
                                onFocus={loadNaturalLanguageParser}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Try CIF tmrw 2pm"
                                className={`pl-8 ${searchTerm ? "pr-8" : ""} h-9 md:h-9 rounded-full text-sm`}
                                aria-label="Search buildings, rooms, dates, and times"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Clear search"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </form>
                        <RoomFilter
                            minDuration={minDuration}
                            setMinDuration={setMinDuration}
                            freeUntil={freeUntil}
                            setFreeUntil={setFreeUntil}
                            hasActiveFilters={hasActiveFilters}
                            onClearAll={clearFilters}
                            matchingRoomsCount={matchingRoomsCount}
                        />
                        <DateTimeButton isFetching={isFetching} />
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9 rounded-full border border-input shrink-0"
                                    aria-label="Menu"
                                    title="Menu"
                                >
                                    <MoreHorizontal size={18} />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 md:w-64" align="end">
                                <div className="space-y-1">
                                    {/* Favorites Option */}
                                    <button
                                        onClick={() => setIsFavoritesDialogOpen(true)}
                                        className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors text-foreground text-left"
                                    >
                                        <Star size={16} />
                                        Manage Favorites
                                    </button>

                                    {/* Divider */}
                                    <div className="h-px bg-border"></div>

                                    {/* Map Toggle */}
                                    <div className="flex items-center justify-between px-3 py-2">
                                        <label
                                            htmlFor="show-map-switch"
                                            className="text-sm font-medium text-foreground flex items-center gap-2"
                                        >
                                            <MapIcon size={16} />
                                            Show Map
                                        </label>
                                        <Switch
                                            id="show-map-switch"
                                            checked={showMap}
                                            onCheckedChange={setShowMap}
                                            aria-label="Toggle map display"
                                        />
                                    </div>

                                    {/* Divider */}
                                    <div className="h-px bg-border"></div>

                                    {/* Appearance / Theme Switcher */}
                                    <ThemeToggle />
                                    {/* Divider */}
                                    <div className="h-px bg-border"></div>

                                    {/* Help Section */}
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start gap-2 px-3"
                                            >
                                                <BadgeHelp size={16} />
                                                Important Notes
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 md:w-80">
                                            <div className="text-sm space-y-2">
                                                <p className="font-medium">Important Notes:</p>
                                                <ul className="list-disc pl-4 space-y-1">
                                                    <li>
                                                        Building/room access may be restricted to specific
                                                        colleges or departments
                                                    </li>
                                                    <li>
                                                        Displayed availability only reflects official class
                                                        schedules and events
                                                    </li>
                                                    <li>
                                                        Rooms may be occupied by unofficial meetings or study
                                                        groups
                                                    </li>
                                                    <li>Different schedules may apply during exam periods</li>
                                                </ul>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    {/* GitHub Link */}
                                    <a
                                        href="https://github.com/plon/illinispots"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-start gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors text-foreground"
                                    >
                                        <Github size={16} />
                                        View on GitHub
                                    </a>

                                    {/* Divider */}
                                    <div className="h-px bg-border"></div>

                                    {/* Data Updates Section */}
                                    <div className="px-3 py-2 text-xs text-muted-foreground space-y-1">
                                        <p>
                                            <span className="font-medium text-foreground">Data Updates:</span>
                                        </p>
                                        <p>• General campus events: Daily</p>
                                        <p>• Class schedules: Weekly</p>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </TooltipProvider>
            </div>

            {!isCurrentDateTime && (
                <ActiveTimeBanner
                    selectedDate={selectedDateTime.date}
                    selectedTime={selectedDateTime.time}
                    onReset={resetSelectedDateTime}
                />
            )}

            <ScrollArea
                className="flex-1 relative"
                viewportClassName="[&>div]:block! [&>div]:min-w-0!"
                ref={scrollAreaRef}
            >
                {isSearching && hasTemporalSearch ? (
                    <NaturalSearchPrompt
                        interpretation={naturalSearch}
                        onApply={applyNaturalSearch}
                    />
                ) : isSearching ? (
                    <SearchResults
                        facilityData={searchFacilityData}
                        searchTerm={searchTerm}
                        filterCriteria={filterCriteria}
                        hasActiveFilters={hasActiveFilters}
                        onClearFilters={clearFilters}
                        onClearSearch={() => setSearchTerm("")}
                        isLoading={
                            isAcademicLoading || isFetching || !facilityDataMatchesSelection
                        }
                        isLibraryLoading={isLibraryFetching}
                    />
                ) : (
                    <>
                        <FavoritesSection
                            favorites={favorites}
                            facilityData={facilityData}
                            onFavoriteClick={handleFavoriteClick}
                            onToggleFavorite={toggleFavorite}
                        />
                        <FacilityListView
                            libraryFacilities={libraryFacilities}
                            academicFacilities={academicFacilities}
                            expandedFacilityIds={expandedFacilityIds}
                            onExpandedFacilityIdsChange={onExpandedFacilityIdsChange}
                            filterCriteria={filterCriteria}
                            isLibraryFetching={isLibraryFetching}
                            isAcademicLoading={isAcademicLoading}
                            error={error}
                            onRetry={onRetry}
                            hasActiveFilters={hasActiveFilters}
                        />
                    </>
                )}
            </ScrollArea>

            {/* Dimming Overlay*/}
            {isFetching && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10 pointer-events-none">
                    <LoaderPinwheel className="h-6 w-6 animate-spin text-primary" />
                </div>
            )}

            <AddFavoritesDialog
                isOpen={isFavoritesDialogOpen}
                onOpenChange={setIsFavoritesDialogOpen}
                facilityData={facilityData}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
            />
        </div>
    );
};

LeftSidebar.displayName = "LeftSidebar";

export default memo(LeftSidebar);
