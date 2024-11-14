export interface ClassTime {
  start: string;
  end: string;
}

export interface BuildingStatus {
  timestamp: string;
  buildings: {
    [key: string]: Building;
  };
}

export interface Building {
  name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  hours: {
    open: string;
    close: string;
  };
  rooms: {
    [key: string]: Room;
  };
  isOpen: boolean;
  roomCounts: {
    available: number;
    total: number;
  };
}

export interface Room {
  status: "available" | "occupied";
  available: boolean;
  currentClass?: ClassInfo;
  nextClass?: ClassInfo;
  passingPeriod: boolean;
  availableAt?: string; // first meaningful gap
  availableFor?: number; // duration of the meaningful gap in minutes
  availableUntil?: string;
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
  address: string;
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
