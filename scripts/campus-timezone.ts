import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export const CAMPUS_TIMEZONE = "America/Chicago";

interface PackedTimezoneData {
  zones: string[];
}

const localRequire = createRequire(import.meta.url);

/** Read the dependency's complete packed history without bundling other zones. */
export function getPackedCampusTimezone(): string {
  const dataPath = localRequire.resolve(
    "moment-timezone/data/packed/latest.json",
  );
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as PackedTimezoneData;
  const campusZone = data.zones.find((zone) =>
    zone.startsWith(`${CAMPUS_TIMEZONE}|`),
  );

  if (!campusZone) {
    throw new Error(`Missing ${CAMPUS_TIMEZONE} in moment-timezone data`);
  }

  return campusZone;
}
