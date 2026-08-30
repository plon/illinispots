export type FacilityAccordionGroup = "library" | "building";

const DELIMITER = ":";
const FACILITY_PREFIX = "facility";

const encodeSegment = (value: string) => encodeURIComponent(value);

export const getFacilityAccordionId = (
  group: FacilityAccordionGroup,
  facilityId: string,
): string =>
  [FACILITY_PREFIX, group, encodeSegment(facilityId)].join(DELIMITER);

export const getAccordionChildId = (
  facilityAccordionId: string,
  ...segments: string[]
): string =>
  [facilityAccordionId, ...segments.map(encodeSegment)].join(DELIMITER);

const getFacilityRoot = (value: string): string | null => {
  const segments = value.split(DELIMITER);
  if (
    segments.length < 3 ||
    segments[0] !== FACILITY_PREFIX ||
    (segments[1] !== "library" && segments[1] !== "building")
  ) {
    return null;
  }

  return segments.slice(0, 3).join(DELIMITER);
};

const isFacilityAccordion = (value: string): boolean =>
  getFacilityRoot(value) === value;

export const getUpdatedAccordionItems = (
  value: string,
  prevItems: string[],
): string[] => {
  if (prevItems.includes(value)) {
    return prevItems.filter((item) => item !== value);
  }

  if (!isFacilityAccordion(value)) {
    return [...prevItems, value];
  }

  const nextRoot = getFacilityRoot(value);
  const nextGroup = value.split(DELIMITER)[1];
  const retainedItems = prevItems.filter((item) => {
    const itemRoot = getFacilityRoot(item);
    if (!itemRoot || itemRoot === nextRoot) return true;

    return itemRoot.split(DELIMITER)[1] !== nextGroup;
  });

  return [...retainedItems, value];
};
