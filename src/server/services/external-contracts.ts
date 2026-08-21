import type {
  ClassInfo,
  ReservationResponse,
  ReservationSlot,
  RoomScheduleBlock,
} from "../../types";

type JsonRecord = Record<string, unknown>;

export class ExternalResponseError extends Error {
  constructor(source: string, path: string, expectation: string) {
    super(`Invalid ${source} response at ${path}: expected ${expectation}`);
    this.name = "ExternalResponseError";
  }
}

function readRecord(value: unknown, source: string, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ExternalResponseError(source, path, "an object");
  }

  return value as JsonRecord;
}

function readArray(value: unknown, source: string, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ExternalResponseError(source, path, "an array");
  }

  return value;
}

function readString(
  value: unknown,
  source: string,
  path: string,
): string {
  if (typeof value !== "string") {
    throw new ExternalResponseError(source, path, "a string");
  }

  return value;
}

function readNumber(
  value: unknown,
  source: string,
  path: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ExternalResponseError(source, path, "a finite number");
  }

  return value;
}

function readBoolean(
  value: unknown,
  source: string,
  path: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new ExternalResponseError(source, path, "a boolean");
  }

  return value;
}

function readOptionalString(
  value: unknown,
  source: string,
  path: string,
): string | undefined {
  return value === null || value === undefined
    ? undefined
    : readString(value, source, path);
}

function readOptionalNumber(
  value: unknown,
  source: string,
  path: string,
): number | undefined {
  return value === null || value === undefined
    ? undefined
    : readNumber(value, source, path);
}

function readOptionalBoolean(
  value: unknown,
  source: string,
  path: string,
): boolean | undefined {
  return value === null || value === undefined
    ? undefined
    : readBoolean(value, source, path);
}

function parseClassInfo(
  value: unknown,
  source: string,
  path: string,
): ClassInfo | undefined {
  if (value === null || value === undefined) return undefined;

  const record = readRecord(value, source, path);
  const course = readOptionalString(record.course, source, `${path}.course`);
  const title = readString(record.title, source, `${path}.title`);
  let time: ClassInfo["time"];

  if (record.time !== null && record.time !== undefined) {
    const timeRecord = readRecord(record.time, source, `${path}.time`);
    time = {
      start: readString(timeRecord.start, source, `${path}.time.start`),
      end: readString(timeRecord.end, source, `${path}.time.end`),
    };
  }

  return {
    ...record,
    course: course ?? "",
    title,
    ...(time ? { time } : {}),
  };
}

export interface AcademicBuildingPayload {
  name: string;
  coordinates: { latitude: number; longitude: number };
  hours: { open: string; close: string };
  rooms: Record<string, AcademicRoomPayload>;
  isOpen: boolean;
  roomCounts: { available: number; total: number };
}

export interface AcademicRoomPayload {
  status: "available" | "occupied";
  passingPeriod?: boolean;
  availableAt?: string;
  availableFor?: number;
  availableUntil?: string;
  currentClass?: ClassInfo;
  nextClass?: ClassInfo;
}

export interface AcademicAvailabilityPayload {
  _cache?: {
    hit?: boolean;
    source?: string;
    reason?: string;
  };
  buildings: Record<string, AcademicBuildingPayload>;
}

function parseAcademicRoom(
  value: unknown,
  path: string,
): AcademicRoomPayload {
  const source = "academic availability";
  const record = readRecord(value, source, path);
  const status = readString(record.status, source, `${path}.status`);
  if (status !== "available" && status !== "occupied") {
    throw new ExternalResponseError(
      source,
      `${path}.status`,
      '"available" or "occupied"',
    );
  }

  return {
    status,
    passingPeriod: readOptionalBoolean(
      record.passingPeriod,
      source,
      `${path}.passingPeriod`,
    ),
    availableAt: readOptionalString(
      record.availableAt,
      source,
      `${path}.availableAt`,
    ),
    availableFor: readOptionalNumber(
      record.availableFor,
      source,
      `${path}.availableFor`,
    ),
    availableUntil: readOptionalString(
      record.availableUntil,
      source,
      `${path}.availableUntil`,
    ),
    currentClass: parseClassInfo(
      record.currentClass,
      source,
      `${path}.currentClass`,
    ),
    nextClass: parseClassInfo(
      record.nextClass,
      source,
      `${path}.nextClass`,
    ),
  };
}

