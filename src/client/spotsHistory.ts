export interface SpotsNavigationState {
  facilityBackSteps?: number;
  roomBackSteps?: number;
}

declare module "@tanstack/history" {
  interface HistoryState {
    illiniSpotsNavigation?: SpotsNavigationState;
  }
}

export function markFacilityOpen(
  current: SpotsNavigationState | undefined,
  switchingFacility: boolean,
): SpotsNavigationState | undefined {
  if (!switchingFacility) {
    return { facilityBackSteps: 1 };
  }
  return current?.facilityBackSteps
    ? { facilityBackSteps: current.facilityBackSteps }
    : undefined;
}

export function markRoomOpen(
  current: SpotsNavigationState | undefined,
  switchingRoom: boolean,
): SpotsNavigationState | undefined {
  if (switchingRoom) {return current;}
  return {
    roomBackSteps: 1,
    ...(current?.facilityBackSteps
      ? { facilityBackSteps: current.facilityBackSteps + 1 }
      : {}),
  };
}

export function markSameViewPush(
  current: SpotsNavigationState | undefined,
): SpotsNavigationState | undefined {
  if (!current) {return undefined;}
  return {
    ...(current.facilityBackSteps
      ? { facilityBackSteps: current.facilityBackSteps + 1 }
      : {}),
    ...(current.roomBackSteps
      ? { roomBackSteps: current.roomBackSteps + 1 }
      : {}),
  };
}
