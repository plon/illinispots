import React, {
  useRef,
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react";
import { Accordion } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FacilityStatus, FacilityType, AccordionRefs } from "@/types";
import { Github, Map as MapIcon, TriangleAlert } from "lucide-react";
import FacilityAccordion from "@/components/FacilityAccordion";

interface LeftSidebarProps {
  facilityData: FacilityStatus | null;
  showMap: boolean;
  setShowMap: Dispatch<SetStateAction<boolean>>;
  expandedItems: string[];
  setExpandedItems: Dispatch<SetStateAction<string[]>>;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  facilityData,
  showMap,
  setShowMap,
  expandedItems,
  setExpandedItems,
}) => {
  const accordionRefs = useRef<AccordionRefs>({});
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const scrollToAccordion = useCallback((accordionId: string) => {
    const element = accordionRefs.current[accordionId];
    if (element) {
      setTimeout(() => {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, []);

  const toggleItem = useCallback(
    (value: string) => {
      setExpandedItems((prevItems) => {
        const newItems = prevItems.includes(value)
          ? prevItems.filter((item) => item !== value)
          : [...prevItems, value];
        return newItems;
      });
    },
    [setExpandedItems],
  );

  const prevExpandedItemsRef = useRef<string[]>([]);

  // Add scroll into view effect when items expand
  useEffect(() => {
    const newItems = expandedItems.filter(
      (item) => !prevExpandedItemsRef.current.includes(item),
    );
    if (newItems.length === 1) {
      scrollToAccordion(newItems[0]);
    }
    prevExpandedItemsRef.current = expandedItems;
  }, [expandedItems, scrollToAccordion]);

  // Separate facilities by type
  const libraryFacilities = useMemo(
    () =>
      facilityData
        ? Object.values(facilityData.facilities)
            .filter((facility) => facility.type === FacilityType.LIBRARY)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [facilityData],
  );

  const academicFacilities = useMemo(
    () =>
      facilityData
        ? Object.values(facilityData.facilities)
            .filter((facility) => facility.type === FacilityType.ACADEMIC)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [facilityData],
  );

  return (
    <div className="h-full bg-background border-t md:border-t-0 md:border-l flex flex-col">
      <div className="py-1 pl-3 pr-3 md:p-4 border-b flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            <span style={{ color: "#FF5F05" }}>illini</span>
            <span style={{ color: "#13294B" }}>Spots</span>
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Find available study spaces
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <a
            href="https://github.com/plon/illinispots"
            target="_blank"
            rel="noopener noreferrer"
            className="h-6 w-6 md:h-8 md:w-8 rounded-full flex items-center justify-center border-2 border-foreground/20 hover:bg-muted"
          >
            <Github size={14.5} />
          </a>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold"
              >
                <TriangleAlert size={12} />
                <span className="sr-only">Warning about room availability</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="text-sm space-y-2">
                <p className="font-medium">Important Notes:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Building/room access may be restricted to specific colleges
                    or departments
                  </li>
                  <li>
                    Displayed availability only reflects official class
                    schedules
                  </li>
                  <li>
                    Rooms may be occupied by unofficial meetings or study groups
                  </li>
                  <li>Different schedules may apply during exam periods</li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className={`h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold ${
              showMap ? "bg-muted" : ""
            }`}
            onClick={() => setShowMap(!showMap)}
          >
            <MapIcon size={12} />
            <span className="sr-only">Toggle map visibility</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        {/* Libraries Section */}
        {libraryFacilities.length > 0 && (
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
        )}

        {/* Academic Buildings Section */}
        {academicFacilities.length > 0 && (
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
        )}
      </ScrollArea>
    </div>
  );
};

LeftSidebar.displayName = "LeftSidebar";

export default memo(LeftSidebar);
