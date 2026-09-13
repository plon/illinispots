import React, { useMemo } from "react";
import { performSearch, searchClosedFacilities } from "@/utils/searchUtils";
import { type Facility, type FacilityStatus, FacilityType } from "@/types";
import type { FilterCriteria } from "@/utils/filterUtils";
import { RoomSearchResultCard } from "@/components/RoomSearchResultCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE_STYLES } from "@/components/RoomBadge";
import { formatTimeForDisplay } from "@/utils/time";
import { getLibraryHoursMessage } from "@/utils/libraryHours";
import {
  Building2,
  Clock,
  Search,
  XCircle,
  FilterX,
} from "lucide-react";

interface SearchResultsProps {
  facilityData: FacilityStatus | null;
  searchTerm: string;
  filterCriteria: FilterCriteria;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
  onSelectFacility?: (facilityId: string) => void;
  isLoading?: boolean;
  isLibraryLoading?: boolean;
}

const ClosedSearchResultRow: React.FC<{
  facility: Facility;
  message: string;
  onSelectFacility?: (facilityId: string) => void;
}> = ({ facility, message, onSelectFacility }) => {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <span className="font-medium text-sm text-foreground truncate block">
          {facility.name}
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="w-3 h-3 shrink-0" />
          <span className="truncate">{message}</span>
        </span>
      </div>
      <Badge variant="outline" className={`${STATUS_BADGE_STYLES.closed} text-xs shrink-0`}>
        CLOSED
      </Badge>
    </>
  );

  if (!onSelectFacility) {
    return (
      <div className="rounded-lg border border-border/80 bg-card p-3.5 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectFacility(facility.id)}
      aria-label={`View ${facility.name} details (currently closed)`}
      className="w-full rounded-lg border border-border/80 bg-card p-3.5 flex items-center gap-2 text-left hover:border-primary/40 transition-colors cursor-pointer"
    >
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      {content}
    </button>
  );
};

export const SearchResults: React.FC<SearchResultsProps> = ({
  facilityData,
  searchTerm,
  filterCriteria,
  hasActiveFilters,
  onClearFilters,
  onClearSearch,
  onSelectFacility,
  isLoading = false,
  isLibraryLoading = false,
}) => {
  const facilitiesList = useMemo<Facility[]>(() => {
    if (!facilityData) {return [];}
    return Object.values(facilityData.facilities);
  }, [facilityData]);

  const rooms = useMemo(() => 
    performSearch(
      facilitiesList,
      searchTerm,
      filterCriteria,
      hasActiveFilters,
    )
  , [facilitiesList, searchTerm, filterCriteria, hasActiveFilters]);

  const closedMatches = useMemo(() =>
    searchClosedFacilities(facilitiesList, searchTerm)
  , [facilitiesList, searchTerm]);

  const visibleClosedMatches = useMemo(
    () => closedMatches.slice(0, 3),
    [closedMatches],
  );
  const hiddenClosedCount = closedMatches.length - visibleClosedMatches.length;

  const getClosedHoursMessage = (facility: Facility): string => {
    if (facility.type === FacilityType.LIBRARY) {
      return getLibraryHoursMessage(facility.name);
    }
    return facility.hours?.open
      ? `Opens ${formatTimeForDisplay(facility.hours.open)}`
      : "Not open today";
  };

  const isDataIncomplete = isLoading || isLibraryLoading;

  if (isDataIncomplete && (facilitiesList.length === 0 || rooms.length === 0)) {
    return (
      <div
        className="px-3 md:px-4 py-3 space-y-3.5"
        role="status"
        aria-busy="true"
        aria-label="Searching facilities"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Searching for &ldquo;{searchTerm}&rdquo;…</span>
          </div>
          <button
            type="button"
            onClick={onClearSearch}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border/80 bg-card p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-36 rounded bg-muted animate-pulse" />
                <div className="h-4 w-16 rounded-full bg-muted animate-pulse" />
              </div>
              <div className="h-10 rounded bg-muted/40 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 md:px-4 py-3 space-y-3.5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              <strong className="text-foreground font-semibold">{rooms.length}</strong>{" "}
              {rooms.length === 1 ? "spot" : "spots"} found for &ldquo;{searchTerm}&rdquo;
            </span>
            {isLibraryLoading && (
              <span className="text-[11px] text-muted-foreground/80 pl-1">
                (loading library spots…)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClearSearch}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        {hasActiveFilters && (
          <div className="text-[11px] bg-primary/5 text-foreground border border-primary/20 rounded-md px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-foreground/80 font-medium">
              Filtered by availability criteria
            </span>
            <button
              type="button"
              onClick={onClearFilters}
              className="text-primary hover:underline font-semibold flex items-center gap-1"
            >
              <FilterX className="w-3 h-3" />
              Clear filters
            </button>
          </div>
        )}
      </div>

      {rooms.length === 0 ? (
        visibleClosedMatches.length > 0 ? (
          <div className="space-y-2.5">
            <div className="space-y-2.5">
              {visibleClosedMatches.map((facility) => (
                <ClosedSearchResultRow
                  key={`closed-${facility.id}`}
                  facility={facility}
                  message={getClosedHoursMessage(facility)}
                  onSelectFacility={onSelectFacility}
                />
              ))}
            </div>
            {hiddenClosedCount > 0 && (
              <p className="text-[11px] text-muted-foreground text-center">
                +{hiddenClosedCount} more closed {hiddenClosedCount === 1 ? "building" : "buildings"} matching &ldquo;{searchTerm}&rdquo;
              </p>
            )}
            <div className="py-4 text-center space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No open spots matching &ldquo;{searchTerm}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  The matching {visibleClosedMatches.length === 1 && hiddenClosedCount === 0 ? "building is" : "buildings are"} currently closed.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClearFilters}
                    className="text-xs h-8"
                  >
                    Clear Filters
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onClearSearch}
                  className="text-xs h-8"
                >
                  Clear Search
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
              <Search className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No spots found matching &ldquo;{searchTerm}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Try searching by room number (e.g. 1404) or building name (e.g. Siebel, Grainger, CIF).
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearFilters}
                  className="text-xs h-8"
                >
                  Clear Filters
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={onClearSearch}
                className="text-xs h-8"
              >
                Clear Search
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          {rooms.map((roomResult) => (
            <RoomSearchResultCard
              key={`room-${roomResult.facility.id}-${roomResult.roomNumber}`}
              roomResult={roomResult}
              onSelectFacility={onSelectFacility}
            />
          ))}
          {visibleClosedMatches.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-muted-foreground font-medium">
                Closed matching &ldquo;{searchTerm}&rdquo;
              </p>
              {visibleClosedMatches.map((facility) => (
                <ClosedSearchResultRow
                  key={`closed-${facility.id}`}
                  facility={facility}
                  message={getClosedHoursMessage(facility)}
                  onSelectFacility={onSelectFacility}
                />
              ))}
              {hiddenClosedCount > 0 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  +{hiddenClosedCount} more closed {hiddenClosedCount === 1 ? "building" : "buildings"}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
