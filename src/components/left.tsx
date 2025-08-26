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
import { Facility, FacilityStatus, FacilityType, AccordionRefs } from "@/types";
import {
  Github,
  Map as MapIcon,
  TriangleAlert,
  Search,
  LoaderPinwheel,
} from "lucide-react";
import FacilityAccordion from "@/components/FacilityAccordion";
import DateTimeButton from "@/components/DateTimeButton";

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
      if (!searchTerm) {
        return facilities;
      }
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      return facilities.filter((facility) =>
        facility.name.toLowerCase().includes(lowerCaseSearchTerm),
      );
    },
    [searchTerm],
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

  return (
    <div className="h-full bg-background border-t md:border-t-0 md:border-l flex flex-col relative">
      <div className="sidebar-header py-1 pl-3 pr-3 md:p-4 border-b flex flex-col">
        <div className="flex justify-between items-center w-full">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">
              <span style={{ color: "#FF5F05" }}>illini</span>
              <span style={{ color: "#13294B" }}>Spots</span>
            </h1>
          </div>
          <div className="flex gap-2 items-center pt-1">
            <a
              href="https://github.com/plon/illinispots"
              target="_blank"
              rel="noopener"
              className="h-6 w-6 md:h-8 md:w-8 rounded-full flex items-center justify-center border-2 border-foreground/20 hover:bg-muted"
              aria-label="View source on GitHub"
            >
              <Github size={14.5} />
            </a>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold"
                  aria-label="Important notes about room availability"
                >
                  <TriangleAlert size={12} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
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
            <Button
              variant="outline"
              className={`h-6 md:h-8 rounded-full border-2 flex items-center gap-1.5 px-2.5 ${
                showMap
                  ? "bg-sky-100/50 hover:bg-sky-100/70 dark:bg-sky-800/30 dark:hover:bg-sky-800/50 border-sky-300/60 dark:border-sky-600/60 hover:cursor-e-resize"
                  : "border-foreground/20 hover:bg-muted hover:cursor-w-resize"
              }`}
              onClick={() => setShowMap(!showMap)}
              aria-label={showMap ? "Hide map" : "Show map"}
            >
              <MapIcon size={12} />
              <span className="text-xs pr-1">Map</span>
            </Button>
            <DateTimeButton isFetching={isFetching} />
          </div>
        </div>
        <div className="mt-2 md:mt-3 w-full relative">
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
      </div>

      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        {" "}
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
                />
              ))}
            </Accordion>
          </div>
        ) : searchTerm && libraryFacilities.length === 0 ? null : null}
        {/* No Results Message */}
        {searchTerm &&
          libraryFacilities.length === 0 &&
          academicFacilities.length === 0 && (
            <p className="text-center text-muted-foreground text-sm mt-6 px-4">
              No facilities found matching &quot;{searchTerm}&quot;
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