export function parseAcademicAvailabilityPayload(
  value: unknown,
): AcademicAvailabilityPayload {
  const source = "academic availability";
  const root = readRecord(value, source, "root");
  const buildingsRecord = readRecord(root.buildings, source, "buildings");
  const buildings: Record<string, AcademicBuildingPayload> = {};

  for (const [buildingId, buildingValue] of Object.entries(buildingsRecord)) {
    const path = `buildings.${buildingId}`;
    const building = readRecord(buildingValue, source, path);
    const coordinates = readRecord(
      building.coordinates,
      source,
      `${path}.coordinates`,
    );
    const hours = readRecord(building.hours, source, `${path}.hours`);
    const roomCounts = readRecord(
      building.roomCounts,
      source,
      `${path}.roomCounts`,
    );
    const roomsRecord = readRecord(building.rooms, source, `${path}.rooms`);
    const rooms: AcademicBuildingPayload["rooms"] = {};

    for (const [roomNumber, roomValue] of Object.entries(roomsRecord)) {
      rooms[roomNumber] = parseAcademicRoom(
        roomValue,
        `${path}.rooms.${roomNumber}`,
      );
    }

    buildings[buildingId] = {
      name: readString(building.name, source, `${path}.name`),
      coordinates: {
        latitude: readNumber(
          coordinates.latitude,
          source,
          `${path}.coordinates.latitude`,
        ),
        longitude: readNumber(
          coordinates.longitude,
          source,
          `${path}.coordinates.longitude`,
        ),
      },
      hours: {
        open:
          readOptionalString(hours.open, source, `${path}.hours.open`) ?? "",
        close:
          readOptionalString(hours.close, source, `${path}.hours.close`) ?? "",
      },
      rooms,
      isOpen: readBoolean(building.isOpen, source, `${path}.isOpen`),
      roomCounts: {
        available: readNumber(
          roomCounts.available,
          source,
          `${path}.roomCounts.available`,
        ),
        total: readNumber(
          roomCounts.total,
          source,
          `${path}.roomCounts.total`,
        ),
      },
    };
  }

  let cache: AcademicAvailabilityPayload["_cache"];
  if (root._cache !== null && root._cache !== undefined) {
    const cacheRecord = readRecord(root._cache, source, "_cache");
    cache = {
      hit: readOptionalBoolean(cacheRecord.hit, source, "_cache.hit"),
      source: readOptionalString(cacheRecord.source, source, "_cache.source"),
      reason: readOptionalString(cacheRecord.reason, source, "_cache.reason"),
    };
  }

  return { buildings, ...(cache ? { _cache: cache } : {}) };
}

export function parseReservationResponse(value: unknown): ReservationResponse {
  const source = "LibCal";
  const root = readRecord(value, source, "root");
  const slots = readArray(root.slots, source, "slots").map(
    (slotValue, index): ReservationSlot => {
      const path = `slots[${index}]`;
      const slot = readRecord(slotValue, source, path);
      return {
        itemId: readNumber(slot.itemId, source, `${path}.itemId`),
        start: readString(slot.start, source, `${path}.start`),
        end: readString(slot.end, source, `${path}.end`),
        className: readOptionalString(
          slot.className,
          source,
          `${path}.className`,
        ),
      };
    },
  );

  return { slots };
}

export function parseRoomSchedule(value: unknown): RoomScheduleBlock[] {
  const source = "room schedule";

  return readArray(value, source, "root").map((blockValue, index) => {
    const path = `blocks[${index}]`;
    const block = readRecord(blockValue, source, path);
    const status = readString(block.status, source, `${path}.status`);
    if (status !== "available" && status !== "class" && status !== "event") {
      throw new ExternalResponseError(
        source,
        `${path}.status`,
        '"available", "class", or "event"',
      );
    }

    let details: RoomScheduleBlock["details"] = null;
    if (block.details !== null && block.details !== undefined) {
      const detailRecord = readRecord(
        block.details,
        source,
        `${path}.details`,
      );
      const type = readString(
        detailRecord.type,
        source,
        `${path}.details.type`,
      );
      if (type !== "class" && type !== "event") {
        throw new ExternalResponseError(
          source,
          `${path}.details.type`,
          '"class" or "event"',
        );
      }

      details = {
        type,
        title: readString(
          detailRecord.title,
          source,
          `${path}.details.title`,
        ),
        course: readOptionalString(
          detailRecord.course,
          source,
          `${path}.details.course`,
        ),
        identifier: readOptionalString(
          detailRecord.identifier,
          source,
          `${path}.details.identifier`,
        ),
      };
    }

    return {
      start: readString(block.start, source, `${path}.start`),
      end: readString(block.end, source, `${path}.end`),
      status,
      details,
    };
  });
}
