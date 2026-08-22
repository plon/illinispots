import React, { useState, useMemo } from "react";
import { performSearch } from "@/utils/searchUtils";
import { Facility, FacilityStatus } from "@/types";
import { FilterCriteria } from "@/utils/filterUtils";
import { RoomSearchResultCard } from "@/components/RoomSearchResultCard";
import { BuildingSearchResultCard } from "@/components/BuildingSearchResultCard";
import { Button } from "@/components/ui/button";
import {
  Building2,
  DoorOpen,
  Layers,
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
  isLoading?: boolean;
  isLibraryLoading?: boolean;
}
type TabType = "all" | "rooms" | "buildings";

export const SearchResults: React.FC<SearchResultsProps> = ({
  facilityData,
  searchTerm,
  filterCriteria,
  hasActiveFilters,
  onClearFilters,
  onClearSearch,
  isLoading = false,
  isLibraryLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("all");


  const facilitiesList = useMemo<Facility[]>(() => {
    if (!facilityData) return [];
    return Object.values(facilityData.facilities);
  }, [facilityData]);

  const searchResults = useMemo(() => {
    return performSearch(
      facilitiesList,
      searchTerm,
      filterCriteria,
      hasActiveFilters,
    );
  }, [facilitiesList, searchTerm, filterCriteria, hasActiveFilters]);

  const { buildings, rooms, totalCount } = searchResults;

  const isDataIncomplete = isLoading || isLibraryLoading;

  if (isDataIncomplete && (facilitiesList.length === 0 || totalCount === 0)) {
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
      {/* Header & Filter Tabs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              <strong className="text-foreground font-semibold">{totalCount}</strong>{" "}
              result{totalCount === 1 ? "" : "s"} for &ldquo;{searchTerm}&rdquo;
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
        {/* Tab Pills */}
        {totalCount > 0 && (
          <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-lg border border-border/50 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`flex-1 py-1 px-2 rounded-md flex items-center justify-center gap-1 transition-all ${
                activeTab === "all"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>All ({totalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("rooms")}
              className={`flex-1 py-1 px-2 rounded-md flex items-center justify-center gap-1 transition-all ${
                activeTab === "rooms"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <DoorOpen className="w-3 h-3" />
              <span>Rooms ({rooms.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("buildings")}
              className={`flex-1 py-1 px-2 rounded-md flex items-center justify-center gap-1 transition-all ${
                activeTab === "buildings"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Buildings ({buildings.length})</span>
            </button>
          </div>
        )}

        {/* Active Availability Filters Indicator */}
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

      {/* Results List */}
      {totalCount === 0 ? (
        <div className="py-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
            <Search className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              No spots found matching &ldquo;{searchTerm}&rdquo;
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Try searching by room number (e.g. 1404), building name (e.g. Siebel, Grainger, CIF), or course (e.g. CS 225).
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
      ) : (
        <div className="space-y-4">
          {/* ALL Tab */}
          {activeTab === "all" && (
            <>
              {/* Buildings Section (if any match) */}
              {buildings.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    <span>Buildings ({buildings.length})</span>
                  </div>
                  <div className="space-y-2.5">
                    {buildings.map((buildingResult) => (
                      <BuildingSearchResultCard
                        key={`bldg-${buildingResult.facilityId}`}
                        buildingResult={buildingResult}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Rooms Section (if any match) */}
              {rooms.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                    <DoorOpen className="w-3.5 h-3.5 text-primary" />
                    <span>Rooms ({rooms.length})</span>
                  </div>
                  <div className="space-y-2.5">
                    {rooms.map((roomResult) => (
                      <RoomSearchResultCard
                        key={`room-${roomResult.facilityId}-${roomResult.roomNumber}`}
                        roomResult={roomResult}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ROOMS Tab */}
          {activeTab === "rooms" && (
            <div className="space-y-2.5">
              {rooms.length > 0 ? (
                rooms.map((roomResult) => (
                  <RoomSearchResultCard
                    key={`room-tab-${roomResult.facilityId}-${roomResult.roomNumber}`}
                    roomResult={roomResult}
                  />
                ))
              ) : (
                <p className="text-center text-xs text-muted-foreground py-6">
                  No individual rooms matched &ldquo;{searchTerm}&rdquo;.
                </p>
              )}
            </div>
          )}

          {/* BUILDINGS Tab */}
          {activeTab === "buildings" && (
            <div className="space-y-2.5">
              {buildings.length > 0 ? (
                buildings.map((buildingResult) => (
                  <BuildingSearchResultCard
                    key={`bldg-tab-${buildingResult.facilityId}`}
                    buildingResult={buildingResult}
                  />
                ))
              ) : (
                <p className="text-center text-xs text-muted-foreground py-6">
                  No buildings matched &ldquo;{searchTerm}&rdquo;.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
