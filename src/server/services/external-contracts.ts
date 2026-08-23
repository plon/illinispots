import { z } from "zod";
import type {
  ReservationResponse,
  RoomScheduleBlock,
} from "../../types";

const optionalStringSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

const finiteNumberSchema = z.number().finite();

const optionalNumberSchema = finiteNumberSchema
  .nullish()
  .transform((value) => value ?? undefined);

const optionalBooleanSchema = z
  .boolean()
  .nullish()
  .transform((value) => value ?? undefined);

const classTimeSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const classInfoSchema = z
  .looseObject({
    course: z
      .string()
      .nullish()
      .transform((value) => value ?? ""),
    title: z.string(),
    time: classTimeSchema
      .nullish()
      .transform((value) => value ?? undefined),
  })
  .transform(({ time, ...classInfo }) =>
    time ? { ...classInfo, time } : classInfo,
  );

const academicRoomSchema = z.object({
  status: z.enum(["available", "occupied"]),
  passingPeriod: optionalBooleanSchema,
  availableAt: optionalStringSchema,
  availableFor: optionalNumberSchema,
  availableUntil: optionalStringSchema,
  currentClass: classInfoSchema
    .nullish()
    .transform((value) => value ?? undefined),
  nextClass: classInfoSchema
    .nullish()
    .transform((value) => value ?? undefined),
});

const academicBuildingSchema = z.object({
  name: z.string(),
  coordinates: z.object({
    latitude: finiteNumberSchema,
    longitude: finiteNumberSchema,
  }),
  hours: z.object({
    open: z
      .string()
      .nullish()
      .transform((value) => value ?? ""),
    close: z
      .string()
      .nullish()
      .transform((value) => value ?? ""),
  }),
  rooms: z.record(z.string(), academicRoomSchema),
  isOpen: z.boolean(),
  roomCounts: z.object({
    available: finiteNumberSchema,
    total: finiteNumberSchema,
  }),
});

const cacheMetadataSchema = z.object({
  hit: optionalBooleanSchema,
  source: optionalStringSchema,
  reason: optionalStringSchema,
});

const academicAvailabilitySchema = z.object({
  _cache: cacheMetadataSchema
    .nullish()
    .transform((value) => value ?? undefined),
  buildings: z.record(z.string(), academicBuildingSchema),
});

const reservationResponseSchema = z.object({
  slots: z.array(
    z.object({
      itemId: finiteNumberSchema,
      start: z.string(),
      end: z.string(),
      className: optionalStringSchema,
    }),
  ),
});

const blockDetailsSchema = z.object({
  type: z.enum(["class", "event"]),
  title: z.string(),
  course: optionalStringSchema,
  identifier: optionalStringSchema,
});

const roomScheduleSchema = z.array(
  z.object({
    start: z.string(),
    end: z.string(),
    status: z.enum(["available", "class", "event"]),
    details: blockDetailsSchema
      .nullish()
      .transform((value) => value ?? null),
  }),
);

export type AcademicRoomPayload = z.output<typeof academicRoomSchema>;
export type AcademicBuildingPayload = z.output<
  typeof academicBuildingSchema
>;
export type AcademicAvailabilityPayload = z.output<
  typeof academicAvailabilitySchema
>;

const INVALID_EXTERNAL_RESPONSE = Symbol("invalid external response");

type InvalidExternalResponse = typeof INVALID_EXTERNAL_RESPONSE;
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The three upstream payloads are parsed on every API request. Zod remains the
 * source of truth for malformed values (and therefore preserves its detailed
 * error messages), while these straight-line normalizers handle valid JSON
 * without the schema interpreter's per-field closures and parse frames.
 */
function normalizeOptionalString(
  value: unknown,
): string | undefined | InvalidExternalResponse {
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" ? value : INVALID_EXTERNAL_RESPONSE;
}

function normalizeOptionalNumber(
  value: unknown,
): number | undefined | InvalidExternalResponse {
  if (value === null || value === undefined) return undefined;
  return isFiniteNumber(value) ? value : INVALID_EXTERNAL_RESPONSE;
}

function normalizeOptionalBoolean(
  value: unknown,
): boolean | undefined | InvalidExternalResponse {
  if (value === null || value === undefined) return undefined;
  return typeof value === "boolean" ? value : INVALID_EXTERNAL_RESPONSE;
}

