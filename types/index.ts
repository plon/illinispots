export interface BuildingStatus {
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
  status: 'available' | 'occupied';
  available: boolean;
  currentClass?: ClassInfo;
  nextClass?: ClassInfo;
  availableAt?: string;
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