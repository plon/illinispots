import React, { memo } from "react";
import type { Facility } from "@/types";
import { type FilterCriteria, EMPTY_FILTER_CRITERIA } from "@/utils/filterUtils";
import { Button } from "@/components/ui/button";
import { FacilityListItem } from "./FacilityListItem";

interface FacilityListViewProps {
  libraryFacilities: Facility[];
  academicFacilities: Facility[];
  onSelectFacility: (facilityId: string) => void;
  filterCriteria?: FilterCriteria;
  isLibraryFetching?: boolean;
  isAcademicLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
}

export const FacilityListView: React.FC<FacilityListViewProps> = memo(
  ({
    libraryFacilities,
    academicFacilities,
    onSelectFacility,
    filterCriteria = EMPTY_FILTER_CRITERIA,
    isLibraryFetching = false,
    isAcademicLoading = false,
    error = null,
    onRetry,
    hasActiveFilters = false,
  }) => (
    <div className="w-full pb-6">
      {/* Library Section */}
      {libraryFacilities.length > 0 ? (
        <div className="mt-2">
          <h2 className="text-sm font-normal text-muted-foreground pl-6 mb-1">
            Library
          </h2>
          <div className="w-full border-t border-border/70">
            {libraryFacilities.map((facility) => (
              <FacilityListItem
                key={`facility-${facility.id}`}
                facility={facility}
                onSelect={onSelectFacility}
                filterCriteria={filterCriteria}
              />
            ))}
          </div>
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
          <div aria-hidden="true" className="border-t border-border/70">
            {[0, 1, 2].map((index) => (
              <div key={index} className="border-b border-border/70">
                <div className="h-[44px] px-4 flex items-center justify-between">
                  <div
                    className={`h-4 rounded bg-muted animate-pulse ${
                      index === 0 ? "w-36" : index === 1 ? "w-52" : "w-24"
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
          <div className="w-full border-t border-border/70">
            {academicFacilities.map((facility) => (
              <FacilityListItem
                key={`facility-${facility.id}`}
                facility={facility}
                onSelect={onSelectFacility}
                filterCriteria={filterCriteria}
              />
            ))}
          </div>
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
          <div aria-hidden="true" className="border-t border-border/70">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="border-b border-border/70">
                <div className="h-[44px] px-4 flex items-center justify-between">
                  <div
                    className={`h-4 rounded bg-muted animate-pulse ${
                      index % 2 === 0 ? "w-48" : "w-32"
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

      {/* Error state */}
      {error && !isAcademicLoading && academicFacilities.length === 0 && (
        <div className="p-4 text-center">
          <p className="text-sm text-destructive mb-2">{error}</p>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="text-xs"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Filter empty state */}
      {hasActiveFilters &&
        !isAcademicLoading &&
        !isLibraryFetching &&
        academicFacilities.length === 0 &&
        libraryFacilities.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No facilities match your filter criteria.</p>
            <p className="text-xs mt-1">Try adjusting your filters.</p>
          </div>
        )}
    </div>
  ),
);

FacilityListView.displayName = "FacilityListView";
