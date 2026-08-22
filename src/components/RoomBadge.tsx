import React, { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { FacilityType, RoomStatus } from "@/types";

interface RoomBadgeProps {
  status: RoomStatus;
  availableAt?: string;
  availableFor?: number;
  facilityType: FacilityType;
}

const badgeStyles: Record<RoomStatus, string> = {
  [RoomStatus.AVAILABLE]: "bg-green-50 text-green-700 border-green-300 dark:bg-green-950/60 dark:text-green-400 dark:border-green-800",
  [RoomStatus.PASSING_PERIOD]: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950/60 dark:text-yellow-400 dark:border-yellow-800",
  [RoomStatus.OPENING_SOON]: "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800",
  [RoomStatus.RESERVED]: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800",
  [RoomStatus.OCCUPIED]: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800",
  [RoomStatus.UNAVAILABLE]: "bg-gray-50 text-gray-700 border-gray-300 dark:bg-muted dark:text-muted-foreground dark:border-border",
};

const getStatusText = (
  status: RoomStatus,
  facilityType: FacilityType,
): string => {
  const statusTexts: Record<RoomStatus, string> = {
    [RoomStatus.AVAILABLE]: "Available",
    [RoomStatus.PASSING_PERIOD]: "Passing Period",
    [RoomStatus.OPENING_SOON]: "Opening Soon",
    [RoomStatus.RESERVED]:
      facilityType === FacilityType.LIBRARY ? "Reserved" : "Occupied",
    [RoomStatus.OCCUPIED]: "Occupied",
    [RoomStatus.UNAVAILABLE]: "Unavailable",
  };

  return statusTexts[status];
};

export const RoomBadge: React.FC<RoomBadgeProps> = memo(
  ({ status, facilityType }) => {
    return (
      <Badge variant="outline" className={badgeStyles[status]}>
        {getStatusText(status, facilityType)}
      </Badge>
    );
  },
);

RoomBadge.displayName = "RoomBadge";
