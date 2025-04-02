export interface ClassTime {
  start: string;
  end: string;
}

export enum FacilityType {
  ACADEMIC = "academic",
  LIBRARY = "library",
}

export enum RoomStatus {
  AVAILABLE = "available",
  PASSING_PERIOD = "passing_period",
  RESERVED = "reserved",
  OCCUPIED = "occupied",
  OPENING_SOON = "opening_soon",
}

export interface FacilityStatus {
  timestamp: string;
  facilities: Record<string, Facility>;
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
  rooms: Record<string, FacilityRoom>;
  isOpen: boolean;
  roomCounts: {
    available: number;
    total: number;
  };
  // Library-specific fields (optional)
  address?: string;
}

// Base facility room with common properties
export interface BaseFacilityRoom {
  status: RoomStatus;
  availableAt?: string;
  availableFor?: number;
}

// Academic-specific room properties
export interface AcademicRoom extends BaseFacilityRoom {
  // Not redundant with FacilityType.ACADEMIC since specific rooms do not have to be the facility type
  type: "academic";
  currentClass?: ClassInfo;
  nextClass?: ClassInfo;
  passingPeriod?: boolean;
  availableUntil?: string;
}

// Library-specific room properties
export interface LibraryRoom extends BaseFacilityRoom {
  type: "library";
  url: string;
  thumbnail: string;
  slots: TimeSlot[];
}

// Discriminated union for FacilityRoom
export type FacilityRoom = AcademicRoom | LibraryRoom;

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
  facilityData: FacilityStatus | null;
  onMarkerClick: (id: string, facilityType: FacilityType) => void;
  onMapLoaded?: () => void;
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
  hours: {
    open: string;
    close: string;
  };
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
  // room.type for room-level decisions
  room: FacilityRoom;
  // facilityType for facility-level decisions
  facilityType: FacilityType;
}
export interface AccordionRefs {
  [key: string]: HTMLDivElement | null;
}

export interface RoomBadgeProps {
  status: RoomStatus;
  availableAt?: string;
  availableFor?: number;
  facilityType: FacilityType;
}

export interface AcademicBlockDetails {
  type: "class" | "event";
  course?: string; // For classes
  identifier?: string; // For events (e.g., occupant)
  title: string;
}

export interface RoomScheduleBlock {
  start: string; // HH:mm:ss
  end: string; // HH:mm:ss
  status: "available" | "class" | "event";
  details: AcademicBlockDetails | null; // Null for 'available' status
}

export interface BlockSection {
  start: string; // HH:mm:ss
  end: string; // HH:mm:ss
  status: "available" | "class" | "event";
  details: AcademicBlockDetails | null; // Null for 'available' status
}

export interface HourlyScheduleBlock {
  start: string; // HH:mm:ss
  end: string; // HH:mm:ss
  sections: BlockSection[]; // Sections within this hourly block
}
