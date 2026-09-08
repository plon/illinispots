import React, { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { FacilityType, RoomStatus } from "@/types";
import { STATUS_BADGE_STYLES } from "./roomBadgeStyles";

interface RoomBadgeProps {
  status: RoomStatus;
  availableAt?: string;
  availableFor?: number;
  facilityType: FacilityType;
}
const badgeStyles: Record<RoomStatus, string> = {
  [RoomStatus.AVAILABLE]: STATUS_BADGE_STYLES[RoomStatus.AVAILABLE],
  [RoomStatus.PASSING_PERIOD]: STATUS_BADGE_STYLES[RoomStatus.PASSING_PERIOD],
  [RoomStatus.OPENING_SOON]: STATUS_BADGE_STYLES[RoomStatus.OPENING_SOON],
  [RoomStatus.RESERVED]: STATUS_BADGE_STYLES[RoomStatus.RESERVED],
  [RoomStatus.OCCUPIED]: STATUS_BADGE_STYLES[RoomStatus.OCCUPIED],
  [RoomStatus.UNAVAILABLE]: STATUS_BADGE_STYLES[RoomStatus.UNAVAILABLE],
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
