import { Facility, FacilityRoom, FacilityType, RoomStatus, AcademicRoom, LibraryRoom } from "@/types";
import { FilterCriteria, isRoomAvailable } from "@/utils/filterUtils";
import { compareRoomNumbers } from "@/utils/collation";
import Fuse from "fuse.js";

export const BUILDING_ALIASES: Record<string, string[]> = {
  "Campus Instructional Facility": ["cif", "campus instructional", "instructional facility"],
  "Business Instructional Facility": ["bif", "business instructional"],
  "Electrical and Computer Engineering Building": ["eceb", "ece", "electrical engineering", "computer engineering"],
  "Siebel Center for Comp Sci": ["siebel", "sc", "cs", "siebel cs", "siebel center", "computer science"],
  "Thomas M. Siebel Center for Computer Science": ["siebel", "sc", "cs", "siebel cs", "siebel center", "computer science"],
  "Siebel Center for Design": ["scd", "design"],
  "Digital Computer Laboratory": ["dcl"],
  "Sidney Lu Mechanical Engr Bldg": ["mel", "meb", "mech", "sidney lu", "mechanical"],
  "Mechanical Engineering Building": ["meb", "mech", "mechanical"],
  "Mechanical Engineering Laboratory": ["mel", "mech", "mechanical lab"],
  "Natural History Building": ["nhb", "natural history"],
  "David Kinley Hall": ["dkh", "kinley"],
  "Transportation Building": ["tb", "transportation"],
  "Coordinated Science Laboratory": ["csl", "coordinated science"],
  "Literatures, Cultures, and Linguistics Building": ["lclb", "literatures", "linguistics", "foreign languages"],
  "Literatures, Cultures, & Ling": ["lclb", "literatures", "linguistics", "foreign languages"],
  "Loomis Laboratory of Physics": ["loomis", "physics"],
  "Noyes Laboratory": ["noyes", "chemistry", "chem"],
  "Materials Science & Eng Bld": ["mseb", "matse", "materials science"],
  "Material Science and Engineering Building": ["mseb", "matse", "materials science"],
  "Agricultural Engr Sciences Bld": ["aesb", "agricultural", "aces bldg"],
  "Grainger Engineering Library": ["grainger", "gel", "grainger library", "engineering library"],
  "Funk ACES Library": ["aces", "funk", "funk library", "aces library", "funk aces"],
  "Main Library": ["main", "main library", "orange room", "media commons", "the orange room"],
  "Chemistry Annex": ["chem annex", "chemistry annex"],
  "Henry Administration Bldg": ["hab", "henry"],
  "Wohlers Hall": ["wohlers"],
  "Mumford Hall": ["mumford"],
  "Flagg Hall": ["flagg"],
  "Everitt Laboratory": ["everitt", "bioengineering", "bioe"],
  "Engineering Hall": ["engr hall", "engineering hall"],
  "English Building": ["english"],
  "Davenport Hall": ["davenport"],
  "Burrill Hall": ["burrill"],
  "Bevier Hall": ["bevier"],
  "Armory": ["armory"],
  "Art and Design Building": ["art & design", "art and design", "art"],
  "Architecture Building": ["arch", "architecture"],
  "Psychology Building": ["psych", "psychology"],
  "Newmark Civil Engineering Bldg": ["newmark", "cee", "civil"],
  "Civil & Envir Eng Bldg": ["cee", "hydro", "civil"],
  "Turner Hall": ["turner"],
  "Wymer Hall": ["wymer"],
};

export interface SearchResultRoom {
  type: "room";
  roomNumber: string;
  facilityId: string;
  facilityName: string;
  facilityType: FacilityType;
  room: FacilityRoom;
  facility: Facility;
  score: number;
  matchHighlight?: string;
}

export interface SearchResultBuilding {
  type: "building";
  facilityId: string;
  facilityName: string;
  facilityType: FacilityType;
  facility: Facility;
  score: number;
  availableRoomsCount: number;
  totalRoomsCount: number;
  matchingRooms: SearchResultRoom[];
}

