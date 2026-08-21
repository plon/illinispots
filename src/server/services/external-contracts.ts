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
  return parseExternal(
    academicAvailabilitySchema,
    value,
    "academic availability",
  );
}

export function parseReservationResponse(value: unknown): ReservationResponse {
  return parseExternal(reservationResponseSchema, value, "LibCal");
}

export function parseRoomSchedule(value: unknown): RoomScheduleBlock[] {
  return parseExternal(roomScheduleSchema, value, "room schedule");
}
