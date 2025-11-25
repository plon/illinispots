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
import {
  HybridTooltip,
  HybridTooltipContent,
  HybridTooltipTrigger,
  TooltipProvider,
} from "@/components/ui/HybridTooltip";
import { Facility, FacilityStatus, FacilityType, AccordionRefs } from "@/types";
import {
  Github,
  Map as MapIcon,
  BadgeHelp,
  Search,
  LoaderPinwheel,
  Filter,
  X,
  Clock,
  Hourglass,
} from "lucide-react";
import Fuse from "fuse.js";
import FacilityAccordion from "@/components/FacilityAccordion";
import DateTimeButton from "@/components/DateTimeButton";
import { FavoritesSection } from "@/components/FavoritesSection";
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
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { selectedDateTime } = useDateTimeContext();

  // Filter states
  const [minDuration, setMinDuration] = useState<number | undefined>(undefined);
  const [freeUntil, setFreeUntil] = useState<string>("");

  const filterCriteria: FilterCriteria = useMemo(
    () => ({
      minDuration,
      freeUntil: freeUntil || undefined,
      now: moment(selectedDateTime),
    }),
    [minDuration, freeUntil, selectedDateTime],
  );

  const hasActiveFilters = !!minDuration || !!freeUntil;

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

      const fuse = new Fuse(filtered, {
        keys: ["name"],
        threshold: 0.3,
        ignoreLocation: true,
      });

      return fuse.search(searchTerm).map((result) => result.item);
    },
    [searchTerm, hasActiveFilters, filterCriteria],
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

  const handleFavoriteClick = useCallback((facilityId: string, type: 'library' | 'academic') => {
    // Find the facility and expand its accordion
    const prefix = type === 'library' ? 'library' : 'building';
    const accordionId = `${prefix}-${facilityId}`;

    // Add to expanded items if not already expanded
    if (!expandedItems.includes(accordionId)) {
      setExpandedItems(prev => [...prev, accordionId]);
    }

    scrollToAccordion(accordionId);
  }, [expandedItems, setExpandedItems, scrollToAccordion]);

  const clearFilters = () => {
    setMinDuration(undefined);
    setFreeUntil("");
  };

  return (
    <div className="h-full bg-background border-t md:border-t-0 md:border-l flex flex-col relative">
      <div className="sidebar-header py-1 pl-3 pr-3 md:p-4 border-b flex flex-col">
        <div className="flex justify-between items-center w-full">
          <h1 className="text-xl md:text-2xl font-bold">
            <span style={{ color: "#FF5F05" }}>illini</span>
            <span style={{ color: "#13294B" }}>Spots</span>
          </h1>
          <div className="flex gap-2 items-center pt-1">
            <TooltipProvider delayDuration={50}>
              <a
                href="https://github.com/plon/illinispots"
                target="_blank"
                rel="noopener"
                className="h-6 w-6 md:h-8 md:w-8 rounded-full flex items-center justify-center border-2 border-foreground/20 hover:bg-muted"
                aria-label="View source on GitHub"
                title="View source on GitHub"
              >
                <Github size={14.5} />
              </a>
              <HybridTooltip>
                <HybridTooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold hover:cursor-help"
                    aria-label="Important notes about room availability"
                  >
                    <BadgeHelp size={12} />
                  </Button>
                </HybridTooltipTrigger>
                <HybridTooltipContent className="w-80">
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
                </HybridTooltipContent>
              </HybridTooltip>
              <Button
                variant="outline"
                className={`h-6 md:h-8 rounded-full border-2 flex items-center gap-1.5 px-2.5 ${showMap
                  ? "bg-sky-100/50 hover:bg-sky-100/70 dark:bg-sky-800/30 dark:hover:bg-sky-800/50 border-sky-300/60 dark:border-sky-600/60 hover:cursor-e-resize"
                  : "border-foreground/20 hover:bg-muted hover:cursor-w-resize"
                  }`}
                onClick={() => setShowMap(!showMap)}
                aria-label={showMap ? "Hide map" : "Show map"}
                title={showMap ? "Hide map" : "Show map"}
              >
                <MapIcon size={12} />
                <span className="text-xs pr-1">Map</span>
              </Button>
              <DateTimeButton isFetching={isFetching} />
            </TooltipProvider>
          </div>
        </div>
        <div className="mt-2 md:mt-3 w-full relative flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-6 md:h-8 rounded-full"
              aria-label="Search facilities"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={hasActiveFilters ? "default" : "outline"}
                size="icon"
                className={`h-6 w-6 md:h-8 md:w-8 rounded-full border-2 transition-all duration-200 ${hasActiveFilters
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-foreground/20 hover:border-foreground/40"
                  }`}
                aria-label="Filter options"
              >
                <Filter size={14} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 overflow-hidden border-border/50 shadow-xl" align="end">
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
                    onClick={clearFilters}
                  >
                    <X size={12} className="mr-1" />
                    Clear all
                  </Button>
                )}
              </div>

              <div className="p-4 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <Clock size={14} className="text-muted-foreground" />
                    Minimum Duration
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[30, 60, 120, 240].map((mins) => (
                      <Button
                        key={mins}
                        variant={minDuration === mins ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMinDuration(minDuration === mins ? undefined : mins)}
                        className={`h-9 text-xs transition-all ${minDuration === mins
                          ? "shadow-sm font-semibold"
                          : "hover:border-primary/50 hover:bg-primary/5"
                          }`}
                      >
                        {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <Hourglass size={14} className="text-muted-foreground" />
                    Free Until
                  </div>
                  <div className="relative">
                    <Input
                      id="freeUntil"
                      type="time"
                      value={freeUntil}
                      onChange={(e) => setFreeUntil(e.target.value)}
                      className="h-9 pl-9 font-mono text-sm"
                    />
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-[10px] text-muted-foreground pl-1">
                    Find rooms that are available at least until this time today.
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <ScrollArea className="flex-1" ref={scrollAreaRef}>
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
                  isFavorite={isFavorite(facility.id)}
                  onToggleFavorite={toggleFavorite}
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
                  isFavorite={isFavorite(facility.id)}
                  onToggleFavorite={toggleFavorite}
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
              No facilities found matching your criteria
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
    </div>
  );
};

LeftSidebar.displayName = "LeftSidebar";

export default memo(LeftSidebar);