export interface SearchResultsData {
  buildings: SearchResultBuilding[];
  rooms: SearchResultRoom[];
  totalCount: number;
}

interface FacilitySearchItem {
  facility: Facility;
  aliases: string[];
  facilityNameLower: string;
  availableRoomsCount: number;
  totalRoomsCount: number;
}

interface RoomSearchItem {
  roomNumber: string;
  roomNumberLower: string;
  facilityId: string;
  facilityName: string;
  facilityNameLower: string;
  facilityType: FacilityType;
  room: FacilityRoom;
  facility: Facility;
  aliases: string[];
  courseInfo: string;
  groupingInfo: string;
}

export interface FacilitySearchIndex {
  facilityItems: FacilitySearchItem[];
  facilityItemsById: Map<string, FacilitySearchItem>;
  roomItems: RoomSearchItem[];
  roomFuse: Fuse<RoomSearchItem>;
  buildingFuse: Fuse<Facility>;
  eligibleRoomsByFacility: Map<string, SearchResultRoom[]>;
  hasActiveFilters: boolean;
}

/**
 * Generates automated acronyms and aliases for a building name
 */
export const getBuildingAliases = (buildingName: string): string[] => {
  const custom = BUILDING_ALIASES[buildingName] || [];
  const words = buildingName
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const aliases = new Set<string>(custom.map((a) => a.toLowerCase()));

  // Add lowercase full name
  aliases.add(buildingName.toLowerCase());

  // Generate acronym from initials (e.g., Campus Instructional Facility -> cif)
  if (words.length > 1) {
    const acronym = words
      .map((w) => w[0])
      .join("")
      .toLowerCase();
    if (acronym.length >= 2) {
      aliases.add(acronym);
    }
  }

  return Array.from(aliases);
};

const getStatusRank = (status: RoomStatus): number => {
  switch (status) {
    case RoomStatus.AVAILABLE:
      return 5;
    case RoomStatus.PASSING_PERIOD:
      return 4;
    case RoomStatus.OPENING_SOON:
      return 3;
    case RoomStatus.OCCUPIED:
      return 2;
    case RoomStatus.RESERVED:
      return 1;
    case RoomStatus.UNAVAILABLE:
    default:
      return 0;
  }
};

const toSearchResultRoom = (item: RoomSearchItem): SearchResultRoom => ({
  type: "room",
  roomNumber: item.roomNumber,
  facilityId: item.facilityId,
  facilityName: item.facilityName,
  facilityType: item.facilityType,
  room: item.room,
  facility: item.facility,
  score: 0.5,
});

/**
 * Prepares stable room metadata and Fuse indexes once per facilities/filter
 * snapshot. Searching the prepared index avoids rebuilding them on every
 * keystroke.
 */