function normalizeClassInfo(
  value: unknown,
): UnknownRecord | undefined | InvalidExternalResponse {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value) || typeof value.title !== "string") {
    return INVALID_EXTERNAL_RESPONSE;
  }

  const course = normalizeOptionalString(value.course);
  if (course === INVALID_EXTERNAL_RESPONSE) return course;

  let time: { start: string; end: string } | undefined;
  if (value.time !== null && value.time !== undefined) {
    if (
      !isRecord(value.time) ||
      typeof value.time.start !== "string" ||
      typeof value.time.end !== "string"
    ) {
      return INVALID_EXTERNAL_RESPONSE;
    }
    time = { start: value.time.start, end: value.time.end };
  }

  // classInfoSchema is intentionally loose, unlike the other external
  // objects, so retain its unknown fields in the same order as Zod.
  const normalized: UnknownRecord = {
    course: course ?? "",
    title: value.title,
  };
  for (const key of Object.keys(value)) {
    if (key !== "course" && key !== "title" && key !== "time") {
      normalized[key] = value[key];
    }
  }
  if (time) normalized.time = time;
  return normalized;
}

function normalizeAcademicRoom(
  value: unknown,
): UnknownRecord | InvalidExternalResponse {
  if (
    !isRecord(value) ||
    (value.status !== "available" && value.status !== "occupied")
  ) {
    return INVALID_EXTERNAL_RESPONSE;
  }

  const normalized: UnknownRecord = { status: value.status };
  const optionalFields = [
    ["passingPeriod", normalizeOptionalBoolean],
    ["availableAt", normalizeOptionalString],
    ["availableFor", normalizeOptionalNumber],
    ["availableUntil", normalizeOptionalString],
  ] as const;

  for (const [key, normalize] of optionalFields) {
    if (!Object.hasOwn(value, key)) continue;
    const result = normalize(value[key]);
    if (result === INVALID_EXTERNAL_RESPONSE) return result;
    normalized[key] = result;
  }

  for (const key of ["currentClass", "nextClass"] as const) {
    if (!Object.hasOwn(value, key)) continue;
    const classInfo = normalizeClassInfo(value[key]);
    if (classInfo === INVALID_EXTERNAL_RESPONSE) return classInfo;
    normalized[key] = classInfo;
  }

  return normalized;
}

function normalizeAcademicBuilding(
  value: unknown,
): UnknownRecord | InvalidExternalResponse {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !isRecord(value.coordinates) ||
    !isFiniteNumber(value.coordinates.latitude) ||
    !isFiniteNumber(value.coordinates.longitude) ||
    !isRecord(value.hours) ||
    !isRecord(value.rooms) ||
    typeof value.isOpen !== "boolean" ||
    !isRecord(value.roomCounts) ||
    !isFiniteNumber(value.roomCounts.available) ||
    !isFiniteNumber(value.roomCounts.total)
  ) {
    return INVALID_EXTERNAL_RESPONSE;
  }

  const open = normalizeOptionalString(value.hours.open);
  const close = normalizeOptionalString(value.hours.close);
  if (
    open === INVALID_EXTERNAL_RESPONSE ||
    close === INVALID_EXTERNAL_RESPONSE
  ) {
    return INVALID_EXTERNAL_RESPONSE;
  }

  const rooms: UnknownRecord = {};
  for (const roomNumber of Object.keys(value.rooms)) {
    const room = normalizeAcademicRoom(value.rooms[roomNumber]);
    if (room === INVALID_EXTERNAL_RESPONSE) return room;
    rooms[roomNumber] = room;
  }

  return {
    name: value.name,
    coordinates: {
      latitude: value.coordinates.latitude,
      longitude: value.coordinates.longitude,
    },
    hours: { open: open ?? "", close: close ?? "" },
    rooms,
    isOpen: value.isOpen,
    roomCounts: {
      available: value.roomCounts.available,
      total: value.roomCounts.total,
    },
  };
}

function normalizeCacheMetadata(
  value: unknown,
): UnknownRecord | undefined | InvalidExternalResponse {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) return INVALID_EXTERNAL_RESPONSE;

  const normalized: UnknownRecord = {};
  const fields = [
    ["hit", normalizeOptionalBoolean],
    ["source", normalizeOptionalString],
    ["reason", normalizeOptionalString],
  ] as const;
  for (const [key, normalize] of fields) {
    if (!Object.hasOwn(value, key)) continue;
    const result = normalize(value[key]);
    if (result === INVALID_EXTERNAL_RESPONSE) return result;
    normalized[key] = result;
  }
  return normalized;
}

