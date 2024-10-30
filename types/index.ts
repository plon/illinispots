export interface ClassTime {
  start: string;
  end: string;
}

export interface ClassInfo {
  course: string;
  title: string;
  time: ClassTime;
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
