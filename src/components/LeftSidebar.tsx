import React, {
    type Dispatch,
    type SetStateAction,
    useRef,
    useEffect,
    useLayoutEffect,
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
import { type Facility, type FacilityStatus, FacilityType } from "@/types";
import {
    Map as MapIcon,
    BadgeHelp,
    Search,
    X,
    LoaderPinwheel,
    MoreHorizontal,
    Star,
    CalendarClock,
    RotateCcw,
    ArrowLeft,
} from "lucide-react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import DateTimeButton from "@/components/DateTimeButton";
import { FavoritesSection } from "@/components/FavoritesSection";
import { AddFavoritesDialog } from "@/components/AddFavoritesDialog";
import RoomFilter from "@/components/RoomFilter";
import { lookupFacility } from "@/utils/searchUtils";
import { resolveSidebarScrollTarget } from "@/components/sidebarScroll";
import { SearchResults } from "@/components/SearchResults";
import { FacilityListView } from "@/components/facilities/FacilityListView";
import {
    FacilityDetailPage,
    FacilityDetailSkeleton,
} from "@/components/facilities/FacilityDetailPage";
import { useFavorites } from "@/hooks/useFavorites";
import { type FilterCriteria, isRoomAvailable } from "@/utils/filterUtils";
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
    selectedFacilityId: string | null;
    onSelectFacility: (facilityId: string | null) => void;
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
    selectedFacilityId,
    onSelectFacility,
    isFetching,
    isLibraryFetching,
    isAcademicLoading = false,
    error = null,
    onRetry,
}) => {
    const posthog = usePostHog();
    const scrollViewportRef = useRef<HTMLDivElement | null>(null);
    const listScrollTopRef = useRef(0);
    const selectedFacilityIdRef = useRef(selectedFacilityId);
    const prevFacilityIdRef = useRef(selectedFacilityId);
    const isSearchingRef = useRef(false);
    const prevIsSearchingRef = useRef(false);
    const pendingRestoreRef = useRef<number | null>(null);
    const lastAppliedScrollRef = useRef(0);
    const [searchTerm, setSearchTerm] = useState("");
    const [facilityRoomSearch, setFacilityRoomSearch] = useState("");
    const [prevSelectedFacilityId, setPrevSelectedFacilityId] =
        useState(selectedFacilityId);
    const [naturalLanguageParser, setNaturalLanguageParser] =
        useState<NaturalLanguageParser | null>(null);

    // Reset room filter when selected facility changes
    if (selectedFacilityId !== prevSelectedFacilityId) {
        setPrevSelectedFacilityId(selectedFacilityId);
        setFacilityRoomSearch("");
    }

    const selectedFacility = useMemo(
        () => lookupFacility(facilityData?.facilities, selectedFacilityId),
        [selectedFacilityId, facilityData],
    );

    // Track the building list scroll position while browsing the list. The
    // mirrors are updated synchronously in the layout effects below, and
    // restores set pendingRestoreRef, so this handler never records a
    // programmatic write (possibly clamped while content is still growing)
    // over the true saved offset.
    useEffect(() => {
        const viewport = scrollViewportRef.current;
        if (!viewport) {return;}

        const handleScroll = () => {
            if (selectedFacilityIdRef.current !== null) {return;}
            if (isSearchingRef.current) {return;}
            if (pendingRestoreRef.current !== null) {return;}
            listScrollTopRef.current = viewport.scrollTop;
        };

        viewport.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            viewport.removeEventListener("scroll", handleScroll);
        };
    }, []);

    // Opening a facility always starts at the top. Returning to the list
    // restores the saved list position. List-to-list renders (search input,
    // filters) leave the scroll position alone.
    useLayoutEffect(() => {
        const action = resolveSidebarScrollTarget(
            prevFacilityIdRef.current,
            selectedFacilityId,
            listScrollTopRef.current,
        );
        prevFacilityIdRef.current = selectedFacilityId;
        selectedFacilityIdRef.current = selectedFacilityId;

        const viewport = scrollViewportRef.current;
        if (!viewport) {return;}
        if (action.type === "restore") {
            // The write can clamp short while list content is still growing;
            // pendingRestoreRef keeps the listener from storing that echo and
            // lets the settle effect below re-apply the true offset.
            pendingRestoreRef.current = action.offset;
            viewport.scrollTop = action.offset;
            lastAppliedScrollRef.current = viewport.scrollTop;
        } else if (action.type === "reset") {
            pendingRestoreRef.current = null;
            lastAppliedScrollRef.current = 0;
            viewport.scrollTop = 0;
        }
    }, [selectedFacilityId]);

    // Finish a clamped restore once list content lands. Runs again as facility
    // data arrives; re-applies only while the viewport sits where the restore
    // left it, so a user scroll in between takes over instead of being yanked.
    useEffect(() => {
        if (selectedFacilityId !== null) {
            pendingRestoreRef.current = null;
            return;
        }
        const pending = pendingRestoreRef.current;
        if (pending === null) {return;}
        const viewport = scrollViewportRef.current;
        if (!viewport) {return;}
        if (viewport.scrollTop !== lastAppliedScrollRef.current) {
            listScrollTopRef.current = viewport.scrollTop;
            pendingRestoreRef.current = null;
            return;
        }
        if (viewport.scrollTop < pending) {
            viewport.scrollTop = pending;
            lastAppliedScrollRef.current = viewport.scrollTop;
            if (viewport.scrollTop >= pending) {
                pendingRestoreRef.current = null;
            }
        } else {
            pendingRestoreRef.current = null;
        }
    }, [selectedFacilityId, facilityData, isLibraryFetching, isAcademicLoading]);

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

    const hasActiveFilters = Boolean(minDuration) || Boolean(freeUntil);
    const isSearching = searchTerm.trim().length > 0;

    // Starting a search parks the viewport at the top and clears the saved
    // list position. The scroll listener stays muted while searching, so
    // scrolling through results never leaks into the restored list offset.
    useLayoutEffect(() => {
        const wasSearching = prevIsSearchingRef.current;
        prevIsSearchingRef.current = isSearching;
        isSearchingRef.current = isSearching;
        if (wasSearching || !isSearching) {return;}
        listScrollTopRef.current = 0;
        pendingRestoreRef.current = null;
        lastAppliedScrollRef.current = 0;
        const viewport = scrollViewportRef.current;
        if (viewport) {viewport.scrollTop = 0;}
    }, [isSearching]);
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
        if (naturalSearch.error || !naturalSearch.dateTime) {return;}

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
        if (!facilityData || isCurrentDateTime) {return true;}

        const responseInstant = new Date(facilityData.timestamp);
        if (Number.isNaN(responseInstant.getTime())) {return false;}
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
            return facilities.filter((facility) => 
                Object.values(facility.rooms).some((room) =>
                    isRoomAvailable(room, filterCriteria),
                )
            );
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

    const isFacilityFavorite = useMemo(() => {
        if (!selectedFacility) {return false;}
        return favorites.some((f) => f.id === selectedFacility.id);
    }, [favorites, selectedFacility]);

    const handleToggleFacilityFavorite = useCallback(() => {
        if (!selectedFacility) {return;}
        toggleFavorite({
            id: selectedFacility.id,
            name: selectedFacility.name,
            type: selectedFacility.type === FacilityType.LIBRARY ? "library" : "academic",
        });
    }, [selectedFacility, toggleFavorite]);

    const handleSelectFacilityFromList = useCallback(
        (facilityId: string) => {
            const fac = lookupFacility(facilityData?.facilities, facilityId);
            posthog.capture("facility_selected", {
                facility_id: facilityId,
                facility_name: fac?.name,
                facility_type: fac?.type,
                selection_source: "list",
            });
            onSelectFacility(facilityId);
        },
        [facilityData, onSelectFacility, posthog],
    );

    const handleSelectFacilityFromSearch = useCallback(
        (facilityId: string) => {
            const fac = lookupFacility(facilityData?.facilities, facilityId);
            posthog.capture("facility_selected", {
                facility_id: facilityId,
                facility_name: fac?.name,
                facility_type: fac?.type,
                selection_source: "search",
            });
            setSearchTerm("");
            onSelectFacility(facilityId);
        },
        [facilityData, onSelectFacility, posthog],
    );

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
            onSelectFacility(facilityId);
        },
        [onSelectFacility, posthog],
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

    const menuPopover = (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border border-input shrink-0 cursor-pointer"
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
                        className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors text-foreground text-left cursor-pointer"
                    >
                        <Star size={16} />
                        Manage Favorites
                    </button>

                    {/* Divider */}
                    <div className="h-px bg-border" />

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
                    <div className="h-px bg-border" />

                    {/* Appearance / Theme Switcher */}
                    <ThemeToggle />
                    {/* Divider */}
                    <div className="h-px bg-border" />

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
                        <GitHubLogoIcon width={16} height={16} />
                        View on GitHub
                    </a>

                    {/* Divider */}
                    <div className="h-px bg-border" />

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
    );

    return (
        <div
            className={`h-full bg-background flex flex-col relative ${
                showMap ? "border-t md:border-t-0" : ""
            }`}
        >
            <div className="sidebar-header py-2 px-3 md:py-3 md:px-4 border-b flex select-none items-center gap-2">
                {selectedFacilityId ? (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setFacilityRoomSearch("");
                                onSelectFacility(null);
                            }}
                            className="h-9 px-2 md:px-2.5 gap-1.5 shrink-0 text-xs md:text-sm font-medium hover:bg-muted/60 -ml-1 cursor-pointer"
                            aria-label="Back to facilities list"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Back</span>
                        </Button>

                        <div className="relative flex-1 min-w-[70px]">
                            <Search
                                className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                type="text"
                                value={facilityRoomSearch}
                                onChange={(e) => setFacilityRoomSearch(e.target.value)}
                                placeholder="Filter rooms (e.g. 1025)..."
                                className={`pl-8 ${facilityRoomSearch ? "pr-8" : ""} h-9 rounded-full text-sm`}
                                aria-label={`Filter rooms in ${selectedFacility?.name ?? "facility"}`}
                            />
                            {facilityRoomSearch && (
                                <button
                                    type="button"
                                    onClick={() => setFacilityRoomSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    aria-label="Clear room filter"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
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
                            {menuPopover}
                        </div>
                    </>
                ) : (
                    <>
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
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                                {menuPopover}
                            </div>
                        </TooltipProvider>
                    </>
                )}
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
                viewportRef={scrollViewportRef}
            >
                {selectedFacilityId ? (
                    selectedFacility ? (
                        <FacilityDetailPage
                            key={selectedFacility.id}
                            facility={selectedFacility}
                            onBack={() => {
                                setFacilityRoomSearch("");
                                onSelectFacility(null);
                            }}
                            filterCriteria={filterCriteria}
                            isFavorite={isFacilityFavorite}
                            onToggleFavorite={handleToggleFacilityFavorite}
                            roomSearchQuery={facilityRoomSearch}
                            onClearRoomSearch={() => setFacilityRoomSearch("")}
                        />
                    ) : isAcademicLoading ||
                      isFetching ||
                      isLibraryFetching ||
                      !facilityData ? (
                        <FacilityDetailSkeleton onBack={() => {
                            setFacilityRoomSearch("");
                            onSelectFacility(null);
                        }} />
                    ) : (
                        <div className="py-12 px-4 text-center space-y-3">
                            <p className="text-sm font-medium text-foreground">Facility not found</p>
                            <p className="text-xs text-muted-foreground">
                                The requested facility could not be found.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setFacilityRoomSearch("");
                                    onSelectFacility(null);
                                }}
                                className="cursor-pointer text-xs"
                            >
                                Back to all facilities
                            </Button>
                        </div>
                    )
                ) : isSearching && hasTemporalSearch ? (
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
                        onSelectFacility={handleSelectFacilityFromSearch}
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
                            onSelectFacility={handleSelectFacilityFromList}
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
