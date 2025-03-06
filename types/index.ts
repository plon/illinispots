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

// Unified room type that can represent both academic and library rooms
export interface FacilityRoom {
  status: "available" | "occupied" | "reserved";
  available: boolean;
  // Academic building specific fields
  currentClass?: ClassInfo;
  nextClass?: ClassInfo;
  passingPeriod?: boolean;
  availableAt?: string;
  availableFor?: number;
  availableUntil?: string;
  // Library specific fields
  url?: string;
  thumbnail?: string;
  slots?: TimeSlot[];
  nextAvailable?: string | null;
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
  nextAvailable: string | null;
  available_duration: number;
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
  coordinates: [number, number];
}

export interface MapProps {
  facilityData: BuildingStatus | null;
  onMarkerClick: (id: string, facilityType: FacilityType) => void;
}

export interface MarkerData {
  id: string;
  name: string;
  coordinates: [number, number];
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
