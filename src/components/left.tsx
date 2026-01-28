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
    LoaderPinwheel,
    Building2,
    DoorOpen,
    MoreHorizontal,
} from "lucide-react";
import Fuse from "fuse.js";
import FacilityAccordion from "@/components/FacilityAccordion";
import DateTimeButton from "@/components/DateTimeButton";
import { FavoritesSection } from "@/components/FavoritesSection";
import { AddFavoritesDialog } from "@/components/AddFavoritesDialog";
import { Star } from "lucide-react";
import RoomFilter from "@/components/RoomFilter";
import { useFavorites } from "@/hooks/useFavorites";
import { isRoomAvailable, FilterCriteria } from "@/utils/filterUtils";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import moment from "moment-timezone";

interface LeftSidebarProps {
    facilityData: FacilityStatus | null;
    showMap: boolean;
    setShowMap: Dispatch<SetStateAction<boolean>>;
    expandedItems: string[];
    setExpandedItems: Dispatch<SetStateAction<string[]>>;
    isFetching: boolean;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
    facilityData,
    showMap,
    setShowMap,
    expandedItems,
    setExpandedItems,
    isFetching,
}) => {
    const accordionRefs = useRef<AccordionRefs>({});
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchMode, setSearchMode] = useState<"facilities" | "rooms">("facilities");
    const { favorites, toggleFavorite } = useFavorites();
    const { selectedDateTime } = useDateTimeContext();

    // Filter states
    const [minDuration, setMinDuration] = useState<number | undefined>(undefined);
    const [freeUntil, setFreeUntil] = useState<string>("");
    const [startTime, setStartTime] = useState<string>("");

    // Calculate active filter count
    const activeFilterCount =
        (!!minDuration ? 1 : 0) + (!!freeUntil ? 1 : 0) + (!!startTime ? 1 : 0);

    const filterCriteria: FilterCriteria = useMemo(
        () => ({
            minDuration,
            freeUntil: freeUntil || undefined,
            startTime: startTime || undefined,
            now: moment(selectedDateTime),
        }),
        [minDuration, freeUntil, startTime, selectedDateTime],
    );

    const hasActiveFilters = !!minDuration || !!freeUntil || !!startTime;

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

    const filterFacilities = useCallback(
        (facilities: Facility[]) => {
            let filtered = facilities;

            // 1. Filter by availability criteria first (if any)
            if (hasActiveFilters) {
                filtered = filtered.filter((facility) => {
                    // Check if facility has ANY room that matches the criteria
                    return Object.values(facility.rooms).some((room) =>
                        isRoomAvailable(room, filterCriteria),
                    );
                });
            }

            // 2. Filter by search term
            if (!searchTerm) {
                return filtered;
            }

            if (searchMode === "facilities") {
                const fuse = new Fuse(filtered, {
                    keys: ["name"],
                    threshold: 0.3,
                    ignoreLocation: true,
                });
                return fuse.search(searchTerm).map((result) => result.item);
            } else {
                // Search by room names - return facilities that have matching rooms
                return filtered.filter((facility) =>
                    Object.keys(facility.rooms).some((roomId) =>
                        roomId.toLowerCase().includes(searchTerm.toLowerCase()),
                    ),
                );
            }
        },
        [searchTerm, searchMode, hasActiveFilters, filterCriteria],
    );

    const libraryFacilities = useMemo(() => {
        const allLibraries = facilityData
            ? Object.values(facilityData.facilities)
                .filter((facility) => facility.type === FacilityType.LIBRARY)
                .sort((a, b) => a.name.localeCompare(b.name))
            : [];
        return filterFacilities(allLibraries);
    }, [facilityData, filterFacilities]);

    const academicFacilities = useMemo(() => {
        const allAcademic = facilityData
            ? Object.values(facilityData.facilities)
                .filter((facility) => facility.type === FacilityType.ACADEMIC)
                .sort((a, b) => a.name.localeCompare(b.name))
            : [];
        return filterFacilities(allAcademic);
    }, [facilityData, filterFacilities]);

    const handleFavoriteClick = useCallback(
        (facilityId: string, type: "library" | "academic") => {
            // Find the facility and expand its accordion
            const prefix = type === "library" ? "library" : "building";
            const accordionId = `${prefix}-${facilityId}`;

            // Add to expanded items if not already expanded
            if (!expandedItems.includes(accordionId)) {
                setExpandedItems((prev) => [...prev, accordionId]);
            }

            scrollToAccordion(accordionId);
        },
        [expandedItems, setExpandedItems, scrollToAccordion],
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
        setStartTime("");
    };

    const [isFavoritesDialogOpen, setIsFavoritesDialogOpen] = useState(false);

    return (
        <div className="h-full bg-background border-t md:border-t-0 md:border-l flex flex-col relative">
            <div className="sidebar-header pt-1 pb-3 pl-3 pr-3 md:pt-4 md:pb-5 md:pl-4 md:pr-4 border-b flex flex-col">
                <div className="flex justify-between items-center w-full">
                    <h1 className="text-xl md:text-2xl font-bold">
                        <span style={{ color: "#FF5F05" }}>illini</span>
                        <span style={{ color: "#13294B" }}>Spots</span>
                    </h1>
                    <div className="flex gap-2 items-center pt-1">
                        <TooltipProvider delayDuration={50}>
                            <DateTimeButton isFetching={isFetching} />
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 md:h-9 md:w-9 rounded-full border-2 border-foreground/20"
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
                                            <p>• Class schedules: Spring 2026</p>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </TooltipProvider>
                    </div>
                </div>
                <div className="mt-2 md:mt-3 w-full relative flex gap-2">
                    <div className="relative flex-1">
                        <Search
                            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={searchMode === "facilities" ? "Search buildings..." : "Search rooms..."}
                            className="pl-10 pr-24 h-9 md:h-9 rounded-full text-sm"
                            aria-label={searchMode === "facilities" ? "Search buildings" : "Search rooms"}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <div className="w-px h-5 bg-border"></div>
                            <button
                                onClick={() => setSearchMode("facilities")}
                                className={`p-1 transition-colors ${searchMode === "facilities"
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                                aria-label="Search buildings"
                                aria-pressed={searchMode === "facilities"}
                                title="Search buildings"
                            >
                                <Building2 size={16} />
                            </button>
                            <button
                                onClick={() => setSearchMode("rooms")}
                                className={`p-1 transition-colors ${searchMode === "rooms"
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                                aria-label="Search rooms"
                                aria-pressed={searchMode === "rooms"}
                                title="Search rooms"
                            >
                                <DoorOpen size={16} />
                            </button>
                        </div>
                    </div>
                    <RoomFilter
                        minDuration={minDuration}
                        setMinDuration={setMinDuration}
                        freeUntil={freeUntil}
                        setFreeUntil={setFreeUntil}
                        startTime={startTime}
                        setStartTime={setStartTime}
                        activeFilterCount={activeFilterCount}
                        hasActiveFilters={hasActiveFilters}
                        onClearAll={clearFilters}
                        matchingRoomsCount={matchingRoomsCount}
                    />
                </div>
            </div>

            <ScrollArea
                className="flex-1 relative"
                ref={scrollAreaRef}
                style={{
                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)',
                }}
            >
                {" "}
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
                                    // onToggleFavorite removed
                                    filterCriteria={filterCriteria}
                                />
                            ))}
                        </Accordion>
                    </div>
                ) : searchTerm && academicFacilities.length === 0 ? null : null}
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
                ) : searchTerm && libraryFacilities.length === 0 ? null : null}
                {/* No Results Message */}
                {(searchTerm || hasActiveFilters) &&
                    libraryFacilities.length === 0 &&
                    academicFacilities.length === 0 && (
                        <p className="text-center text-muted-foreground text-sm mt-6 px-4">
                            No results found matching your criteria
                        </p>
                    )}
                <div className="h-4"></div>
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
