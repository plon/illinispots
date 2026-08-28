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
import { getUpdatedAccordionItems } from "@/utils/accordion";
import { Accordion } from "@/components/ui/accordion";
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
import { Facility, FacilityStatus, FacilityType, AccordionRefs } from "@/types";
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
import FacilityAccordion from "@/components/FacilityAccordion";
import DateTimeButton from "@/components/DateTimeButton";
import { FavoritesSection } from "@/components/FavoritesSection";
import { AddFavoritesDialog } from "@/components/AddFavoritesDialog";
import RoomFilter from "@/components/RoomFilter";
import { SearchResults } from "@/components/SearchResults";
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
import {
    parseNaturalLanguageSearch,
    type NaturalLanguageSearchResult,
} from "@/utils/naturalLanguageSearch";

interface LeftSidebarProps {
    facilityData: FacilityStatus | null;
    showMap: boolean;
    setShowMap: Dispatch<SetStateAction<boolean>>;
    expandedItems: string[];
    setExpandedItems: Dispatch<SetStateAction<string[]>>;
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
    expandedItems,
    setExpandedItems,
    isFetching,
    isLibraryFetching,
    isAcademicLoading = false,
    error = null,
    onRetry,
}) => {
    const posthog = usePostHog();
    const accordionRefs = useRef<AccordionRefs>({});
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
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
    const naturalSearch = useMemo(
        () => parseNaturalLanguageSearch(searchTerm),
        [searchTerm],
    );
    const hasTemporalSearch = naturalSearch.temporalText !== null;

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

    const scrollToAccordion = useCallback((accordionId: string) => {
        const element = accordionRefs.current[accordionId];
        if (element) {
            setTimeout(() => {
                element.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                });
            }, 100);
        }
    }, []);

    const toggleItem = useCallback(
        (value: string) => {
            setExpandedItems((prevItems) => getUpdatedAccordionItems(value, prevItems));
        },
        [setExpandedItems],
    );

    const prevExpandedItemsRef = useRef<string[]>([]);

    useEffect(() => {
        const newItems = expandedItems.filter(
            (item) => !prevExpandedItemsRef.current.includes(item),
        );
        if (newItems.length === 1) {
            scrollToAccordion(newItems[0]);
        }
        prevExpandedItemsRef.current = expandedItems;
    }, [expandedItems, scrollToAccordion]);

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
        (facilityId: string, type: "library" | "academic") => {
            const facilityName = facilityData?.facilities[facilityId]?.name;
            posthog.capture("facility_selected", {
                facility_id: facilityId,
                facility_name: facilityName,
                facility_type: type,
                selection_source: "favorites",
            });

            // Find the facility and expand its accordion
            const prefix = type === "library" ? "library" : "building";
            const accordionId = `${prefix}-${facilityId}`;

            // Add to expanded items if not already expanded
            if (!expandedItems.includes(accordionId)) {
                setExpandedItems((prev) => [...prev, accordionId]);
            }

            scrollToAccordion(accordionId);
        },
        [expandedItems, facilityData, posthog, setExpandedItems, scrollToAccordion],
    );

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
        <div className="h-full bg-background border-t md:border-t-0 md:border-l flex flex-col relative">
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
                                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                            <MapIcon size={16} />
                                            Show Map
                                        </label>
                                        <Switch
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
                viewportClassName="[&>div]:!block [&>div]:!min-w-0"
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
                        {libraryFacilities.length > 0 ? (
                            <div className="mt-2">
                                <h2 className="text-sm font-normal text-muted-foreground pl-6">
                                    Library
                                </h2>
                                <Accordion type="multiple" value={expandedItems} className="w-full">
                                    {libraryFacilities.map((facility) => (
                                        <FacilityAccordion
                                            key={`library-${facility.id}`}
                                            facility={facility}
                                            facilityType={FacilityType.LIBRARY}
                                            expandedItems={expandedItems}
                                            toggleItem={toggleItem}
                                            accordionRefs={accordionRefs}
                                            idPrefix="library"
                                            filterCriteria={filterCriteria}
                                        />
                                    ))}
                                </Accordion>
                            </div>
                        ) : isLibraryFetching ? (
                            <div
                                className="mt-2"
                                role="status"
                                aria-busy="true"
                                aria-label="Loading library availability"
                            >
                                <h2 className="text-sm font-normal text-muted-foreground pl-6">
                                    Library
                                </h2>
                                <span className="sr-only">Loading library availability…</span>
                                <div aria-hidden="true">
                                    {[0, 1, 2].map((index) => (
                                        <div key={index} className="border-b">
                                            <div className="h-[38px] px-4 flex items-center justify-between">
                                                <div
                                                    className={`h-4 rounded bg-muted animate-pulse ${
                                                        index === 0
                                                            ? "w-36"
                                                            : index === 1
                                                              ? "w-52"
                                                              : "w-24"
                                                    }`}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <div className="h-[22px] w-12 rounded-full bg-muted animate-pulse" />
                                                    <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Academic Buildings Section */}
                        {academicFacilities.length > 0 ? (
                            <div className="mt-5">
                                <h2 className="text-sm font-normal text-muted-foreground pl-6">
                                    Academic
                                </h2>
                                <Accordion type="multiple" value={expandedItems} className="w-full">
                                    {academicFacilities.map((facility) => (
                                        <FacilityAccordion
                                            key={`building-${facility.id}`}
                                            facility={facility}
                                            facilityType={FacilityType.ACADEMIC}
                                            expandedItems={expandedItems}
                                            toggleItem={toggleItem}
                                            accordionRefs={accordionRefs}
                                            idPrefix="building"
                                            filterCriteria={filterCriteria}
                                        />
                                    ))}
                                </Accordion>
                            </div>
                        ) : isAcademicLoading ? (
                            <div
                                className="mt-5"
                                role="status"
                                aria-busy="true"
                                aria-label="Loading academic availability"
                            >
                                <h2 className="text-sm font-normal text-muted-foreground pl-6">
                                    Academic
                                </h2>
                                <span className="sr-only">Loading academic availability…</span>
                                <div aria-hidden="true">
                                    {Array.from({ length: 20 }, (_, index) => (
                                        <div key={index} className="border-b">
                                            <div className="h-[38px] px-4 flex items-center justify-between">
                                                <div
                                                    className={`h-4 rounded bg-muted animate-pulse ${
                                                        index % 4 === 0
                                                            ? "w-44"
                                                            : index % 4 === 1
                                                              ? "w-36"
                                                              : index % 4 === 2
                                                                ? "w-52"
                                                                : "w-28"
                                                    }`}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <div className="h-[22px] w-12 rounded-full bg-muted animate-pulse" />
                                                    <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : error ? (
                            <div
                                className="p-4 mx-4 my-6 rounded-lg border border-destructive/30 bg-destructive/5 text-center space-y-2"
                                role="alert"
                            >
                                <p className="text-sm font-medium text-destructive">
                                    Failed to load spots
                                </p>
                                <p className="text-xs text-muted-foreground">{error}</p>
                                {onRetry && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onRetry}
                                        className="mt-2 text-xs"
                                    >
                                        Retry
                                    </Button>
                                )}
                            </div>
                        ) : null}

                        {/* No Results Message for active filters */}
                        {hasActiveFilters &&
                            !isAcademicLoading &&
                            !isLibraryFetching &&
                            libraryFacilities.length === 0 &&
                            academicFacilities.length === 0 && (
                                <p className="text-center text-muted-foreground text-sm mt-6 px-4">
                                    No results found matching your criteria
                                </p>
                            )}
                        <div className="h-4"></div>
                    </>
                )}
            </ScrollArea>

            {/* Dimming Overlay*/}
            {isFetching && (
                // Covers the entire parent div (which is the whole sidebar)
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