export const createFacilitySearchIndex = (
  facilities: Facility[],
  filterCriteria: FilterCriteria = {},
  hasActiveFilters: boolean = false,
): FacilitySearchIndex => {
  const facilityItems: FacilitySearchItem[] = [];
  const facilityItemsById = new Map<string, FacilitySearchItem>();
  const roomItems: RoomSearchItem[] = [];
  const eligibleRoomsByFacility = new Map<string, SearchResultRoom[]>();

  facilities.forEach((facility) => {
    const aliases = getBuildingAliases(facility.name);
    const facilityNameLower = facility.name.toLowerCase();
    let availableRoomsCount = 0;

    Object.entries(facility.rooms).forEach(([roomNumber, room]) => {
      const matchesFilters =
        !hasActiveFilters || isRoomAvailable(room, filterCriteria);
      const isAvailable =
        room.status === RoomStatus.AVAILABLE ||
        room.status === RoomStatus.PASSING_PERIOD;

      if (isAvailable && matchesFilters) {
        availableRoomsCount += 1;
      }
      if (!matchesFilters) return;

      let courseInfo = "";
      let groupingInfo = "";

      if (room.type === "academic") {
        const academicRoom = room as AcademicRoom;
        if (academicRoom.currentClass) {
          courseInfo += ` ${academicRoom.currentClass.course} ${academicRoom.currentClass.title}`;
        }
        if (academicRoom.nextClass) {
          courseInfo += ` ${academicRoom.nextClass.course} ${academicRoom.nextClass.title}`;
        }
      } else {
        const libraryRoom = room as LibraryRoom & { grouping?: string };
        if (libraryRoom.grouping) {
          groupingInfo = ` ${libraryRoom.grouping}`;
        }
      }

      const roomItem: RoomSearchItem = {
        roomNumber,
        roomNumberLower: roomNumber.toLowerCase(),
        facilityId: facility.id,
        facilityName: facility.name,
        facilityNameLower,
        facilityType: facility.type,
        room,
        facility,
        aliases,
        courseInfo: courseInfo.toLowerCase(),
        groupingInfo: groupingInfo.toLowerCase(),
      };
      roomItems.push(roomItem);

      const eligibleRooms = eligibleRoomsByFacility.get(facility.id) ?? [];
      eligibleRooms.push(toSearchResultRoom(roomItem));
      eligibleRoomsByFacility.set(facility.id, eligibleRooms);
    });

    const facilityItem: FacilitySearchItem = {
      facility,
      aliases,
      facilityNameLower,
      availableRoomsCount,
      totalRoomsCount:
        facility.roomCounts?.total ?? Object.keys(facility.rooms).length,
    };
    facilityItems.push(facilityItem);
    facilityItemsById.set(facility.id, facilityItem);
  });

  let roomFuse: Fuse<RoomSearchItem> | undefined;
  let buildingFuse: Fuse<Facility> | undefined;

  return {
    facilityItems,
    facilityItemsById,
    roomItems,
    get roomFuse() {
      roomFuse ??= new Fuse(roomItems, {
        keys: [
          { name: "roomNumber", weight: 0.6 },
          { name: "facilityName", weight: 0.25 },
          { name: "aliases", weight: 0.2 },
          { name: "courseInfo", weight: 0.2 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });
      return roomFuse;
    },
    get buildingFuse() {
      buildingFuse ??= new Fuse(facilities, {
        keys: [
          { name: "name", weight: 0.7 },
          { name: "id", weight: 0.3 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });
      return buildingFuse;
    },
    eligibleRoomsByFacility,
    hasActiveFilters,
  };
};

/** Searches across a prepared facilities index. */
export const searchFacilityIndex = (
  searchIndex: FacilitySearchIndex,
  searchTerm: string,
): SearchResultsData => {
  const query = searchTerm.trim().toLowerCase();
  if (!query) {
    return { buildings: [], rooms: [], totalCount: 0 };
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  const cleanTokens = queryTokens.filter(
    (t) => !["room", "rm", "bldg", "building"].includes(t),
  );
  const effectiveTokens = cleanTokens.length > 0 ? cleanTokens : queryTokens;

  const buildingResults: SearchResultBuilding[] = [];

  searchIndex.facilityItems.forEach(
    ({
      facility,
      aliases,
      facilityNameLower,
      availableRoomsCount,
      totalRoomsCount,
    }) => {
      // 1. Evaluate Building Match
      let buildingScore = 0;

      // Check exact or substring matches in building name or aliases
      if (facilityNameLower === query || aliases.includes(query)) {
        buildingScore = 1.0;
      } else if (
        facilityNameLower.startsWith(query) ||
        aliases.some((a) => a.startsWith(query))
      ) {
        buildingScore = 0.92;
      } else if (
        facilityNameLower.includes(query) ||
        aliases.some((a) => a.includes(query))
      ) {
        buildingScore = 0.85;
      } else {
        // Check token-level matches
        const matchedTokens = effectiveTokens.filter(
          (token) =>
            facilityNameLower.includes(token) ||
            aliases.some((a) => a.includes(token) || token.includes(a)),
        );
        if (matchedTokens.length === effectiveTokens.length) {
          buildingScore = 0.8;
        } else if (matchedTokens.length > 0) {
          buildingScore =
            0.4 + 0.35 * (matchedTokens.length / effectiveTokens.length);
        }
      }

      // Do not return a building that has no rooms matching the active
      // availability filters. Otherwise its card falls back to rendering all
      // facility rooms, including rooms that were filtered out.
      if (
        buildingScore >= 0.4 &&
        (!searchIndex.hasActiveFilters || availableRoomsCount > 0)
      ) {
        buildingResults.push({
          type: "building",
          facilityId: facility.id,
          facilityName: facility.name,
          facilityType: facility.type,
          facility,
          score: buildingScore,
          availableRoomsCount,
          totalRoomsCount,
          matchingRooms: [],
        });
      }
    },
  );

  // 3. Score Rooms
  const scoredRoomsMap = new Map<string, SearchResultRoom>();

  searchIndex.roomItems.forEach((item) => {
    const roomNumLower = item.roomNumberLower;
    const facilityNameLower = item.facilityNameLower;
    let score = 0;
    let highlight = "";

    // A. Direct room number exact match (e.g., query "1404" -> room "1404")
    if (roomNumLower === query || `room ${roomNumLower}` === query) {
      score = 1.0;
      highlight = `Room ${item.roomNumber}`;
    }
    // B. Multi-token room + building combined query (e.g., "siebel 1404", "cif 0027", "grainger 405")
    else if (effectiveTokens.length >= 2) {
      const roomNumMatched = effectiveTokens.some(
        (t) => t === roomNumLower || roomNumLower.includes(t) || t.includes(roomNumLower),
      );
      const buildingMatched = effectiveTokens.some(
        (t) =>
          facilityNameLower.includes(t) ||
          item.aliases.some((a) => a.includes(t) || t.includes(a)),
      );

      if (roomNumMatched && buildingMatched) {
        score = 0.98;
        highlight = `${item.facilityName} - Room ${item.roomNumber}`;
      } else if (roomNumMatched) {
        score = 0.85;
      } else if (buildingMatched) {
        score = 0.6;
      }
    }
    // C. Room number starts with query or contains query (e.g., "140" -> "1404")
    else if (roomNumLower.startsWith(query)) {
      score = 0.92;
    } else if (roomNumLower.includes(query)) {
      score = 0.82;
    }
    // D. Building name match (e.g., user searched "siebel" -> include rooms in Siebel)
    else if (
      facilityNameLower.includes(query) ||
      item.aliases.some((a) => a.includes(query))
    ) {
      score = 0.65;
    }
    // E. Course info or grouping info match (e.g., "cs 225", "orange room")
    else if (item.courseInfo.includes(query)) {
      score = 0.9;
      highlight = "Course match";
    } else if (item.groupingInfo.includes(query)) {
      score = 0.88;
      highlight = "Location match";
    }

    // Boost score slightly if room is available
    if (
      item.room.status === RoomStatus.AVAILABLE ||
      item.room.status === RoomStatus.PASSING_PERIOD
    ) {
      score += 0.03;
    }

    if (score >= 0.5) {
      const key = `${item.facilityId}-${item.roomNumber}`;
      scoredRoomsMap.set(key, {
        type: "room",
        roomNumber: item.roomNumber,
        facilityId: item.facilityId,
        facilityName: item.facilityName,
        facilityType: item.facilityType,
        room: item.room,
        facility: item.facility,
        score,
        matchHighlight: highlight,
      });
    }
  });

  // 4. Fallback Fuzzy Search with Fuse.js for typos if few direct results
  if (scoredRoomsMap.size < 5) {
    const fuseResults = searchIndex.roomFuse.search(query);
    fuseResults.forEach((res) => {
      const item = res.item;
      const key = `${item.facilityId}-${item.roomNumber}`;
      if (!scoredRoomsMap.has(key)) {
        const fuzzyScore = Math.max(0.45, 1 - (res.score ?? 0.5) * 0.7);
        scoredRoomsMap.set(key, {
          type: "room",
          roomNumber: item.roomNumber,
          facilityId: item.facilityId,
          facilityName: item.facilityName,
          facilityType: item.facilityType,
          room: item.room,
          facility: item.facility,
          score: fuzzyScore,
        });
      }
    });
  }

  // 5. Fallback Fuzzy Search for Buildings if few direct building results
  if (buildingResults.length < 2) {
    const buildingResultIds = new Set(
      buildingResults.map((building) => building.facilityId),
    );
    const fuseBuildingResults = searchIndex.buildingFuse.search(query);
    fuseBuildingResults.forEach((res) => {
      const facility = res.item;
      if (!buildingResultIds.has(facility.id)) {
        const facilityItem = searchIndex.facilityItemsById.get(facility.id);
        if (!facilityItem) return;
        const { availableRoomsCount, totalRoomsCount } = facilityItem;

        if (!searchIndex.hasActiveFilters || availableRoomsCount > 0) {
          buildingResults.push({
            type: "building",
            facilityId: facility.id,
            facilityName: facility.name,
            facilityType: facility.type,
            facility,
            score: Math.max(0.45, 1 - (res.score ?? 0.5) * 0.7),
            availableRoomsCount,
            totalRoomsCount,
            matchingRooms: [],
          });
          buildingResultIds.add(facility.id);
        }
      }
    });
  }

  // Convert room map to array and sort
  const allRooms = Array.from(scoredRoomsMap.values()).sort((a, b) => {
    // Primary: Score
    if (Math.abs(b.score - a.score) > 0.08) {
      return b.score - a.score;
    }
    // Secondary: Status Rank (Available first)
    const rankDiff = getStatusRank(b.room.status) - getStatusRank(a.room.status);
    if (rankDiff !== 0) return rankDiff;

    // Tertiary: Room Number alphanumeric sort
    return compareRoomNumbers(a.roomNumber, b.roomNumber);
  });

  // Sort building results
  buildingResults.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.1) {
      return b.score - a.score;
    }
    if (a.facility.isOpen !== b.facility.isOpen) {
      return a.facility.isOpen ? -1 : 1;
    }
    if (b.availableRoomsCount !== a.availableRoomsCount) {
      return b.availableRoomsCount - a.availableRoomsCount;
    }
    return a.facilityName.localeCompare(b.facilityName);
  });

  const matchingRoomsByFacility = new Map<string, SearchResultRoom[]>();
  allRooms.forEach((room) => {
    const rooms = matchingRoomsByFacility.get(room.facilityId) ?? [];
    rooms.push(room);
    matchingRoomsByFacility.set(room.facilityId, rooms);
  });

  // Attach matching rooms to building results for rich preview
  buildingResults.forEach((b) => {
    const matchingRooms = matchingRoomsByFacility.get(b.facilityId) ?? [];
    b.matchingRooms =
      matchingRooms.length > 0 || !searchIndex.hasActiveFilters
        ? matchingRooms
        : searchIndex.eligibleRoomsByFacility.get(b.facilityId) ?? [];
  });

  return {
    buildings: buildingResults,
    rooms: allRooms,
    totalCount: buildingResults.length + allRooms.length,
  };
};

/**
 * Backward-compatible one-shot search. Interactive consumers should prepare an
 * index with createFacilitySearchIndex and reuse searchFacilityIndex.
 */
export const performSearch = (
  facilities: Facility[],
  searchTerm: string,
  filterCriteria: FilterCriteria = {},
  hasActiveFilters: boolean = false,
): SearchResultsData =>
  searchFacilityIndex(
    createFacilitySearchIndex(
      facilities,
      filterCriteria,
      hasActiveFilters,
    ),
    searchTerm,
  );
