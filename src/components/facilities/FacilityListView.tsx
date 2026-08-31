import React, { memo } from "react";
import { Facility, FacilityType } from "@/types";
import { FilterCriteria } from "@/utils/filterUtils";
import { FavoriteItem } from "@/hooks/useFavorites";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { FacilityAccordionItem } from "./FacilityAccordionItem";

interface FacilityListViewProps {
  libraryFacilities: Facility[];
  academicFacilities: Facility[];
  expandedFacilityIds: string[];
  onExpandedFacilityIdsChange: (facilityIds: string[]) => void;
  filterCriteria?: FilterCriteria;
  isLibraryFetching?: boolean;
  isAcademicLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: FavoriteItem) => void;
}

export const FacilityListView: React.FC<FacilityListViewProps> = memo(
  ({
    libraryFacilities,
    academicFacilities,
    expandedFacilityIds,
    onExpandedFacilityIdsChange,
    filterCriteria = {},
    isLibraryFetching = false,
    isAcademicLoading = false,
    error = null,
    onRetry,
    hasActiveFilters = false,
  }) => {
    return (
      <div className="w-full">
        {/* Library Section */}
        {libraryFacilities.length > 0 ? (
          <div className="mt-2">
            <h2 className="text-sm font-normal text-muted-foreground pl-6 mb-1">
              Library
            </h2>
            <Accordion
              type="multiple"
              value={expandedFacilityIds}
              onValueChange={onExpandedFacilityIdsChange}
              className="w-full border-t border-border/70"
            >
              {libraryFacilities.map((facility) => (
                <FacilityAccordionItem
                  key={`facility-${facility.id}`}
                  facility={facility}
                  facilityType={FacilityType.LIBRARY}
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
            <h2 className="text-sm font-normal text-muted-foreground pl-6 mb-1">
              Library
            </h2>
            <span className="sr-only">Loading library availability…</span>
            <div aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <div key={index} className="border-b">
                  <div className="h-[40px] px-4 flex items-center justify-between">
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

        {/* Academic Section */}
        {academicFacilities.length > 0 ? (
          <div className="mt-5">
            <h2 className="text-sm font-normal text-muted-foreground pl-6 mb-1">
              Academic
            </h2>
            <Accordion
              type="multiple"
              value={expandedFacilityIds}
              onValueChange={onExpandedFacilityIdsChange}
              className="w-full border-t border-border/70"
            >
              {academicFacilities.map((facility) => (
                <FacilityAccordionItem
                  key={`facility-${facility.id}`}
                  facility={facility}
                  facilityType={FacilityType.ACADEMIC}
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
            <h2 className="text-sm font-normal text-muted-foreground pl-6 mb-1">
              Academic
            </h2>
            <span className="sr-only">Loading academic availability…</span>
            <div aria-hidden="true">
              {Array.from({ length: 15 }, (_, index) => (
                <div key={index} className="border-b">
                  <div className="h-[40px] px-4 flex items-center justify-between">
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
      </div>
    );
  },
);

FacilityListView.displayName = "FacilityListView";
