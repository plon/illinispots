export interface ClassTime {
  start: string;
  end: string;
}

export enum FacilityType {
  ACADEMIC = 'academic',
  LIBRARY = 'library'
}

export interface BuildingStatus {
  timestamp: string;
  facilities: {
    [key: string]: Facility;
  };
}

// Unified Facility type to represent both academic buildings and libraries
export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  hours: {
    open: string;
    close: string;
  };
  rooms: {
    [key: string]: FacilityRoom;
  };
  isOpen: boolean;
  roomCounts: {
    available: number;
    total: number;
  };
  // Library-specific fields (optional)
  address?: string;
}

export interface BaseFacilityRoom {
  available: boolean;
  status?: "available" | "occupied" | "reserved"; // Derived from available
  availableAt?: string;
  availableFor?: number;
}

export interface AcademicRoom extends BaseFacilityRoom {
  currentClass?: ClassInfo;
  nextClass?: ClassInfo;
  passingPeriod?: boolean;
  availableUntil?: string;
}

export interface LibraryRoom extends BaseFacilityRoom {
  url: string;
  thumbnail: string;
  slots: TimeSlot[];
}

// Unified room type that can represent both types
export interface FacilityRoom extends BaseFacilityRoom {
  // Academic building specific fields
  currentClass?: ClassInfo;
  nextClass?: ClassInfo;
  passingPeriod?: boolean;
  availableUntil?: string;
  // Library specific fields
  url?: string;
  thumbnail?: string;
  slots?: TimeSlot[];
}

export interface ClassInfo {
  course: string;
  title: string;
  time: {
    start: string;
    end: string;
  };
}

export interface Library {
  id: string;
  name: string;
  num_rooms: number;
  address: string;
  isOpen?: boolean;
}

export interface Libraries {
  [key: string]: Library;
}

export interface StudyRoom {
  id: string;
  title: string;
  url: string;
  eid: number;
  lid: number;
  grouping: string;
  thumbnail: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface RoomReservation {
  id: number;
  url: string;
  lid: number;
  grouping: string;
  thumbnail: string;
  slots: TimeSlot[];
  availableAt: string | undefined;
  availableDuration: number;
}

export interface RoomReservations {
  [key: string]: RoomReservation;
}

export interface LibraryData {
  room_count: number;
  currently_available: number;
  rooms: RoomReservations;
  address?: string;
  isOpen?: boolean;
}

export interface FormattedLibraryData {
  [key: string]: LibraryData;
}

export interface APIResponse {
  timezone: string;
  current_time: string;
  data: FormattedLibraryData;
}

export interface ReservationSlot {
  itemId: number;
  start: string;
  end: string;
  className?: string;
}

export interface ReservationResponse {
  slots: ReservationSlot[];
}

export interface RegexGroups {
  id: string;
  title: string;
  url: string;
  eid: string;
  lid: string;
  grouping: string;
  thumbnail: string;
  [key: string]: string;
}

export interface LibraryCoordinates {
  name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface MapProps {
  facilityData: BuildingStatus | null;
  onMarkerClick: (id: string, facilityType: FacilityType) => void;
}

export interface MarkerData {
  id: string;
  name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  isOpen: boolean;
  available: number;
  total: number;
  type: FacilityType;
}

export interface TimeBlockProps {
  slot: {
    start: string;
    end: string;
    available: boolean;
  };
}

export interface RoomScheduleProps {
  slots: {
    start: string;
    end: string;
    available: boolean;
  }[];
}

export interface FacilityRoomProps {
  roomName: string;
  room: FacilityRoom;
  facilityType: FacilityType;
}

export interface AccordionRefs {
  [key: string]: HTMLDivElement | null;
}

export interface RoomBadgeProps {
  availableAt?: string;
  availableFor?: number;
  available: boolean;
}