function fastParseAcademicAvailability(
  value: unknown,
): AcademicAvailabilityPayload | InvalidExternalResponse {
  if (!isRecord(value) || !isRecord(value.buildings)) {
    return INVALID_EXTERNAL_RESPONSE;
  }

  const buildings: UnknownRecord = {};
  for (const id of Object.keys(value.buildings)) {
    const building = normalizeAcademicBuilding(value.buildings[id]);
    if (building === INVALID_EXTERNAL_RESPONSE) return building;
    buildings[id] = building;
  }

  const normalized: UnknownRecord = { buildings };
  if (Object.hasOwn(value, "_cache")) {
    const metadata = normalizeCacheMetadata(value._cache);
    if (metadata === INVALID_EXTERNAL_RESPONSE) return metadata;
    normalized._cache = metadata;
  }
  return normalized as AcademicAvailabilityPayload;
}

function fastParseReservationResponse(
  value: unknown,
): ReservationResponse | InvalidExternalResponse {
  if (!isRecord(value) || !Array.isArray(value.slots)) {
    return INVALID_EXTERNAL_RESPONSE;
  }

  const slots: ReservationResponse["slots"] = [];
  for (const slot of value.slots) {
    if (
      !isRecord(slot) ||
      !isFiniteNumber(slot.itemId) ||
      typeof slot.start !== "string" ||
      typeof slot.end !== "string"
    ) {
      return INVALID_EXTERNAL_RESPONSE;
    }
    const className = normalizeOptionalString(slot.className);
    if (className === INVALID_EXTERNAL_RESPONSE) return className;

    const normalized: ReservationResponse["slots"][number] = {
      itemId: slot.itemId,
      start: slot.start,
      end: slot.end,
    };
    if (Object.hasOwn(slot, "className")) {
      normalized.className = className;
    }
    slots.push(normalized);
  }
  return { slots };
}

function normalizeBlockDetails(
  value: unknown,
): UnknownRecord | null | InvalidExternalResponse {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    (value.type !== "class" && value.type !== "event") ||
    typeof value.title !== "string"
  ) {
    return INVALID_EXTERNAL_RESPONSE;
  }

  const normalized: UnknownRecord = {
    type: value.type,
    title: value.title,
  };
  for (const key of ["course", "identifier"] as const) {
    if (!Object.hasOwn(value, key)) continue;
    const result = normalizeOptionalString(value[key]);
    if (result === INVALID_EXTERNAL_RESPONSE) return result;
    normalized[key] = result;
  }
  return normalized;
}

function fastParseRoomSchedule(
  value: unknown,
): RoomScheduleBlock[] | InvalidExternalResponse {
  if (!Array.isArray(value)) return INVALID_EXTERNAL_RESPONSE;

  const schedule: RoomScheduleBlock[] = [];
  for (const block of value) {
    if (
      !isRecord(block) ||
      typeof block.start !== "string" ||
      typeof block.end !== "string" ||
      (block.status !== "available" &&
        block.status !== "class" &&
        block.status !== "event")
    ) {
      return INVALID_EXTERNAL_RESPONSE;
    }
    const details = normalizeBlockDetails(block.details);
    if (details === INVALID_EXTERNAL_RESPONSE) return details;
    schedule.push({
      start: block.start,
      end: block.end,
      status: block.status,
      details: details as RoomScheduleBlock["details"],
    });
  }
  return schedule;
}

function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) return "root";

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }

    const key = String(segment);
    return formatted ? `${formatted}.${key}` : key;
  }, "");
}

export class ExternalResponseError extends Error {
  constructor(source: string, error: z.ZodError) {
    const issue = error.issues[0];
    const detail = issue
      ? ` at ${formatIssuePath(issue.path)}: ${issue.message}`
      : "";

    super(`Invalid ${source} response${detail}`, { cause: error });
    this.name = "ExternalResponseError";
  }
}

function parseExternal<T>(
  schema: z.ZodType<T>,
  value: unknown,
  source: string,
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ExternalResponseError(source, result.error);
  }

  return result.data;
}

export function parseAcademicAvailabilityPayload(
  value: unknown,
): AcademicAvailabilityPayload {
  const normalized = fastParseAcademicAvailability(value);
  if (normalized !== INVALID_EXTERNAL_RESPONSE) return normalized;

  return parseExternal(
    academicAvailabilitySchema,
    value,
    "academic availability",
  );
}

export function parseReservationResponse(value: unknown): ReservationResponse {
  const normalized = fastParseReservationResponse(value);
  if (normalized !== INVALID_EXTERNAL_RESPONSE) return normalized;

  return parseExternal(reservationResponseSchema, value, "LibCal");
}

export function parseRoomSchedule(value: unknown): RoomScheduleBlock[] {
  const normalized = fastParseRoomSchedule(value);
  if (normalized !== INVALID_EXTERNAL_RESPONSE) return normalized;

  return parseExternal(roomScheduleSchema, value, "room schedule");
}
