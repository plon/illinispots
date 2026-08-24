import { Facility, FacilityRoom, FacilityType, RoomStatus } from "@/types";
import { FilterCriteria, isRoomAvailable } from "@/utils/filterUtils";
import uFuzzy from "@leeoniya/ufuzzy";

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
  "Agricultural Engr Sciences Bld": ["aces bldg", "agricultural engineering"],
  "Grainger Engineering Library": ["grainger", "gel", "grainger library", "engineering library"],
  "Funk ACES Library": ["aces", "funk", "funk library", "aces library", "funk aces"],
  "Main Library": ["main", "main library", "library"],
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
  "Art and Design Building": ["art & design", "art and design"],
  "Architecture Building": ["arch", "architecture"],
  "Psychology Building": ["psych", "psychology"],
  "Newmark Civil Engineering Bldg": ["newmark", "cee", "civil"],
  "Civil & Envir Eng Bldg": ["cee", "hydro", "civil"],
  "Turner Hall": ["turner"],
  "Wymer Hall": ["wymer"],
};

export interface SearchResultRoom {
  roomNumber: string;
  facilityId: string;
  facilityName: string;
  facilityType: FacilityType;
  room: FacilityRoom;
  facility: Facility;
  matchHighlight?: string;
}

export interface SearchResultsData {
  rooms: SearchResultRoom[];
  totalCount: number;
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

const uf = new uFuzzy({ intraMode: 1, intraIns: 1 });

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

/**
 * Filters and searches facilities (e.g. for building favorites dialog).
 */
export const searchFacilities = (facilities: Facility[], searchTerm: string): Facility[] => {
  const query = searchTerm.trim();
  if (!query) return facilities;

  const haystack = facilities.map(
    (facility) => `${facility.name} ${getBuildingAliases(facility.name).join(" ")}`
  );
  const [idxs, info, order] = uf.search(haystack, query, 2);
  if (!idxs || idxs.length === 0) return [];
  if (order && info) {
    return order.map((i) => facilities[info.idx[i]]);
  }
  return idxs.map((i) => facilities[i]);
};

/**
 * Searches across rooms in facilities using uFuzzy.
 */
export const performSearch = (
  facilities: Facility[],
  searchTerm: string,
  filterCriteria: FilterCriteria = {},
  hasActiveFilters: boolean = false,
): SearchResultsData => {
  const query = searchTerm.trim().toLowerCase();
  if (!query) {
    return { rooms: [], totalCount: 0 };
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);

  interface RoomIndexItem {
    roomNumber: string;
    facilityId: string;
    facilityName: string;
    facilityType: FacilityType;
    room: FacilityRoom;
    facility: Facility;
    aliases: string[];
    searchableString: string;
  }

  const roomIndexItems: RoomIndexItem[] = [];

  facilities.forEach((facility) => {
    const aliases = getBuildingAliases(facility.name);

    Object.entries(facility.rooms).forEach(([roomNumber, room]) => {
      if (hasActiveFilters && !isRoomAvailable(room, filterCriteria)) {
        return;
      }

      const groupingInfo = room.type === "library" && room.grouping ? ` ${room.grouping}` : "";
      const searchableString = `${facility.name} ${aliases.join(
        " ",
      )} ${roomNumber} room ${roomNumber}${groupingInfo}`.toLowerCase();

      roomIndexItems.push({
        roomNumber,
        facilityId: facility.id,
        facilityName: facility.name,
        facilityType: facility.type,
        room,
        facility,
        aliases,
        searchableString,
      });
    });
  });

  if (roomIndexItems.length === 0) {
    return { rooms: [], totalCount: 0 };
  }

  const haystack = roomIndexItems.map((item) => item.searchableString);
  const [idxs, info, order] = uf.search(haystack, query, 2);

  if (!idxs || idxs.length === 0) {
    return { rooms: [], totalCount: 0 };
  }

  const matchedIndices = order && info ? order.map((i) => info.idx[i]) : idxs;

  const getMatchPriority = (item: RoomIndexItem): { priority: number; highlight?: string } => {
    const r = item.roomNumber.toLowerCase();
    const facilityNameLower = item.facilityName.toLowerCase();

    // 1. Compound building + room match (e.g. "siebel 1404")
    if (queryTokens.length >= 2) {
      const roomMatched = queryTokens.includes(r) || query.includes(r);
      const buildingMatched = queryTokens.some(
        (t) =>
          facilityNameLower.includes(t) ||
          item.aliases.some((a) => a.includes(t) || t.includes(a)),
      );
      if (roomMatched && buildingMatched) {
        return {
          priority: 2,
          highlight: `${item.facilityName} - Room ${item.roomNumber}`,
        };
      }
    }

    // 2. Direct room match (e.g. "1404" or "room 1404")
    if (r === query || `room ${r}` === query || queryTokens.includes(r)) {
      return {
        priority: 1,
        highlight: `Room ${item.roomNumber}`,
      };
    }

    return { priority: 0 };
  };

  const matchedRooms = matchedIndices.map((idx, rank) => {
    const item = roomIndexItems[idx];
    const { priority, highlight } = getMatchPriority(item);
    return {
      item,
      uFuzzyRank: rank,
      priority,
      highlight,
    };
  });

  matchedRooms.sort((a, b) => {
    // 1. Query specificity priority (compound match > exact room match > broad match)
    if (a.priority !== b.priority) return b.priority - a.priority;

    // 2. Room availability status (Available / Passing Period > Opening Soon > Occupied > Closed)
    const rankDiff = getStatusRank(b.item.room.status) - getStatusRank(a.item.room.status);
    if (rankDiff !== 0) return rankDiff;

    // 3. uFuzzy relevance rank
    if (a.uFuzzyRank !== b.uFuzzyRank) return a.uFuzzyRank - b.uFuzzyRank;

    // 4. Alphanumeric room number sort
    return a.item.roomNumber.localeCompare(b.item.roomNumber, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  const rooms: SearchResultRoom[] = matchedRooms.map(({ item, highlight }) => ({
    roomNumber: item.roomNumber,
    facilityId: item.facilityId,
    facilityName: item.facilityName,
    facilityType: item.facilityType,
    room: item.room,
    facility: item.facility,
    matchHighlight: highlight,
  }));

  return {
    rooms,
    totalCount: rooms.length,
  };
};
